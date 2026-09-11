'use client';

/**
 * SFTP, as a body inside the shared session dock.
 *
 * Its tabs used to be held by the nodes page while the terminal's were held by
 * the terminal panel, which is most of why the two behaved differently. Both are
 * now the same list and the same frame; what is left here is mounting
 * `<phirepass-sftp-client>`.
 */

import { useEffect } from 'react';
import { defineCustomElements } from 'phirepass-widgets/loader';

import { SessionOverlay, SessionSlot } from './SessionPanel';
import { shouldMount, type Session } from '@/lib/sessions';

interface FileSessionsProps {
    /** The `sftp` sessions, in open order. */
    sessions: Session[];
    /** The focused tab across every kind — an id that may well not be one of ours. */
    activeId: string | null;
    token: string;
    onReconnect: (id: string) => void;
}

export function FileSessions({ sessions, activeId, token, onReconnect }: FileSessionsProps) {
    useEffect(() => {
        void defineCustomElements();
    }, []);

    return (
        <>
            {sessions.map((session) => (
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
        </>
    );
}
