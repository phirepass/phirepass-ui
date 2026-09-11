'use client';

/**
 * Every open connection, in one panel, on one strip.
 *
 * There used to be three panels — a terminal one, a file one, a desktop one —
 * each an `inset-0 z-50` overlay with its own open flag and its own tab strip
 * filtered to its own kind. Two of them open at once meant two full-screen
 * overlays stacked, and the one that happened to render last won: opening a file
 * browser while a shell was open focused a tab on a panel painted *underneath*
 * the one on screen. The tab was real and invisible, which is exactly what "the
 * tabs do not work" looked like from the outside.
 *
 * So there is one dock. It holds every session regardless of kind, in the order
 * they were opened, and the body under the strip is whichever widget the focused
 * tab needs. The three bodies are still three components — an xterm, a file
 * browser and a remote desktop are not interchangeable — but they are no longer
 * three frames.
 *
 * **Closing the dock ends nothing.** The frame never unmounts (`SessionPanel`),
 * so every widget keeps its socket and its scrollback while the panel is off
 * screen; the only thing that ends a session is the tab's ✕, which is
 * `closeSession` in `lib/sessions.ts` and nothing else. That is the rule the
 * Supervisor asked for, and it is enforced by there being no other path.
 */

import { useCallback, useMemo, useRef } from 'react';
import { FolderOpen, Keyboard, Monitor, Scan, Terminal } from 'lucide-react';

import { SessionPanel } from './SessionPanel';
import { TerminalSessions } from './TerminalSessions';
import { FileSessions } from './FileSessions';
import { RdpSessions } from './RdpSessions';
import { Button } from './ui/button';
import { useSessionToken } from '@/lib/use-session-token';
import { sessionsOfKind, type Session, type SessionKind, type SessionStatus } from '@/lib/sessions';
import type { PhirepassRdpElement } from '@/types/custom-elements';

/** What the header says, per kind of focused tab. */
const KIND_TITLE: Record<SessionKind, string> = {
    ssh: 'Terminal',
    sftp: 'Files',
    rdp: 'Remote desktop',
};

const KIND_FALLBACK_SERVICE: Record<SessionKind, string> = {
    ssh: 'SSH',
    sftp: 'SFTP',
    rdp: 'RDP',
};

interface SessionDockProps {
    isOpen: boolean;
    onClose: () => void;
    /** Every session, every kind, in open order. */
    sessions: Session[];
    activeId: string | null;
    onFocus: (id: string) => void;
    onCloseSession: (id: string) => void;
    onDisconnect: (id: string) => void;
    onReconnect: (id: string) => void;
    onStatus: (id: string, status: SessionStatus, error?: string | null) => void;
}

export function SessionDock({
    isOpen,
    onClose,
    sessions,
    activeId,
    onFocus,
    onCloseSession,
    onDisconnect,
    onReconnect,
    onStatus,
}: SessionDockProps) {
    /*
     * One token for the whole dock.
     *
     * It was three fetches, one per panel, for a token that authenticates the
     * account rather than the session — so opening a shell and a file browser
     * asked twice for two interchangeable answers.
     */
    const { token, loading, error, retry } = useSessionToken(sessions.length > 0);

    const widgetRefs = useRef(new Map<string, PhirepassRdpElement>());

    const active = sessions.find((session) => session.id === activeId) ?? null;

    const ssh = useMemo(() => sessionsOfKind(sessions, 'ssh'), [sessions]);
    const sftp = useMemo(() => sessionsOfKind(sessions, 'sftp'), [sessions]);
    const rdp = useMemo(() => sessionsOfKind(sessions, 'rdp'), [sessions]);

    /**
     * Puts the active desktop into browser fullscreen, which is also what lets
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

    const kind = active?.kind ?? 'ssh';
    const Icon = kind === 'sftp' ? FolderOpen : kind === 'rdp' ? Monitor : Terminal;

    return (
        <SessionPanel
            isOpen={isOpen}
            onClose={onClose}
            title={active ? KIND_TITLE[kind] : 'Connections'}
            subtitle={active
                ? `${active.nodeName} · ${active.serviceName ?? KIND_FALLBACK_SERVICE[kind]}`
                : 'Nothing is open yet'}
            icon={<Icon className="w-5 h-5 text-primary shrink-0" />}
            sessions={sessions}
            activeId={activeId}
            onFocus={onFocus}
            onCloseSession={onCloseSession}
            onDisconnect={onDisconnect}
            onReconnect={onReconnect}
            emptyLabel="Open SSH, files or a desktop on a node to start a session."
            // Only the desktop's own two controls are conditional; everything
            // else in the header is shared, which is the point of the frame.
            extraControls={active?.kind === 'rdp' ? (
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
            {/*
              * One positioned container for all three bodies. Every slot inside
              * is `absolute inset-0`, so they stack and the focused one is the
              * only one with opacity — which is what lets a background terminal
              * keep its measured size instead of collapsing to zero height.
              */}
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

                {token && (
                    <>
                        <TerminalSessions
                            sessions={ssh}
                            activeId={activeId}
                            token={token}
                            onReconnect={onReconnect}
                            onStatus={onStatus}
                        />
                        <FileSessions
                            sessions={sftp}
                            activeId={activeId}
                            token={token}
                            onReconnect={onReconnect}
                            onStatus={onStatus}
                        />
                        <RdpSessions
                            sessions={rdp}
                            activeId={activeId}
                            token={token}
                            onReconnect={onReconnect}
                            onStatus={onStatus}
                            widgetRefs={widgetRefs}
                        />
                    </>
                )}
            </div>
        </SessionPanel>
    );
}
