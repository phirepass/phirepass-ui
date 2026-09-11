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
import { useWidgetConnectionState } from '@/hooks/use-widget-connection';
import { shouldMount, type Session, type SessionStatus } from '@/lib/sessions';

interface FileSessionsProps {
    /** The `sftp` sessions, in open order. */
    sessions: Session[];
    /** The focused tab across every kind — an id that may well not be one of ours. */
    activeId: string | null;
    token: string;
    onReconnect: (id: string) => void;
    onStatus: (id: string, status: SessionStatus, error?: string | null) => void;
}

export function FileSessions({ sessions, activeId, token, onReconnect, onStatus }: FileSessionsProps) {
    useEffect(() => {
        void defineCustomElements();
    }, []);

    useWidgetConnectionState(sessions, 'phirepass-sftp-client', token, onStatus);

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
                            />
                        </div>
                    )}
                    <SessionOverlay session={session} onReconnect={onReconnect} />
                </SessionSlot>
            ))}
        </>
    );
}
