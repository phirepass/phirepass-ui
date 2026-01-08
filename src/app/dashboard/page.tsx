'use client';

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";

export const dynamic = 'force-dynamic';

export default function DashboardPage() {
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    // Check if user is authenticated
    const hasUser = localStorage.getItem("github_user");

    if (hasUser) {
      // Security check passed, redirect to nodes
      router.push("/dashboard/nodes");
    } else {
      // Not authenticated, redirect to login
      router.push("/login");
    }
  }, [router, toast]);

  // Return null while redirecting
  return null;
}
