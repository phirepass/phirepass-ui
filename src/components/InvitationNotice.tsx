'use client';

/**
 * What an invitation link says once it has landed.
 *
 * `/invite/[token]` is a redirect: it accepts the invitation and drops the
 * reader into the dashboard, which is the whole point — but a silent arrival is
 * the same complaint the route was written to fix, because the only visible
 * difference is a workspace name in a header nobody was watching. The outcome
 * travels in a short-lived cookie and is spoken here, once, then deleted.
 *
 * A cookie rather than a query parameter because the layout rewrites the
 * address bar (`history.replaceState`) as soon as the profile lands, and it does
 * that before this ever mounts — a parameter would be gone by the time anything
 * could read it.
 */

import { useEffect } from 'react';
import { toast } from 'sonner';

import { INVITATION_NOTICE_COOKIE } from '@/app/lib/invitation-link';

/** The outcomes worth celebrating; everything else is an explanation. */
const SUCCESS = new Set(['joined', 'switched']);

function message(outcome: string, workspace: string | null): string {
    const named = workspace ? `"${workspace}"` : 'that workspace';

    switch (outcome) {
        case 'joined':
            return `You have joined ${named}.`;
        case 'switched':
            return `You are already a member of ${named} — switched to it.`;
        case 'mismatch':
            return 'That invitation was sent to a different address. Sign in with the address it was sent to.';
        case 'suspended':
            return `Your access to ${named} has been suspended. Ask an administrator there to reinstate you.`;
        case 'revoked':
            return `The invitation to ${named} was withdrawn.`;
        case 'expired':
            return `The invitation to ${named} has expired. Ask for a new one.`;
        default:
            return 'That invitation link is no longer valid. Ask for a new one.';
    }
}

function readNotice(): string | null {
    try {
        for (const part of document.cookie.split(';')) {
            const eq = part.indexOf('=');
            if (eq === -1) continue;
            if (part.slice(0, eq).trim() !== INVITATION_NOTICE_COOKIE) continue;
            return decodeURIComponent(part.slice(eq + 1).trim()) || null;
        }
    } catch {
        // A browser that will not hand over `document.cookie` simply gets no
        // notice; it is not worth failing a dashboard over.
    }

    return null;
}

export function InvitationNotice() {
    useEffect(() => {
        const notice = readNotice();
        if (!notice) return;

        // Host-only and path-/, exactly as the route wrote it, so this deletes
        // rather than shadowing it with a second cookie that outlives the first.
        document.cookie = `${INVITATION_NOTICE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;

        // `outcome` or `outcome:workspace name` — split once, because a
        // workspace is free to have a colon in its name.
        const separator = notice.indexOf(':');
        const outcome = separator === -1 ? notice : notice.slice(0, separator);
        const workspace = separator === -1 ? null : notice.slice(separator + 1) || null;

        const text = message(outcome, workspace);

        if (SUCCESS.has(outcome)) {
            toast.success(text);
        } else {
            // Longer than the default: these say what to do next, and the
            // default four seconds is not enough to read and act on.
            toast.error(text, { duration: 8000 });
        }
    }, []);

    return null;
}
