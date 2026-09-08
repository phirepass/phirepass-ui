'use client';

/**
 * The remote desktop panel: RDP, as a view over the shared session list.
 *
 * This is the panel the refactor was mostly for. It had no connection
 * indicator, no disconnect and no reconnect; its tabs hid with `display: none`,
 * which is the one way of hiding that breaks a widget by taking its layout away;
 * and its close button was the only way to end anything. None of that was a
 * decision about remote desktops — it was three panels drifting.
 *
 * What is genuinely RDP's and stays here: the two controls a shell has no use
 * for, and the fact that its widget is driven by imperative methods rather than
 * events.
 */

import { useCallback, useEffect, useRef } from 'react';
import { Keyboard, Monitor, Scan } from 'lucide-react';
import { defineCustomElements } from 'phirepass-widgets/loader';
import type { PhirepassRdpElement } from '@/types/custom-elements';

import { SessionOverlay, SessionPanel, SessionSlot } from './SessionPanel';
import { Button } from './ui/button';
import { useSessionToken } from '@/lib/use-session-token';
import { shouldMount, type Session } from '@/lib/sessions';

interface RdpPanelProps {
    isOpen: boolean;
    onClose: () => void;
    sessions: Session[];
    activeId: string | null;
    onFocus: (id: string) => void;
    onCloseSession: (id: string) => void;
    onDisconnect: (id: string) => void;
    onReconnect: (id: string) => void;
}

export function RdpPanel({
    isOpen,
    onClose,
    sessions,
    activeId,
    onFocus,
    onCloseSession,
    onDisconnect,
    onReconnect,
}: RdpPanelProps) {
    const widgetRefs = useRef(new Map<string, PhirepassRdpElement>());

    useEffect(() => {
        void defineCustomElements();
    }, []);

    const { token, loading, error, retry } = useSessionToken(sessions.length > 0);
    const active = sessions.find((session) => session.id === activeId) ?? null;

    /**
     * Puts the active session into browser fullscreen, which is also what lets
     * the widget claim the shortcuts the browser normally keeps (Ctrl+W,
     * Alt+Tab). It has to be driven from a click: browsers only grant
     * fullscreen — and therefore the keyboard lock — to a user gesture.
     */
    const toggleWidgetFullScreen = useCallback(() => {
        if (!activeId) {
            return;
        }

        void widgetRefs.current.get(activeId)?.toggleFullscreen();
    }, [activeId]);

    /**
     * Ctrl+Alt+Del cannot be typed into a remote desktop from a browser at all:
     * the operating system takes it as a secure attention sequence before any
     * page sees it, and the fullscreen keyboard lock does not extend to it. It
     * is also how a locked Windows session is unlocked, so without a control
     * here that desktop cannot be reached.
     */
    const sendCtrlAltDel = useCallback(() => {
        if (!activeId) {
            return;
        }

        void widgetRefs.current.get(activeId)?.sendCtrlAltDel();
    }, [activeId]);

    return (
        <SessionPanel
            isOpen={isOpen}
            onClose={onClose}
            title="Remote desktop"
            subtitle={active ? `${active.nodeName} · ${active.serviceName ?? 'RDP'}` : 'Interactive desktop session'}
            icon={<Monitor className="w-5 h-5 text-primary shrink-0" />}
            sessions={sessions}
            activeId={activeId}
            onFocus={onFocus}
            onCloseSession={onCloseSession}
            onDisconnect={onDisconnect}
            onReconnect={onReconnect}
            emptyLabel="Select a node to open its desktop."
            extraControls={active ? (
                <>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={sendCtrlAltDel}
                        aria-label="Send Ctrl+Alt+Del"
                        title="Send Ctrl+Alt+Del"
                    >
                        <Keyboard className="w-4 h-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={toggleWidgetFullScreen}
                        aria-label="Fullscreen this desktop"
                        title="Fullscreen (captures browser shortcuts)"
                    >
                        <Scan className="w-4 h-4" />
                    </Button>
                </>
            ) : null}
        >
            <div className="relative h-full w-full min-h-0 min-w-0 border border-hairline overflow-hidden bg-black/20">
                {loading && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center text-sm text-muted-foreground">
                        Loading remote screen…
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
                          * state, so the overlay is only for the states this
                          * panel's own controls produce.
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
