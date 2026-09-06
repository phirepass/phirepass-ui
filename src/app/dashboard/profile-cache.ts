import type { SessionValue } from '@/lib/session';

export type ProfileUser = { name: string | null; email: string | null; avatar: string | null };

// Cached across DashboardLayout mounts within the same browser session, so navigating
// in and out of /dashboard doesn't re-hit /api/profile (and re-verify the auth cookie)
// every time. Cleared on logout.
let cachedProfile: ProfileUser | null = null;
let cachedSession: SessionValue | null = null;

export function getCachedProfile(): ProfileUser | null {
    return cachedProfile;
}

export function setCachedProfile(user: ProfileUser | null) {
    cachedProfile = user;

    // Clearing the identity clears the session that came with it. Leaving a
    // role behind after a sign-out is how the next page load decides somebody
    // is still an owner.
    if (user === null) {
        cachedSession = null;
    }
}

/**
 * The organisation and role that came back with the same `/api/profile` call.
 *
 * Cached beside the header identity rather than in it, because they answer a
 * different question — `useCurrentRole()` reads this, the header reads the
 * other — and because clearing one must clear the other: a session cached from
 * before a sign-out would otherwise leave the next visitor's page thinking they
 * are still an owner. `setCachedProfile(null)` is the only clear, and it drops
 * both.
 */
export function getCachedSession(): SessionValue | null {
    return cachedSession;
}

export function setCachedSession(session: SessionValue | null) {
    cachedSession = session;
}
