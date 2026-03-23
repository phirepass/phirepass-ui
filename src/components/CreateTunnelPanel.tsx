"use client";

import { useEffect, useState } from 'react';
import { X, Terminal, Maximize2, Minimize2 } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';
import { defineCustomElements } from 'phirepass-widgets/loader';

interface CreateTunnelPanelProps {
    isOpen: boolean;
    onClose: () => void;
    nodeId: string | null;
}

export function CreateTunnelPanel({ isOpen, onClose, nodeId }: CreateTunnelPanelProps) {
    const [token, setToken] = useState<string | null>(null);
    const [tokenError, setTokenError] = useState<string | null>(null);
    const [loadingToken, setLoadingToken] = useState(false);
    const [cachedNodeIds, setCachedNodeIds] = useState<string[]>([]);
    const [isFullScreen, setIsFullScreen] = useState(false);
    const panelTransitionDurationMs = isFullScreen ? 420 : 950;

    useEffect(() => {
        void defineCustomElements();
    }, []);

    useEffect(() => {
        if (!nodeId) {
            return;
        }

        setCachedNodeIds((prev) => (prev.includes(nodeId) ? prev : [...prev, nodeId]));
    }, [nodeId]);

    useEffect(() => {
        if (!isOpen || !nodeId || token || loadingToken || tokenError) {
            return;
        }

        const fetchToken = async () => {
            setLoadingToken(true);
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

                setToken(payload.token as string);
            } catch (error) {
                setTokenError(error instanceof Error ? error.message : 'Unable to load terminal token');
            } finally {
                setLoadingToken(false);
            }
        };

        fetchToken();
    }, [isOpen, nodeId, token, loadingToken, tokenError]);

    useEffect(() => {
        if (!isOpen) {
            setIsFullScreen(false);
        }
    }, [isOpen]);

    const handleRetryToken = () => {
        setToken(null);
        setTokenError(null);
    };

    return (
        <div className={cn('fixed inset-0 z-50 transition-opacity duration-500', isOpen ? 'pointer-events-auto' : 'pointer-events-none')}>
            <div
                className={cn('absolute inset-0 bg-black/55 backdrop-blur-sm transition-all duration-500', isOpen ? 'opacity-100' : 'opacity-0 backdrop-blur-none')}
                onClick={onClose}
                aria-hidden="true"
            />

            <div className="absolute inset-0 flex justify-end pointer-events-none">
                <div className={cn(
                    'h-full bg-card shadow-2xl flex flex-col overflow-hidden border-border will-change-transform pointer-events-auto transition-[transform,width,border-radius] ease-[cubic-bezier(0.22,1,0.36,1)]',
                    isFullScreen
                        ? 'w-full border-0 rounded-none'
                        : 'w-full md:w-[700px] lg:w-[900px] border-l rounded-none md:rounded-l-2xl',
                    isOpen ? 'translate-x-0' : 'translate-x-[110%]'
                )}
                    style={{ transitionDuration: `${panelTransitionDurationMs}ms` }}>
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/50 shrink-0">
                        <div className="flex items-center gap-2">
                            <Terminal className="w-5 h-5 text-primary" />
                            <div>
                                <span className="text-sm font-medium">Connect</span>
                                <p className="text-xs text-muted-foreground">Interactive terminal session</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setIsFullScreen((prev) => !prev)}
                                aria-label={isFullScreen ? 'Restore panel size' : 'Expand panel'}
                            >
                                {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                            </Button>
                            <Button variant="ghost" size="icon" onClick={onClose}>
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>

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

                        {nodeId && !loadingToken && tokenError && (
                            <div className="h-full flex flex-col items-center justify-center gap-3 text-sm text-destructive text-center px-6">
                                <div>{tokenError}</div>
                                <Button variant="outline" size="sm" onClick={handleRetryToken}>
                                    Retry
                                </Button>
                            </div>
                        )}

                        {cachedNodeIds.length > 0 && token && (
                            <div className="relative h-full w-full border border-border overflow-hidden bg-black/20">
                                {cachedNodeIds.map((cachedNodeId) => {
                                    return <div key={cachedNodeId}
                                        id={`terminal-session-${cachedNodeId}`}
                                        className={cn(
                                            'terminal-session absolute inset-0 h-full w-full transition-opacity duration-200',
                                            nodeId === cachedNodeId
                                                ? 'opacity-100 pointer-events-auto'
                                                : 'opacity-0 pointer-events-none'
                                        )} aria-hidden={nodeId !== cachedNodeId || undefined}>
                                        <phirepass-terminal
                                            node-id={cachedNodeId}
                                            token={token}
                                            style={{ display: 'block', width: '100%', height: '100%' }}
                                        />
                                    </div>
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
