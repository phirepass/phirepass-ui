"use client";

import { createElement, useEffect, useState } from 'react';
import { X, Terminal } from 'lucide-react';
import { Button } from './ui/button';

const PHIREPASS_WIDGETS_SCRIPT_ID = 'phirepass-widgets-esm';
const PHIREPASS_WIDGETS_SCRIPT_SRC = 'https://unpkg.com/phirepass-widgets@0.0.14/dist/phirepass-widgets/phirepass-widgets.esm.js';

interface CreateTunnelPanelProps {
    isOpen: boolean;
    onClose: () => void;
    nodeId: string | null;
}

export function CreateTunnelPanel({ isOpen, onClose, nodeId }: CreateTunnelPanelProps) {
    const [token, setToken] = useState<string | null>(null);
    const [tokenError, setTokenError] = useState<string | null>(null);
    const [loadingToken, setLoadingToken] = useState(false);
    const [widgetReady, setWidgetReady] = useState<boolean>(() => typeof window !== 'undefined' && !!window.customElements.get('phirepass-terminal'));
    const [widgetError, setWidgetError] = useState<string | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        if (window.customElements.get('phirepass-terminal')) {
            setWidgetReady(true);
            setWidgetError(null);
            return;
        }

        const existing = document.getElementById(PHIREPASS_WIDGETS_SCRIPT_ID) as HTMLScriptElement | null;
        if (existing) {
            const handleLoad = () => {
                setWidgetReady(true);
                setWidgetError(null);
            };
            const handleError = () => {
                setWidgetError('Failed to load terminal widget bundle');
            };

            existing.addEventListener('load', handleLoad);
            existing.addEventListener('error', handleError);

            return () => {
                existing.removeEventListener('load', handleLoad);
                existing.removeEventListener('error', handleError);
            };
        }

        const script = document.createElement('script');
        script.id = PHIREPASS_WIDGETS_SCRIPT_ID;
        script.type = 'module';
        script.src = PHIREPASS_WIDGETS_SCRIPT_SRC;

        const handleLoad = () => {
            setWidgetReady(true);
            setWidgetError(null);
        };

        const handleError = () => {
            setWidgetError('Failed to load terminal widget bundle');
        };

        script.addEventListener('load', handleLoad);
        script.addEventListener('error', handleError);
        document.head.appendChild(script);

        return () => {
            script.removeEventListener('load', handleLoad);
            script.removeEventListener('error', handleError);
        };
    }, []);

    useEffect(() => {
        if (!isOpen || !nodeId) {
            setToken(null);
            setTokenError(null);
            setLoadingToken(false);
            return;
        }

        let cancelled = false;

        const fetchToken = async () => {
            setLoadingToken(true);
            setToken(null);
            setTokenError(null);

            try {
                const response = await fetch('/api/auth/websocket-token', {
                    credentials: 'include',
                });

                if (!response.ok) {
                    throw new Error(`Failed to fetch terminal token (${response.status})`);
                }

                const payload = await response.json() as { token?: string };
                if (!payload.token) {
                    throw new Error('Token response is missing token');
                }

                if (!cancelled) {
                    setToken(payload.token);
                }
            } catch (error) {
                if (!cancelled) {
                    setToken(null);
                    setTokenError(error instanceof Error ? error.message : 'Unable to load terminal token');
                }
            } finally {
                if (!cancelled) {
                    setLoadingToken(false);
                }
            }
        };

        fetchToken();

        return () => {
            cancelled = true;
        };
    }, [isOpen, nodeId]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-y-0 right-0 w-full md:w-[700px] lg:w-[900px] bg-card border-l border-border shadow-2xl z-50 animate-slide-in-right flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/50 shrink-0">
                <div className="flex items-center gap-2">
                    <Terminal className="w-5 h-5 text-primary" />
                    <div>
                        <span className="text-sm font-medium">Connect</span>
                        <p className="text-xs text-muted-foreground">Interactive terminal session</p>
                    </div>
                </div>
                <Button variant="ghost" size="icon" onClick={onClose}>
                    <X className="w-4 h-4" />
                </Button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden p-4">
                {!nodeId && (
                    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                        Select a node to start a terminal session.
                    </div>
                )}

                {nodeId && loadingToken && (
                    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                        Loading terminal token...
                    </div>
                )}

                {nodeId && !loadingToken && !widgetReady && !widgetError && (
                    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                        Loading terminal widget...
                    </div>
                )}

                {nodeId && widgetError && (
                    <div className="h-full flex items-center justify-center text-sm text-destructive text-center px-6">
                        {widgetError}
                    </div>
                )}

                {nodeId && !loadingToken && tokenError && (
                    <div className="h-full flex items-center justify-center text-sm text-destructive text-center px-6">
                        {tokenError}
                    </div>
                )}

                {nodeId && token && widgetReady && !loadingToken && !tokenError && !widgetError && (
                    <div className="h-full w-full border border-border overflow-hidden bg-black/20">
                        {createElement('phirepass-terminal', {
                            nodeId,
                            token,
                            style: {
                                display: 'block',
                                width: '100%',
                                height: '100%',
                            },
                        } as unknown as Record<string, unknown>)}
                    </div>
                )}
            </div>
        </div>
    );
}
