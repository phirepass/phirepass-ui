'use client';

/**
 * Shells, as a body inside the shared session dock.
 *
 * It used to own its sessions — `cachedSessions`, its own render-version map,
 * its own connection states — which is why reopening a service reconnected it
 * and why closing the panel behaved differently here than in the file browser.
 * All of that now lives in `lib/sessions.ts`; the frame lives in `SessionPanel`
 * and the single dock that mounts it is `SessionDock`. What is left is the part
 * that is actually about terminals: mounting `<phirepass-terminal>`.
 *
 * It renders slots and nothing else — no overlay, no header, no tab strip and no
 * token fetch. Those were three copies before, one per panel, and three copies
 * of a frame is what let the three drift.
 */

import { useEffect } from 'react';
import { defineCustomElements } from 'phirepass-widgets/loader';

import { SessionOverlay, SessionSlot } from './SessionPanel';
import { useWidgetConnectionState } from '@/hooks/use-widget-connection';
import { shouldMount, type Session, type SessionStatus } from '@/lib/sessions';

interface TerminalSessionsProps {
    /** The `ssh` sessions, in open order. */
    sessions: Session[];
    /** The focused tab across every kind — an id that may well not be one of ours. */
    activeId: string | null;
    token: string;
    onReconnect: (id: string) => void;
    onStatus: (id: string, status: SessionStatus, error?: string | null) => void;
}

export function TerminalSessions({
    sessions,
    activeId,
    token,
    onReconnect,
    onStatus,
}: TerminalSessionsProps) {
    useEffect(() => {
        void defineCustomElements();
    }, []);

    useWidgetConnectionState(sessions, 'phirepass-terminal', token, onStatus);

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
                            {/*
                              * No inline style. The widget's own `:host` is a
                              * full-size **column flex** container, and the
                              * `display: block` that used to be set here beat
                              * it — at which point the `flex: 1` on the element
                              * holding xterm meant nothing, that element fell
                              * back to `height: auto`, and the session sized
                              * itself to its own content: xterm's default 24
                              * rows, in a panel with room for three times that.
                              * The fit then measured the auto-sized box, agreed
                              * with itself, and never grew.
                              */}
                            <phirepass-terminal
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
