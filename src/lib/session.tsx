'use client';

/**
 * The signed-in session, as the browser knows it: who you are, which
 * organisation you are in, and what role you hold there.
 *
 * `GET /api/profile` is the source. The dashboard layout already fetched it to
 * put a name in the header; it now publishes the whole answer here so that
 * `can(useCurrentRole(), …)` has something real behind it instead of the
 * hardcoded `'owner'` that stood in while organisations did not exist.
 *
 * This is a **UI affordance, not access control**. Every gated route calls
 * `requirePermission` server-side with the same constant (`src/app/lib/authz.ts`);
 * what this buys is not showing somebody a button that would answer 403.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';

import type { Role } from '@/lib/rbac';
import type { Organization } from '@/types/org';

export interface SessionValue {
    userId: string | null;
    email: string | null;
    username: string | null;
    avatarUrl: string | null;
    org: Organization | null;
    role: Role | null;
    /** True until `/api/profile` has answered. */
    loading: boolean;
}

const EMPTY: SessionValue = {
    userId: null,
    email: null,
    username: null,
    avatarUrl: null,
    org: null,
    role: null,
    loading: true,
};

const SessionContext = createContext<SessionValue>(EMPTY);

export function SessionProvider({ value, children }: { value: SessionValue; children: ReactNode }) {
    // The object identity is what every consumer re-renders on, so it is derived
    // from the fields rather than passed straight through — a layout that
    // rebuilds this object each render would otherwise re-render the whole
    // dashboard on every keystroke somewhere above it.
    const memo = useMemo(
        () => value,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [value.userId, value.email, value.username, value.avatarUrl, value.role, value.org?.id, value.org?.name, value.loading],
    );

    return <SessionContext.Provider value={memo}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
    return useContext(SessionContext);
}

/**
 * The signed-in account's role in the organisation its session is scoped to.
 *
 * Answers `member` — the least privileged role — outside the provider and while
 * the profile is still in flight, so a surface that renders early shows the
 * smallest set of affordances and then grows, rather than offering a control
 * that turns out not to be there. Reach for `useSession()` where the difference
 * between "not loaded" and "loaded, and they are a member" matters.
 */
export function useCurrentRole(): Role {
    return useContext(SessionContext).role ?? 'member';
}

/** The organisation the session is scoped to, or null before it has loaded. */
export function useCurrentOrg(): Organization | null {
    return useContext(SessionContext).org;
}

/** The signed-in account's own user id — what "is this me?" is asked against. */
export function useCurrentUserId(): string | null {
    return useContext(SessionContext).userId;
}

/**
 * The wire shape of `GET /api/profile`, narrowed to what this context needs.
 *
 * Every field is optional because the same endpoint answers from the demo
 * fixture, and because a browser holding a page from before a deploy will
 * happily call the new one. An absent `role` leaves the session unresolved,
 * which reads as `member`.
 */
export interface ProfileResponse {
    id?: string;
    email?: string;
    username?: string;
    avatar_url?: string;
    org?: Organization | null;
    role?: Role | null;
}

export function sessionFromProfile(data: ProfileResponse | null): SessionValue {
    if (!data) return { ...EMPTY, loading: false };

    return {
        userId: data.id ?? null,
        email: data.email ?? null,
        username: data.username ?? null,
        avatarUrl: data.avatar_url ?? null,
        org: data.org ?? null,
        role: data.role ?? null,
        loading: false,
    };
}
