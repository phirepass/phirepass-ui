'use client';

/**
 * The terminal panel: shells, as a view over the shared session list.
 *
 * It used to own its sessions — `cachedSessions`, its own render-version map,
 * its own connection states — which is why reopening a service reconnected it
 * and why closing the panel behaved differently here than in the file browser.
 * All of that now lives in `lib/sessions.ts`, and the frame lives in
 * `SessionPanel`. What is left is the part that is actually about terminals:
 * mounting `<phirepass-terminal>` and translating its connection events.
 */

import { useEffect } from 'react';
import { Terminal } from 'lucide-react';
import { defineCustomElements } from 'phirepass-widgets/loader';

import { SessionOverlay, SessionPanel, SessionSlot } from './SessionPanel';
import { useSessionToken } from '@/lib/use-session-token';
import { shouldMount, type Session, type SessionStatus } from '@/lib/sessions';

/** What the widget reports. Narrower than our own status: it never says "connecting". */
type TerminalConnectionState = 'connected' | 'disconnected' | 'error';

interface CreateTunnelPanelProps {
    isOpen: boolean;
    onClose: () => void;
    sessions: Session[];
    activeId: string | null;
    onFocus: (id: string) => void;
    onCloseSession: (id: string) => void;
    onDisconnect: (id: string) => void;
    onReconnect: (id: string) => void;
    onStatus: (id: string, status: SessionStatus, error?: string | null) => void;
}

function readConnectionErrorMessage(value: unknown): string | null {
    if (!value) {
        return null;
    }

    if (typeof value === 'string') {
        return value;
    }

    if (value instanceof Error) {
        return value.message;
    }

    if (typeof value === 'object' && 'message' in value) {
        const message = (value as { message?: unknown }).message;
        if (typeof message === 'string') {
            return message;
        }
    }

    return null;
}

export function CreateTunnelPanel({
    isOpen,
    onClose,
    sessions,
    activeId,
    onFocus,
    onCloseSession,
    onDisconnect,
    onReconnect,
    onStatus,
}: CreateTunnelPanelProps) {
    useEffect(() => {
        void defineCustomElements();
    }, []);

    const { token, loading, error, retry } = useSessionToken(sessions.length > 0);
    const active = sessions.find((session) => session.id === activeId) ?? null;

    /*
     * Listeners are attached per mounted widget and re-attached whenever the set
     * of mounted widgets changes — which includes a reconnect, since that
     * replaces the element. Keyed on the ids *and* their generations for exactly
     * that reason: a new element with the same id still needs a new listener.
     */
    const mounted = sessions.filter(shouldMount);
    const mountKey = mounted.map((session) => `${session.id}@${session.generation}`).join(',');

    useEffect(() => {
        if (!token) {
            return;
        }

        const detach: Array<() => void> = [];

        mounted.forEach((session) => {
            const host = document.querySelector(`[data-session="${session.id}"] phirepass-terminal`);
            if (!host) {
                return;
            }

            const handle = (event: Event) => {
                const detail = (event as CustomEvent<[TerminalConnectionState, unknown?]>).detail ?? [];
                const [state, cause] = detail;
                if (!state) {
                    return;
                }

                onStatus(session.id, state, state === 'error' ? readConnectionErrorMessage(cause) : null);
            };

            host.addEventListener('connectionStateChanged', handle);
            detach.push(() => host.removeEventListener('connectionStateChanged', handle));
        });

        return () => detach.forEach((off) => off());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mountKey, token, onStatus]);

    return (
        <SessionPanel
            isOpen={isOpen}
            onClose={onClose}
            title="Connect"
            subtitle={active ? `${active.nodeName} · ${active.serviceName ?? 'SSH'}` : 'Interactive terminal session'}
            icon={<Terminal className="w-5 h-5 text-primary shrink-0" />}
            sessions={sessions}
            activeId={activeId}
            onFocus={onFocus}
            onCloseSession={onCloseSession}
            onDisconnect={onDisconnect}
            onReconnect={onReconnect}
            emptyLabel="Select a node to start a terminal session."
        >
            <div className="relative h-full w-full min-h-0 min-w-0 border border-hairline overflow-hidden bg-black/20">
                {loading && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center text-sm text-muted-foreground">
                        Loading terminal token…
                    </div>
                )}

                {error && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 px-6 text-center text-sm text-destructive">
                        <div>{error}</div>
                        <button className="underline underline-offset-4" onClick={retry}>Retry</button>
                    </div>
                )}

                {token && sessions.map((session) => (
                    <SessionSlot key={session.id} session={session} isActive={session.id === activeId}>
                        {/*
                          * The element is keyed on the generation, so a reconnect
                          * replaces it and everything else — a status change, a
                          * tab switch, the panel closing — leaves it exactly
                          * where it is, holding its socket and its scrollback.
                          */}
                        {shouldMount(session) && (
                            // Keyed on the generation, so a reconnect replaces
                            // the element and nothing else does. The key sits on
                            // this wrapper because the generated JSX types for a
                            // custom element do not carry React's own props.
                            <div key={`${session.id}@${session.generation}`} className="h-full w-full">
                            <phirepass-terminal
                                node-id={session.nodeId}
                                server-id={session.serverId ?? undefined}
                                service-id={session.serviceId}
                                token={token}
                                style={{ display: 'block', width: '100%', height: '100%' }}
                            />
                            </div>
                        )}
                        <SessionOverlay session={session} onReconnect={onReconnect} />
                    </SessionSlot>
                ))}
            </div>
        </SessionPanel>
    );
}
