'use client';

import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { toast } from '@/components/ui/sonner';
import type { PublicRuntimeConfig } from '@/lib/runtime-config';

type RuntimeConfigContextValue = {
    config: PublicRuntimeConfig;
    isLoading: boolean;
    error: string | null;
};

const RuntimeConfigContext = createContext<RuntimeConfigContextValue | null>(null);

export function RuntimeConfigProvider({ children }: { children: ReactNode }) {
    const [config, setConfig] = useState<PublicRuntimeConfig>({});
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;

        async function loadConfig() {
            try {
                const response = await fetch('/api/config', {
                    cache: 'no-store',
                });

                if (!response.ok) {
                    throw new Error(`Failed to load runtime config (${response.status})`);
                }

                const payload = await response.json() as PublicRuntimeConfig;

                if (!isMounted) {
                    return;
                }

                setConfig(payload);
                setError(null);
            } catch (loadError) {
                if (!isMounted) {
                    return;
                }

                setConfig({});
                setError(loadError instanceof Error ? loadError.message : 'Failed to load runtime config');
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        }

        void loadConfig();

        return () => {
            isMounted = false;
        };
    }, []);

    useEffect(() => {
        if (error) {
            toast.error('Failed to load runtime app configuration.', {
                description: error,
            });
        }
    }, [error]);

    return (
        <RuntimeConfigContext.Provider value={{ config, isLoading, error }}>
            {children}
        </RuntimeConfigContext.Provider>
    );
}

export function useRuntimeConfig() {
    const value = useContext(RuntimeConfigContext);

    if (!value) {
        throw new Error('useRuntimeConfig must be used within a RuntimeConfigProvider');
    }

    return value;
}
