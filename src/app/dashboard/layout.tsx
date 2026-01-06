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

    // User state from OAuth
    const [user, setUser] = useState<{
        name: string | null;
        email: string | null;
        avatar: string | null;
    } | null>(null);

    // Check authentication and handle OAuth callback on mount
    useEffect(() => {
        const hasUser =
            typeof window !== "undefined"
                ? localStorage.getItem("github_user")
                : null;
        const userParam =
            typeof window !== "undefined"
                ? new URLSearchParams(window.location.search).get("user")
                : null;

        // Handle OAuth callback with user data from API route
        if (userParam) {
            try {
                const userData = JSON.parse(userParam);
                const userInfo = {
                    name: userData.name || userData.login,
                    email: userData.email,
                    avatar: userData.avatar_url,
                };
                localStorage.setItem("github_user", JSON.stringify(userInfo));
                setUser(userInfo);
                setIsAuthenticated(true);
                setIsLoading(false);
                // Clean up the URL
                window.history.replaceState({}, document.title, "/dashboard");
            } catch (err) {
                console.error("Failed to parse user data:", err);
                toast({
                    title: "Authentication failed",
                    description: "Failed to process authentication response",
                    variant: "destructive",
                });
                setIsLoading(false);
                router.push("/login");
            }
        } else if (hasUser) {
            try {
                const userData = JSON.parse(hasUser);
                setUser(userData);
                setIsAuthenticated(true);
                setIsLoading(false);
            } catch (err) {
                console.error("Failed to parse stored user:", err);
                localStorage.removeItem("github_user");
                setIsLoading(false);
                router.push("/login");
            }
        } else {
            setIsAuthenticated(false);
            setIsLoading(false);
            router.push("/login");
        }
    }, [router, toast]);

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

    const handleLogout = () => {
        // Clear all auth data
        localStorage.removeItem("github_user");
        localStorage.removeItem("access_token");
        sessionStorage.removeItem("github_oauth_state");

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
