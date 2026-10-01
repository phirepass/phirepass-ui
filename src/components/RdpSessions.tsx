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
import Image from 'next/image';
import { defineCustomElements } from 'phirepass-widgets/loader';
import type { PhirepassRdpElement } from '@/types/custom-elements';

import { SessionOverlay, SessionSlot } from './SessionPanel';
import { useWidgetConnectionState } from '@/hooks/use-widget-connection';
import { shouldMount, type Session, type SessionStatus } from '@/lib/sessions';

interface RdpSessionsProps {
    /** The `rdp` sessions, in open order. */
    sessions: Session[];
    /** The focused tab across every kind — an id that may well not be one of ours. */
    activeId: string | null;
    token: string;
    onReconnect: (id: string) => void;
    onStatus: (id: string, status: SessionStatus, error?: string | null) => void;
    /**
     * The dock's registry of live widgets, keyed by session id.
     *
     * Owned by the dock rather than by this component because the controls that
     * call into it live in the dock's header, and a ref that is created here
     * would be gone the moment the last desktop tab closed.
     */
    widgetRefs: RefObject<Map<string, PhirepassRdpElement>>;
    /**
     * Demo mode: show this still image in place of a live desktop.
     *
     * Not a fake channel like the shell and the file browser get — a desktop's
     * pixels never cross the channel (IronRDP opens its own socket), so there is
     * no seam to answer it from. A screenshot of a real session is the honest
     * stand-in, and the one that looks right in a demo.
     */
    demoImage?: string;
}

export function RdpSessions({ sessions, activeId, token, onReconnect, onStatus, widgetRefs, demoImage }: RdpSessionsProps) {
    useEffect(() => {
        void defineCustomElements();
    }, []);

    useWidgetConnectionState(sessions, 'phirepass-rdp', token, onStatus);

    // A still image has no handshake to wait for, so a demo session is
    // connected as soon as it is mounted — after a beat, so the tab is seen
    // going amber to green as a real one does.
    const mountKey = sessions.filter(shouldMount).map((session) => `${session.id}@${session.generation}`).join('|');
    useEffect(() => {
        if (!demoImage) return;
        const pending = sessions.filter((session) => shouldMount(session) && session.status === 'connecting');
        if (pending.length === 0) return;
        const timer = setTimeout(() => pending.forEach((session) => onStatus(session.id, 'connected')), 700);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [demoImage, mountKey, onStatus]);

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
                            {demoImage ? (
                                <div className="relative h-full w-full bg-black">
                                    <Image
                                        src={demoImage}
                                        alt={`Remote desktop of ${session.nodeName} (sample)`}
                                        fill
                                        sizes="100vw"
                                        className="object-contain"
                                        unoptimized
                                    />
                                </div>
                            ) : (
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
                                />
                            )}
                        </div>
                    )}
                    <SessionOverlay session={session} onReconnect={onReconnect} />
                </SessionSlot>
            ))}
        </>
    );
}
