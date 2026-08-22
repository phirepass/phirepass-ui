'use client';

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DemoModeProvider } from '@/components/DemoModeProvider';
import { RuntimeConfigProvider } from '@/components/RuntimeConfigProvider';
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { ReactNode } from "react";

const queryClient = new QueryClient();

export default function ClientProviders({ children }: { children: ReactNode }) {
    return (
        <QueryClientProvider client={queryClient}>
            <RuntimeConfigProvider>
                <DemoModeProvider>
                    <TooltipProvider>
                        <Toaster />
                        <Sonner />
                        {children}
                    </TooltipProvider>
                </DemoModeProvider>
            </RuntimeConfigProvider>
        </QueryClientProvider>
    );
}
