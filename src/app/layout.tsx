'use client';

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import "@/index.css";

// Import Google Fonts
import { Inter, JetBrains_Mono } from 'next/font/google';

const queryClient = new QueryClient();

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
    <body>
        <QueryClientProvider client={queryClient}>
        <TooltipProvider>
            <Toaster />
            <Sonner />
            {children}
        </TooltipProvider>
        </QueryClientProvider>
    </body>
    </html>
  );
}
