'use client';

/**
 * Shells, as a body inside the shared session dock.
 *
 * It used to own its sessions — `cachedSessions`, its own render-version map,
 * its own connection states — which is why reopening a service reconnected it
 * and why closing the panel behaved differently here than in the file browser.
 * All of that now lives in `lib/sessions.ts`; the frame lives in `SessionPanel`
 * and the single dock that mounts it is `SessionDock`. What is left is the part
 * that is actually about terminals: mounting `<phirepass-terminal>` and
 * translating its connection events.
 *
 * It renders slots and nothing else — no overlay, no header, no tab strip and no
 * token fetch. Those were three copies before, one per panel, and three copies
 * of a frame is what let the three drift.
 */

import { useEffect } from 'react';
import { defineCustomElements } from 'phirepass-widgets/loader';

import { SessionOverlay, SessionSlot } from './SessionPanel';
import { shouldMount, type Session, type SessionStatus } from '@/lib/sessions';

/** What the widget reports. Narrower than our own status: it never says "connecting". */
type TerminalConnectionState = 'connected' | 'disconnected' | 'error';

interface TerminalSessionsProps {
    /** The `ssh` sessions, in open order. */
    sessions: Session[];
    /** The focused tab across every kind — an id that may well not be one of ours. */
    activeId: string | null;
    token: string;
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

    /*
     * Listeners are attached per mounted widget and re-attached whenever the set
     * of mounted widgets changes — which includes a reconnect, since that
     * replaces the element.
     */
    const mountKey = sessions
        .filter(shouldMount)
        .map((session) => `${session.id}@${session.generation}`)
        .join('|');

    useEffect(() => {
        if (!token) {
            return;
        }

        const detach: (() => void)[] = [];

        sessions.filter(shouldMount).forEach((session) => {
            const host = document.querySelector<HTMLElement>(
                `[data-session="${session.id}"] phirepass-terminal`,
            );

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
        <>
            {sessions.map((session) => (
                <SessionSlot key={session.id} session={session} isActive={session.id === activeId}>
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
        </>
    );
}
