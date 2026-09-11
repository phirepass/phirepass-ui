'use client';

/**
 * Remote desktops, as a body inside the shared session dock.
 *
 * This is the panel the refactor was mostly for. It had no connection
 * indicator, no disconnect and no reconnect; its tabs hid with `display: none`,
 * which is the one way of hiding that breaks a widget by taking its layout away;
 * and its close button was the only way to end anything. None of that was a
 * decision about remote desktops — it was three panels drifting.
 *
 * What is genuinely RDP's and stays here: the fact that its widget is driven by
 * imperative methods rather than events. The two controls those methods back —
 * Ctrl+Alt+Del and browser fullscreen — are rendered by `SessionDock`, because
 * the header they sit in belongs to every kind now; this component's job is to
 * keep `widgetRefs` populated so they have something to call.
 */

import { useEffect, type RefObject } from 'react';
import { defineCustomElements } from 'phirepass-widgets/loader';
import type { PhirepassRdpElement } from '@/types/custom-elements';

import { SessionOverlay, SessionSlot } from './SessionPanel';
import { shouldMount, type Session } from '@/lib/sessions';

interface RdpSessionsProps {
    /** The `rdp` sessions, in open order. */
    sessions: Session[];
    /** The focused tab across every kind — an id that may well not be one of ours. */
    activeId: string | null;
    token: string;
    onReconnect: (id: string) => void;
    /**
     * The dock's registry of live widgets, keyed by session id.
     *
     * Owned by the dock rather than by this component because the controls that
     * call into it live in the dock's header, and a ref that is created here
     * would be gone the moment the last desktop tab closed.
     */
    widgetRefs: RefObject<Map<string, PhirepassRdpElement>>;
}

export function RdpSessions({ sessions, activeId, token, onReconnect, widgetRefs }: RdpSessionsProps) {
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
                            <phirepass-rdp
                                ref={(element: PhirepassRdpElement | null) => {
                                    if (element) {
                                        widgetRefs.current.set(session.id, element);
                                    } else {
                                        widgetRefs.current.delete(session.id);
                                    }
                                }}
                                node-id={session.nodeId}
                                server-id={session.serverId ?? undefined}
                                service-id={session.serviceId}
                                destination={session.destination}
                                token={token}
                                style={{ display: 'block', width: '100%', height: '100%' }}
                            />
                        </div>
                    )}
                    {/*
                      * Like SFTP, the desktop widget reports no connection
                      * state, so the overlay is only for the states the dock's
                      * own controls produce.
                      */}
                    {session.status !== 'connecting' && (
                        <SessionOverlay session={session} onReconnect={onReconnect} />
                    )}
                </SessionSlot>
            ))}
        </>
    );
}
