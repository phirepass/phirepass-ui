'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import initChannel, { Channel } from 'phirepass-channel';

import { useRuntimeConfig } from '@/components/RuntimeConfigProvider';
import type { DownloadSettings, NodeSettingsView } from '@/lib/download-settings';

import { wsEndpoint } from './use-download-feed';

/**
 * A node's download settings, live while the panel is open (T1.21).
 *
 * One socket to the node's server: `DownloadSettingsGet` on open, then every
 * `DownloadSettingsState` the server pushes, which is how the node's answer
 * to a save (applied, or refused with a field and a reason) reaches the form.
 * The browser never talks to the server's HTTP port, so this is the save path
 * rather than `PUT /api/fetch/settings`.
 *
 * The `send_download_settings_*` methods are newer than the pinned
 * `phirepass-channel`, so they are found at runtime, as the Downloads page
 * does with its own.
 */

export type SettingsConnection = 'connecting' | 'ready' | 'unsupported' | 'error';

interface SettingsChannel {
    send_download_settings_get(nodeId: string, msgId: number | null): void;
    send_download_settings_save(nodeId: string, settings: unknown, msgId: number | null): void;
}

function hasSettingsMethods(channel: unknown): channel is SettingsChannel {
    const c = channel as Record<string, unknown>;
    return typeof c.send_download_settings_get === 'function' && typeof c.send_download_settings_save === 'function';
}

interface Pending {
    msgId: number;
    resolve: () => void;
    reject: (e: Error) => void;
}

/** Mount it only while the panel is open: it connects on mount. */
export function useNodeSettings(node: { id: string; server_id?: string | null }) {
    const { config } = useRuntimeConfig();
    const [view, setView] = useState<NodeSettingsView | null>(null);
    const [connection, setConnection] = useState<SettingsConnection>('connecting');
    const [error, setError] = useState<string | null>(null);
    const channelRef = useRef<(SettingsChannel & Channel) | null>(null);
    const pendingRef = useRef<Pending | null>(null);
    const nextMsg = useRef(1);

    useEffect(() => {
        let disposed = false;
        let channel: Channel | null = null;

        const fail = (message: string) => {
            if (disposed) return;
            setConnection('error');
            setError(message);
            pendingRef.current?.reject(new Error(message));
            pendingRef.current = null;
        };

        void (async () => {
            try {
                const res = await fetch('/api/auth/websocket-token', { credentials: 'same-origin', cache: 'no-store' });
                const { token } = await res.json() as { token?: string };
                if (!token) throw new Error('Not signed in.');
                await initChannel();
                if (disposed) return;
                channel = new Channel(wsEndpoint(config), node.id, node.server_id ?? null);
                if (!hasSettingsMethods(channel)) {
                    setConnection('unsupported');
                    return;
                }
                const live = channel as unknown as SettingsChannel & Channel;
                live.on_connection_open(() => live.authenticate(token, node.id));
                live.on_protocol_message_type('AuthSuccess', () => {
                    channelRef.current = live;
                    live.send_download_settings_get(node.id, nextMsg.current++);
                });
                live.on_protocol_message_type('DownloadSettingsState', (data: {
                    msg_id: number | null; node_id: string; state: NodeSettingsView;
                }) => {
                    if (disposed || data.node_id !== node.id) return;
                    setView(data.state);
                    setConnection('ready');
                    const pending = pendingRef.current;
                    if (pending && data.msg_id === pending.msgId) {
                        pendingRef.current = null;
                        pending.resolve();
                    }
                });
                live.on_protocol_message_type('Error', (data: { message?: string; msg_id?: number | null }) => {
                    const pending = pendingRef.current;
                    const message = data.message ?? 'The server refused.';
                    if (pending && data.msg_id === pending.msgId) {
                        pendingRef.current = null;
                        pending.reject(new Error(message));
                    } else if (!disposed) {
                        setConnection((c) => (c === 'ready' ? c : 'error'));
                        setError(message);
                    }
                });
                live.on_connection_error(() => fail('Could not reach the server.'));
                live.on_connection_close(() => {
                    channelRef.current = null;
                    fail('The connection closed. Close and reopen to try again.');
                });
                live.connect();
            } catch (e) {
                fail(e instanceof Error ? e.message : 'Could not reach the server.');
            }
        })();

        return () => {
            disposed = true;
            channelRef.current = null;
            pendingRef.current = null;
            channel?.disconnect();
        };
    }, [node.id, node.server_id, config]);

    /** Resolves once the server stored it; the node's verdict follows in `view`. */
    const save = useCallback((settings: DownloadSettings) => new Promise<void>((resolve, reject) => {
        const live = channelRef.current;
        if (!live) {
            reject(new Error('Not connected.'));
            return;
        }
        const msgId = nextMsg.current++;
        pendingRef.current = { msgId, resolve, reject };
        live.send_download_settings_save(node.id, settings, msgId);
    }), [node.id]);

    return { view, connection, error, save };
}
