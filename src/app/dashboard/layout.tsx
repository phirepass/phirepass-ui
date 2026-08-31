"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { Header } from "@/components/Header";
import { ReactNode } from "react";
import { getCachedProfile, setCachedProfile } from "./profile-cache";
import { useDemoMode } from "@/components/DemoModeProvider";
import { clearCachedNodes } from "@/lib/nodesCache";

export const dynamic = "force-dynamic";

export default function DashboardLayout({ children }: { children: ReactNode }) {
    const router = useRouter();
    const { toast } = useToast();
    const isDemo = useDemoMode();
    const cachedProfile = getCachedProfile();
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

    // Fetch user profile from API using HttpOnly cookies (auth + GitHub token).
    // Skipped if already cached from a previous mount of this layout in this session.
    //
    // Re-runs when demo mode changes, because the identity in the header is part
    // of what demo mode replaces: the provider drops the cached profile as it
    // installs (and removes) its `fetch` patch, so this asks again and gets
    // whichever of the two answers is now correct.
    useEffect(() => {
        if (getCachedProfile()) {
            return;
        }

        const load = async () => {
            try {
                const res = await fetch('/api/profile', { credentials: 'include' });
                if (res.status === 200) {
                    const data = await res.json();
                    const userInfo = {
                        name: data.username || null,
                        email: data.email || null,
                        avatar: data.avatar_url || null,
                    };
                    setCachedProfile(userInfo);
                    setUser(userInfo);
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
                    router.push('/login');
                }
            } catch (err) {
                console.error('Failed to load profile', err);
                setIsAuthenticated(false);
                setIsLoading(false);
                router.push('/login');
            }
        };
        load();
    }, [router, isDemo]);

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
        toast({
            title: "Logged out",
            description: "You have been successfully logged out",
        });
        router.push("/login");
    };

    return (
        <div className="flex flex-col min-h-screen">
            <Header user={user} onLogout={handleLogout} />
            {/* No footer in the signed-in app. The bottom padding stays behind
                as a plain spacer so short pages keep the same breathing room the
                footer used to give them. */}
            <main className="flex-1">{children}</main>
        </div>
    );
}
