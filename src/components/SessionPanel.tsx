'use client';

/**
 * The frame every session panel wears: overlay, slide-in, header, tab strip.
 *
 * The three panels were the same component written three times, and the
 * differences between them were all accidents rather than decisions — RDP had no
 * connection indicator and no disconnect, its tabs hid with `display: none`
 * where the terminal's used opacity, and its close button ended the session
 * while the terminal's did something subtly different. Sharing the frame is what
 * makes "the RDP controls should work like the SSH ones" true by construction
 * instead of by remembering to copy the next change across.
 *
 * What each panel still owns is its **body** — an xterm, a file browser, a
 * remote desktop are not interchangeable — and nothing else.
 *
 * Two rules the frame enforces, both load-bearing:
 *
 * - **It is always mounted.** `isOpen` moves it off-screen and stops it taking
 *   pointer events; it never unmounts, because unmounting would take every
 *   session's widget with it and closing the panel must not end a session.
 * - **Inactive tabs hide with opacity, never `display: none`.** An element in a
 *   `display: none` subtree has no layout, and a terminal that measures itself
 *   there fits to a zero-height box and comes back the wrong size.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Maximize2, Minimize2, PlugZap, Unplug, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Session, SessionStatus } from '@/lib/sessions';

/** How long the slide-in runs. Matches the panels it replaced. */
const PANEL_TRANSITION_MS = 500;

const STATUS_LABEL: Record<SessionStatus, string> = {
    connecting: 'connecting',
    connected: 'connected',
    disconnected: 'disconnected',
    error: 'error',
};

const STATUS_TONE: Record<SessionStatus, string> = {
    connecting: 'text-amber-500',
    connected: 'text-emerald-500',
    disconnected: 'text-muted-foreground',
    error: 'text-destructive',
};

export interface SessionPanelProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    subtitle: string;
    icon: ReactNode;
    sessions: Session[];
    activeId: string | null;
    onFocus: (id: string) => void;
    /** The tab's ✕ — ends the session and drops the tab. */
    onCloseSession: (id: string) => void;
    /** Ends the session and keeps the tab. */
    onDisconnect: (id: string) => void;
    onReconnect: (id: string) => void;
    /** The empty state, when nothing of this kind is open. */
    emptyLabel: string;
    /**
     * Controls only one kind of session has, placed before the shared ones.
     *
     * Deliberately narrow. Remote desktop needs a Ctrl+Alt+Del and a real
     * browser-fullscreen — neither is meaningful for a shell, and both are
     * useless without a live session — so they belong to that panel. Anything
     * that *would* make sense for all three belongs in the frame instead, which
     * is the whole reason the frame exists.
     */
    extraControls?: ReactNode;
    children: ReactNode;
}

export function SessionPanel({
    isOpen,
    onClose,
    title,
    subtitle,
    icon,
    sessions,
    activeId,
    onFocus,
    onCloseSession,
    onDisconnect,
    onReconnect,
    emptyLabel,
    extraControls,
    children,
}: SessionPanelProps) {
    const [isPanelVisible, setIsPanelVisible] = useState(false);
    const [isFullScreen, setIsFullScreen] = useState(false);

    /*
     * Reset during render rather than in an effect — React's documented way to
     * adjust state when a prop changes, and the pattern already used elsewhere
     * in this codebase. Doing it in an effect means a frame is painted with the
     * panel still on screen after it was closed, and costs a second render pass
     * to undo.
     */
    const [wasOpen, setWasOpen] = useState(isOpen);
    if (wasOpen !== isOpen) {
        setWasOpen(isOpen);
        if (!isOpen) {
            setIsPanelVisible(false);
            setIsFullScreen(false);
        }
    }

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        // A frame at the off-screen position before transitioning in, or the
        // browser coalesces the two and the panel appears without moving.
        const timeoutId = window.setTimeout(() => setIsPanelVisible(true), 20);
        return () => window.clearTimeout(timeoutId);
    }, [isOpen]);

    const active = sessions.find((session) => session.id === activeId) ?? null;

    return (
        <div className={cn(
            'mb-0 fixed inset-0 z-50 transition-opacity duration-500',
            isOpen ? 'pointer-events-auto' : 'pointer-events-none',
        )}>
            <div
                className={cn(
                    'absolute inset-0 bg-black/55 backdrop-blur-sm transition-all duration-500',
                    isPanelVisible ? 'opacity-100' : 'opacity-0 backdrop-blur-none',
                )}
                onClick={onClose}
                aria-hidden="true"
            />

            <div className="absolute inset-0 flex justify-end pointer-events-none">
                <div
                    className={cn(
                        'h-full min-h-0 min-w-0 bg-card shadow-2xl flex flex-col overflow-hidden border-hairline will-change-transform pointer-events-auto transition-[transform,width,border-radius] ease-[cubic-bezier(0.22,1,0.36,1)]',
                        isFullScreen
                            ? 'w-full border-0 rounded-none'
                            : 'w-full md:w-[700px] lg:w-[900px] border-l rounded-none md:rounded-l-2xl',
                    )}
                    style={{
                        transitionDuration: `${PANEL_TRANSITION_MS}ms`,
                        transform: isPanelVisible ? 'translateX(0)' : 'translateX(110%)',
                    }}
                >
                    <div className="flex items-center justify-between px-4 py-3 border-b border-hairline bg-secondary/50 shrink-0">
                        <div className="flex items-center gap-2 min-w-0">
                            {icon}
                            <div className="min-w-0">
                                <span className="text-sm font-medium">{title}</span>
                                <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                            {extraControls}

                            {active && (
                                <div className="mr-1 flex items-center gap-2 text-xs">
                                    <span className="text-muted-foreground">Connection:</span>
                                    <span className={cn('font-medium', STATUS_TONE[active.status])}>
                                        {STATUS_LABEL[active.status]}
                                    </span>
                                </div>
                            )}

                            {/* Disconnect and reconnect are one button in two
                                states, because they are one decision: this
                                session, on or off. A pair would leave one of
                                them always inert. */}
                            {active && (active.status === 'disconnected' ? (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => onReconnect(active.id)}
                                    aria-label="Reconnect this session"
                                    title="Reconnect"
                                >
                                    <PlugZap className="w-4 h-4" />
                                </Button>
                            ) : (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => onDisconnect(active.id)}
                                    aria-label="Disconnect this session"
                                    title="Disconnect"
                                >
                                    <Unplug className="w-4 h-4" />
                                </Button>
                            ))}

                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setIsFullScreen((previous) => !previous)}
                                aria-label={isFullScreen ? 'Restore panel size' : 'Expand panel'}
                            >
                                {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                            </Button>

                            {/* Closes the panel and nothing else. Every session
                                keeps running; the tab ✕ is what ends one. */}
                            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close panel">
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>

                    {sessions.length > 0 && (
                        <div className="flex items-center gap-1 px-2 py-2 border-b border-hairline bg-background overflow-x-auto shrink-0">
                            {sessions.map((session) => {
                                const label = session.serviceName?.trim() || session.nodeName || session.nodeId;
                                const isActive = session.id === activeId;

                                return (
                                    <div
                                        key={session.id}
                                        className={cn(
                                            'flex shrink-0 items-center gap-2 px-3 py-1.5 rounded-md text-sm cursor-pointer transition-colors group',
                                            isActive
                                                ? 'bg-secondary text-foreground'
                                                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
                                        )}
                                        onClick={() => onFocus(session.id)}
                                    >
                                        {/* The tab says whether its session is
                                            live, so a background one that
                                            dropped is visible without opening
                                            it. */}
                                        <span
                                            className={cn(
                                                'h-1.5 w-1.5 shrink-0 rounded-full',
                                                session.status === 'connected' && 'bg-emerald-500',
                                                session.status === 'connecting' && 'bg-amber-500',
                                                session.status === 'disconnected' && 'bg-muted-foreground/50',
                                                session.status === 'error' && 'bg-destructive',
                                            )}
                                            aria-hidden="true"
                                        />
                                        <span className="font-mono text-xs whitespace-nowrap">{label}</span>
                                        <button
                                            className="opacity-100 mouse:opacity-0 mouse:group-hover:opacity-100 transition-opacity hover:text-destructive"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                onCloseSession(session.id);
                                            }}
                                            aria-label={`Close session ${label}`}
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    <div className="flex-1 min-h-0 min-w-0 overflow-hidden p-4">
                        {sessions.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                                {emptyLabel}
                            </div>
                        ) : children}
                    </div>
                </div>
            </div>
        </div>
    );
}

/**
 * One session's slot in the body: always laid out, visible only when focused.
 *
 * Opacity and `pointer-events`, never `display` or `hidden` — see the note on
 * the panel above. The widget inside keeps its socket and its scrollback for as
 * long as this is rendered, which is what makes switching tabs free.
 */
export function SessionSlot({
    session,
    isActive,
    children,
}: {
    session: Session;
    isActive: boolean;
    children: ReactNode;
}) {
    return (
        <div
            className={cn(
                'absolute inset-0 h-full w-full min-h-0 min-w-0 transition-opacity duration-200',
                isActive ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
            )}
            aria-hidden={isActive ? undefined : true}
            data-session={session.id}
        >
            {children}
        </div>
    );
}

/**
 * What covers the body while a session is not usable.
 *
 * Shown over the widget rather than instead of it, so a reconnecting session
 * does not lose the element it is reconnecting.
 */
export function SessionOverlay({
    session,
    onReconnect,
}: {
    session: Session;
    onReconnect: (id: string) => void;
}) {
    if (session.status === 'connected') {
        return null;
    }

    return (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-card/60 backdrop-blur-[1px]">
            {session.status === 'connecting' && (
                <span className="text-sm text-muted-foreground">Connecting…</span>
            )}

            {session.status === 'disconnected' && (
                <>
                    <span className="text-sm text-muted-foreground">Disconnected</span>
                    <Button variant="outline" size="sm" onClick={() => onReconnect(session.id)}>
                        Reconnect
                    </Button>
                </>
            )}

            {session.status === 'error' && (
                <>
                    <span className="text-sm text-destructive text-center px-6">
                        {session.error || 'This session could not be opened.'}
                    </span>
                    <Button variant="outline" size="sm" onClick={() => onReconnect(session.id)}>
                        Try again
                    </Button>
                </>
            )}
        </div>
    );
}
