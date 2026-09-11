"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { Header } from "@/components/Header";
import { InvitationNotice } from "@/components/InvitationNotice";
import { InstallBanner } from "@/components/InstallPrompt";
import { ReactNode } from "react";
import { getCachedProfile, getCachedSession, setCachedProfile, setCachedSession } from "./profile-cache";
import { useDemoMode } from "@/components/DemoModeProvider";
import { clearCachedNodes } from "@/lib/nodesCache";
import { clearSessionToken } from "@/lib/use-session-token";
import { invalidateWorkspaces } from "@/lib/workspaces";
import { SessionProvider, sessionFromProfile, type ProfileResponse, type SessionValue } from "@/lib/session";

export const dynamic = "force-dynamic";

export default function DashboardLayout({ children }: { children: ReactNode }) {
    const router = useRouter();
    const { toast } = useToast();
    const isDemo = useDemoMode();
    const cachedProfile = getCachedProfile();
    const cachedSession = getCachedSession();
    // The URL cleanup below is for the OAuth callback and belongs to the first
    // load only — this effect now also re-runs when demo mode flips, and
    // rewriting the address bar under someone who just toggled a switch is not
    // what that line was written to do.
    const firstLoadRef = useRef(true);
    const [isLoading, setIsLoading] = useState(!cachedProfile);
    const [isAuthenticated, setIsAuthenticated] = useState(!!cachedProfile);

    // User state fetched from API
    const [user, setUser] = useState<{
        name: string | null;
        email: string | null;
        avatar: string | null;
    } | null>(cachedProfile);

    /**
     * The same `/api/profile` answer, kept whole.
     *
     * The header only ever wanted a name and an avatar; `useCurrentRole()` wants
     * the organisation and the role that came back in the same response. One
     * fetch, published through `SessionProvider`, so no page has to ask a second
     * time to find out what it is allowed to show.
     */
    const [session, setSession] = useState<SessionValue>(
        cachedSession ?? { userId: null, email: null, username: null, avatarUrl: null, org: null, role: null, loading: !cachedProfile },
    );

    // Fetch user profile from API using HttpOnly cookies (auth + GitHub token).
    // Skipped if already cached from a previous mount of this layout in this session.
    //
    // Re-runs when demo mode changes, because the identity in the header is part
    // of what demo mode replaces: the provider drops the cached profile as it
    // installs (and removes) its `fetch` patch, so this asks again and gets
    // whichever of the two answers is now correct.
    /**
     * A role can change under a page that is already open — a transfer of
     * ownership demotes whoever made it, in the same request. The members page
     * fires this event afterwards; the profile cache is dropped and the fetch
     * below runs again, so the buttons on screen match what the API will now
     * allow rather than what it allowed a moment ago.
     */
    const [profileNonce, setProfileNonce] = useState(0);

    useEffect(() => {
        const onSessionChanged = () => {
            setCachedProfile(null);
            setProfileNonce((value) => value + 1);
        };

        window.addEventListener('phirepass:session-changed', onSessionChanged);
        return () => window.removeEventListener('phirepass:session-changed', onSessionChanged);
    }, []);

    useEffect(() => {
        if (getCachedProfile()) {
            return;
        }

        const load = async () => {
            try {
                const res = await fetch('/api/profile', { credentials: 'include' });
                if (res.status === 200) {
                    const data = await res.json() as ProfileResponse;
                    const userInfo = {
                        name: data.username || null,
                        email: data.email || null,
                        avatar: data.avatar_url || null,
                    };
                    const nextSession = sessionFromProfile(data);
                    setCachedProfile(userInfo);
                    setCachedSession(nextSession);
                    setUser(userInfo);
                    setSession(nextSession);
                    setIsAuthenticated(true);
                    setIsLoading(false);
                    // Clean URL in case callback left params
                    if (firstLoadRef.current && typeof window !== 'undefined' && window.location.search) {
                        window.history.replaceState({}, document.title, '/dashboard/nodes');
                    }
                    firstLoadRef.current = false;
                } else {
                    setIsAuthenticated(false);
                    setIsLoading(false);
                    setSession((current) => ({ ...current, loading: false }));
                    router.push('/login');
                }
            } catch (err) {
                console.error('Failed to load profile', err);
                setIsAuthenticated(false);
                setIsLoading(false);
                setSession((current) => ({ ...current, loading: false }));
                router.push('/login');
            }
        };
        load();
    }, [router, isDemo, profileNonce]);

    // Keep the page scrollbar permanently visible while on /dashboard (styled in
    // src/index.css), so short pages don't shift horizontally against tall ones.
    useEffect(() => {
        document.documentElement.classList.add('dashboard-scroll');
        return () => document.documentElement.classList.remove('dashboard-scroll');
    }, []);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div>Loading...</div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return null;
    }

    const handleLogout = async () => {
        try {
            await fetch('/api/logout', { method: 'POST', credentials: 'include' });
        } catch { /* empty */ }
        setCachedProfile(null);
        clearCachedNodes();
        /*
         * Sign-out is a client-side navigation, so module-level caches outlive
         * it — and both of these are about the account that has just left. A
         * websocket token is a credential; a workspace list is who they work
         * with. Neither belongs to whoever signs in next on this tab.
         */
        clearSessionToken();
        invalidateWorkspaces();
        toast({
            title: "Logged out",
            description: "You have been successfully logged out",
        });
        router.push("/login");
    };

    return (
        <SessionProvider value={session}>
            <div className="flex flex-col min-h-screen">
                <Header user={user} onLogout={handleLogout} />
                {/* Speaks once, if an invitation link is what got us here. */}
                <InvitationNotice />
                {/* Offers itself once, and only where there is somewhere to install to. */}
                <InstallBanner />
                {/* No footer in the signed-in app. The bottom padding stays behind
                    as a plain spacer so short pages keep the same breathing room the
                    footer used to give them. */}
                <main className="flex-1">{children}</main>
            </div>
        </SessionProvider>
    );
}
