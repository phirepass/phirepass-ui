'use client';

/**
 * The file browser panel: SFTP, as a view over the shared session list.
 *
 * Its tabs used to be held by the nodes page while the terminal's were held by
 * the terminal panel, which is most of why the two behaved differently. Both are
 * now the same list and the same frame; what is left here is mounting
 * `<phirepass-sftp-client>`.
 */

import { useEffect } from 'react';
import { FolderOpen } from 'lucide-react';
import { defineCustomElements } from 'phirepass-widgets/loader';

import { SessionOverlay, SessionPanel, SessionSlot } from './SessionPanel';
import { useSessionToken } from '@/lib/use-session-token';
import { shouldMount, type Session } from '@/lib/sessions';

interface FilePanelProps {
    isOpen: boolean;
    onClose: () => void;
    sessions: Session[];
    activeId: string | null;
    onFocus: (id: string) => void;
    onCloseSession: (id: string) => void;
    onDisconnect: (id: string) => void;
    onReconnect: (id: string) => void;
}

export function FilePanel({
    isOpen,
    onClose,
    sessions,
    activeId,
    onFocus,
    onCloseSession,
    onDisconnect,
    onReconnect,
}: FilePanelProps) {
    useEffect(() => {
        void defineCustomElements();
    }, []);

    const { token, loading, error, retry } = useSessionToken(sessions.length > 0);
    const active = sessions.find((session) => session.id === activeId) ?? null;

    return (
        <SessionPanel
            isOpen={isOpen}
            onClose={onClose}
            title="Files"
            subtitle={active ? `${active.nodeName} · ${active.serviceName ?? 'SFTP'}` : 'Browse and transfer files'}
            icon={<FolderOpen className="w-5 h-5 text-primary shrink-0" />}
            sessions={sessions}
            activeId={activeId}
            onFocus={onFocus}
            onCloseSession={onCloseSession}
            onDisconnect={onDisconnect}
            onReconnect={onReconnect}
            emptyLabel="Select a node to browse its files."
        >
            <div className="relative h-full w-full min-h-0 min-w-0 border border-hairline overflow-hidden bg-black/20">
                {loading && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center text-sm text-muted-foreground">
                        Loading session token…
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
                        {shouldMount(session) && (
                            // Keyed on the generation, so a reconnect replaces
                            // the element and nothing else does. The key sits on
                            // this wrapper because the generated JSX types for a
                            // custom element do not carry React's own props.
                            <div key={`${session.id}@${session.generation}`} className="h-full w-full">
                            <phirepass-sftp-client
                                hide-header
                                node-id={session.nodeId}
                                server-id={session.serverId ?? undefined}
                                service-id={session.serviceId}
                                token={token}
                                style={{ display: 'block', width: '100%', height: '100%' }}
                            />
                            </div>
                        )}
                        {/*
                          * The SFTP widget reports no connection state, so a
                          * session here is only ever `connecting` until somebody
                          * disconnects it. The overlay is still rendered, for the
                          * disconnected and error states that `disconnect` and
                          * `reconnect` produce.
                          */}
                        {session.status !== 'connecting' && (
                            <SessionOverlay session={session} onReconnect={onReconnect} />
                        )}
                    </SessionSlot>
                ))}
            </div>
        </SessionPanel>
    );
}
