'use client';

/**
 * Turn a widget's `connectionStateChanged` into a session status.
 *
 * All three widgets emit it — terminal, file browser and desktop alike, each on
 * its channel opening, closing or erroring — but only the terminal panel ever
 * listened. The other two therefore sat on the `connecting` they were created
 * with for as long as they were open: an amber dot and a "Connecting…" overlay
 * over a desktop that had been usable for minutes. Comments in both panels said
 * the widget "reports no connection state", which was true of an older version
 * of them and is not true now.
 *
 * So the listening lives here, once, instead of being written a third time. It
 * is deliberately not in `SessionSlot`: the slot is a box, and what is inside it
 * is the panel's business.
 */

import { useEffect } from 'react';

import { shouldMount, type Session, type SessionStatus } from '@/lib/sessions';

/** What the widgets report. Narrower than our own status: they never say "connecting". */
type WidgetConnectionState = 'connected' | 'disconnected' | 'error';

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

export function useWidgetConnectionState(
    sessions: Session[],
    tag: 'phirepass-terminal' | 'phirepass-sftp-client' | 'phirepass-rdp',
    token: string,
    onStatus: (id: string, status: SessionStatus, error?: string | null) => void,
) {
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
            const host = document.querySelector<HTMLElement>(`[data-session="${session.id}"] ${tag}`);

            if (!host) {
                return;
            }

            const handle = (event: Event) => {
                const detail = (event as CustomEvent<[WidgetConnectionState, unknown?]>).detail ?? [];
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
    }, [mountKey, tag, token, onStatus]);
}
