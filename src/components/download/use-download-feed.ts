'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import initChannel, { Channel } from 'phirepass-channel';

import { useRuntimeConfig } from '@/components/RuntimeConfigProvider';
import type { PublicRuntimeConfig } from '@/lib/runtime-config';

import type { LinkLogin } from './add-download';
import type { TunnelNode } from '@/types/node';

import { applyProgress, mergeRow, type DownloadApiRow, type DownloadItem, type JobView, type NodeView } from './download-display';

/**
 * The Downloads page's data: one read of `GET /api/downloads`, then live
 * `DownloadProgress` frames over one WebSocket subscribed to `All`.
 *
 * The socket authenticates against one node the person may download on (the
 * server's Auth needs a node), and the subscription then covers every node the
 * server will show them. Commands (stop, resume, delete, start) go out as
 * frames on the same socket; nothing here writes to the dashboard's database.
 *
 * The `send_download_*` methods arrived in `phirepass-channel` after the
 * version this dashboard pins, so they are found at runtime. Without them the
 * page still lists what the API returned and says live updates are not
 * available yet.
 */

export interface DownloadNode extends NodeView {
    serverId: string | null;
    /** The node has Downloads on and this session was lent them. */
    downloads: boolean;
    torrents: boolean;
}

export type FeedState = 'loading' | 'connecting' | 'live' | 'reconnecting' | 'unsupported' | 'no-nodes' | 'demo';

export type StartSource = { Http: { url: string; save_as: string | null } } | { Magnet: { uri: string } };

interface DownloadChannel {
    send_download_subscribe(scope: unknown): void;
    send_download_stop(downloadId: string, discard: boolean, msgId: number | null): void;
    send_download_resume(downloadId: string, ignoreWindow: boolean, msgId: number | null): void;
    send_download_delete(downloadId: string, deleteFile: boolean, msgId: number | null): void;
    send_download_start(
        nodeId: string, source: unknown, subDir: string | null, browsing: unknown,
        inOrder: boolean | null, options: unknown, msgId: number | null,
    ): void;
}

function hasDownloadMethods(channel: unknown): channel is DownloadChannel {
    const c = channel as Record<string, unknown>;
    return typeof c.send_download_subscribe === 'function' && typeof c.send_download_start === 'function';
}

/** The same address the Nodes page opens sessions on. */
export function wsEndpoint(config: Partial<PublicRuntimeConfig>): string {
    const explicit = config.NEXT_PUBLIC_WS_URL?.trim();
    if (explicit) return `${explicit.replace(/\/$/, '')}/api/web/ws`;
    const https = window.location.protocol === 'https:';
    const host = config.NEXT_PUBLIC_SERVER_HOST || window.location.hostname;
    const port = config.NEXT_PUBLIC_SERVER_PORT || (https ? '443' : '8080');
    return `${https ? 'wss:' : 'ws:'}//${host}:${port}/api/web/ws`;
}

function toNode(node: TunnelNode): DownloadNode {
    const services = node.services ?? {};
    return {
        id: node.id,
        name: node.name || node.id.slice(0, 8),
        online: node.status ? node.status === 'online' : node.is_online,
        serverId: node.server_id ?? null,
        downloads: (services.FETCH ?? 0) > 0,
        torrents: (services.TORRENT ?? 0) > 0,
    };
}

/** The first paint: nodes (for names, online, switches) and the visible rows. */
async function fetchFeed(): Promise<{ nodes: DownloadNode[]; items: DownloadItem[]; available: boolean }> {
    const [nodesRes, downloadsRes] = await Promise.all([fetch('/api/nodes'), fetch('/api/downloads')]);
    if (!nodesRes.ok || !downloadsRes.ok) throw new Error('Could not load downloads.');
    const nodes = (await nodesRes.json() as TunnelNode[]).map(toNode);
    const payload = await downloadsRes.json() as { downloads: DownloadApiRow[]; available: boolean };
    return { nodes, items: payload.downloads.map(mergeRow), available: payload.available };
}

const RECONNECT_MS = [2_000, 5_000, 15_000, 30_000];

export function useDownloadFeed(demo: boolean) {
    const { config } = useRuntimeConfig();
    const endpoint = typeof window === 'undefined' ? '' : wsEndpoint(config);
    const [nodes, setNodes] = useState<DownloadNode[]>([]);
    const [items, setItems] = useState<DownloadItem[]>([]);
    const [available, setAvailable] = useState(true);
    const [state, setState] = useState<FeedState>('loading');
    const [error, setError] = useState<string | null>(null);
    const channelRef = useRef<DownloadChannel | null>(null);

    useEffect(() => {
        let disposed = false;
        let channel: Channel | null = null;
        let attempt = 0;
        let timer: ReturnType<typeof setTimeout> | undefined;

        const connect = async (nodeList: DownloadNode[]) => {
            const anchor = nodeList.find((n) => n.downloads && n.online) ?? nodeList.find((n) => n.downloads);
            if (!anchor) {
                setState('no-nodes');
                return;
            }
            try {
                const tokenRes = await fetch('/api/auth/websocket-token', { credentials: 'same-origin', cache: 'no-store' });
                const { token } = await tokenRes.json() as { token?: string };
                if (!token) throw new Error('no token');
                await initChannel();
                if (disposed) return;

                channel = new Channel(endpoint, anchor.id, anchor.serverId);
                if (!hasDownloadMethods(channel)) {
                    channel = null;
                    setState('unsupported');
                    return;
                }
                const live = channel as unknown as DownloadChannel & Channel;

                live.on_connection_open(() => live.authenticate(token, anchor.id));
                live.on_protocol_message_type('AuthSuccess', () => {
                    attempt = 0;
                    channelRef.current = live;
                    live.send_download_subscribe('All');
                    setState('live');
                });
                live.on_protocol_message_type('DownloadProgress', (data: { node_id: string; job: JobView }) => {
                    setItems((current) => applyProgress(current, data.node_id, data.job));
                });
                live.on_protocol_message_type('Error', (data: { message?: string }) => {
                    if (data.message) setError(data.message);
                });
                live.on_connection_close(() => {
                    channelRef.current = null;
                    if (disposed) return;
                    setState('reconnecting');
                    const wait = RECONNECT_MS[Math.min(attempt++, RECONNECT_MS.length - 1)];
                    // Reload too: frames missed while away are not replayed, but
                    // a fresh subscribe re-sends every row.
                    timer = setTimeout(() => void connect(nodeList), wait);
                });
                setState('connecting');
                live.connect();
            } catch {
                if (!disposed) setState('reconnecting');
                timer = setTimeout(() => void connect(nodeList), RECONNECT_MS[Math.min(attempt++, RECONNECT_MS.length - 1)]);
            }
        };

        fetchFeed().then(
            (feed) => {
                if (disposed) return;
                setNodes(feed.nodes);
                setItems(feed.items);
                setAvailable(feed.available);
                if (demo) setState('demo');
                else void connect(feed.nodes);
            },
            (e: unknown) => {
                if (disposed) return;
                setError(e instanceof Error ? e.message : 'Could not load downloads.');
                setState('no-nodes');
            },
        );

        return () => {
            disposed = true;
            clearTimeout(timer);
            channelRef.current = null;
            channel?.disconnect();
        };
    }, [demo, endpoint]);

    /** Runs `send` on the live socket, or explains why it cannot. */
    const command = useCallback((send: (channel: DownloadChannel) => void): boolean => {
        const channel = channelRef.current;
        if (!channel) {
            setError('Not connected to the server. Try again in a moment.');
            return false;
        }
        send(channel);
        return true;
    }, []);

    return {
        nodes,
        items,
        available,
        state,
        error,
        clearError: () => setError(null),
        stop: (id: string) => command((c) => c.send_download_stop(id, false, null)),
        resume: (id: string) => command((c) => c.send_download_resume(id, false, null)),
        /** Retrying, or waiting for its window: start the next attempt now. */
        tryNow: (id: string) => command((c) => c.send_download_resume(id, true, null)),
        remove: (id: string) => command((c) => c.send_download_delete(id, false, null)),
        /** `auth` is a link's login (U3); the node seals it, nothing here keeps it. */
        start: (nodeId: string, source: StartSource, inOrder: boolean | null, auth: LinkLogin | null = null) =>
            command((c) => c.send_download_start(nodeId, source, null, null, inOrder, { source_auth: auth, ignore_window: false }, null)),
    };
}
