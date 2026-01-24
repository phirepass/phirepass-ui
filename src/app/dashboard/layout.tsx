"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { Header } from "@/components/Header";
import { ReactNode } from "react";

export const dynamic = "force-dynamic";

export default function DashboardLayout({ children }: { children: ReactNode }) {
    const router = useRouter();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    // User state fetched from API
    const [user, setUser] = useState<{
        name: string | null;
        email: string | null;
        avatar: string | null;
    } | null>(null);

    // Fetch user profile from API using HttpOnly cookies (auth + GitHub token)
    useEffect(() => {
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
                    setUser(userInfo);
                    setIsAuthenticated(true);
                    setIsLoading(false);
                    // Clean URL in case callback left params
                    if (typeof window !== 'undefined' && window.location.search) {
                        window.history.replaceState({}, document.title, '/dashboard');
                    }
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
    }, [router]);

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
        toast({
            title: "Logged out",
            description: "You have been successfully logged out",
        });
        router.push("/login");
    };

    return (
        <div className="flex flex-col min-h-screen">
            <Header user={user} onLogout={handleLogout} />
            <main className="flex-1">{children}</main>
            <div className="py-6 pb-12" />
        </div>
    );
}
