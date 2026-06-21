export type ProfileUser = { name: string | null; email: string | null; avatar: string | null };

// Cached across DashboardLayout mounts within the same browser session, so navigating
// in and out of /dashboard doesn't re-hit /api/profile (and re-verify the auth cookie)
// every time. Cleared on logout.
let cachedProfile: ProfileUser | null = null;

export function getCachedProfile(): ProfileUser | null {
    return cachedProfile;
}

export function setCachedProfile(user: ProfileUser | null) {
    cachedProfile = user;
}
