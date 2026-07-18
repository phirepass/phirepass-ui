"use client";

import { useEffect, useState } from 'react';
import { X, Terminal, Maximize2, Minimize2 } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';
import { defineCustomElements } from 'phirepass-widgets/loader';

type TerminalConnectionState = 'connected' | 'disconnected' | 'error';

interface CachedTerminalSession {
    nodeId: string;
    serviceId: string;
    serverId?: string | null;
    nodeName?: string | null;
    serviceName?: string | null;
}

interface CreateTunnelPanelProps {
    isOpen: boolean;
    onClose: () => void;
    nodeId?: string | null;
    serverId?: string | null;
    nodeName?: string | null;
    serviceId?: string | null;
    serviceName?: string | null;
}

// Sessions are keyed by (nodeId, serviceId) so picking different service instances
// on the same node opens separate tabs, even though the underlying tunnel connection
// (open_ssh_tunnel) is currently only addressable by node id.
const sessionKey = (nodeId: string, serviceId: string) => `${nodeId}::${serviceId}`;

export function CreateTunnelPanel({ isOpen, onClose, nodeId, serverId, nodeName, serviceId, serviceName }: CreateTunnelPanelProps) {
    const [token, setToken] = useState<string | null>(null);
    const [tokenError, setTokenError] = useState<string | null>(null);
    const [loadingToken, setLoadingToken] = useState(false);
    const [cachedSessions, setCachedSessions] = useState<CachedTerminalSession[]>([]);
    const [sessionRenderVersions, setSessionRenderVersions] = useState<Record<string, number>>({});
    const [connectionStates, setConnectionStates] = useState<Record<string, TerminalConnectionState>>({});
    const [connectionErrors, setConnectionErrors] = useState<Record<string, string | null>>({});
    const [isFullScreen, setIsFullScreen] = useState(false);
    const [isPanelVisible, setIsPanelVisible] = useState(false);
    const [activeSessionKey, setActiveSessionKey] = useState<string | null>(null);
    const panelTransitionDurationMs = isFullScreen ? 260 : 620;

    const readConnectionErrorMessage = (value: unknown): string | null => {
        if (!value) {
            return null;
        }

        if (typeof value === 'string') {
            return value;
        }

        if (value instanceof Error) {
            return value.message;
        }

        if (typeof value === 'object' && value !== null && 'message' in value) {
            const message = (value as { message?: unknown }).message;
            if (typeof message === 'string') {
                return message;
            }
        }

        try {
            return JSON.stringify(value);
        } catch {
            return 'Terminal connection error';
        }
    };

    useEffect(() => {
        void defineCustomElements();
    }, []);

    const incomingSessionKey = nodeId && serviceId ? sessionKey(nodeId, serviceId) : null;
    const [prevIncomingSessionKey, setPrevIncomingSessionKey] = useState<string | null>(null);
    if (incomingSessionKey && incomingSessionKey !== prevIncomingSessionKey) {
        setPrevIncomingSessionKey(incomingSessionKey);
        setActiveSessionKey(incomingSessionKey);

        setCachedSessions((prev) => {
            const existingSession = prev.find((session) => sessionKey(session.nodeId, session.serviceId) === incomingSessionKey);
            if (existingSession) {
                return prev.map((session) =>
                    sessionKey(session.nodeId, session.serviceId) === incomingSessionKey
                        ? {
                            ...session,
                            serverId: session.serverId ?? serverId ?? null,
                            nodeName: nodeName ?? session.nodeName ?? nodeId,
                            serviceName: serviceName ?? session.serviceName ?? null,
                        }
                        : session
                );
            }

            return [...prev, { nodeId: nodeId as string, serviceId: serviceId as string, serverId: serverId ?? null, nodeName: nodeName ?? nodeId, serviceName: serviceName ?? null }];
        });
    }

    const [prevCachedSessions, setPrevCachedSessions] = useState(cachedSessions);
    if (cachedSessions !== prevCachedSessions) {
        setPrevCachedSessions(cachedSessions);
        if (cachedSessions.length === 0) {
            setActiveSessionKey(null);
        } else if (!activeSessionKey || !cachedSessions.some((session) => sessionKey(session.nodeId, session.serviceId) === activeSessionKey)) {
            const last = cachedSessions[cachedSessions.length - 1];
            setActiveSessionKey(sessionKey(last.nodeId, last.serviceId));
        }
    }

    useEffect(() => {
        if (!isOpen || cachedSessions.length === 0 || token || loadingToken || tokenError) {
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
    }, [cachedSessions.length, isOpen, token, loadingToken, tokenError]);

    useEffect(() => {
        if (!token || cachedSessions.length === 0) {
            return;
        }

        const detachListeners: Array<() => void> = [];

        cachedSessions.forEach((session) => {
            const key = sessionKey(session.nodeId, session.serviceId);
            const terminalContainer = document.getElementById(`terminal-session-${key}`);
            const terminalElement = terminalContainer?.querySelector('phirepass-terminal');

            if (!terminalElement) {
                return;
            }

            const handleConnectionStateChanged = (event: Event) => {
                const customEvent = event as CustomEvent<[TerminalConnectionState, unknown?]>;
                const [state, error] = customEvent.detail ?? [];
                if (!state) {
                    return;
                }

                setConnectionStates((prev) => ({
                    ...prev,
                    [key]: state,
                }));

                setConnectionErrors((prev) => ({
                    ...prev,
                    [key]: state === 'error'
                        ? readConnectionErrorMessage(error)
                        : null,
                }));

            };

            terminalElement.addEventListener('connectionStateChanged', handleConnectionStateChanged);
            detachListeners.push(() => {
                terminalElement.removeEventListener('connectionStateChanged', handleConnectionStateChanged);
            });
        });

        return () => {
            detachListeners.forEach((detach) => detach());
        };
    }, [cachedSessions, sessionRenderVersions, token]);

    const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
    if (isOpen !== prevIsOpen) {
        setPrevIsOpen(isOpen);
        if (!isOpen) {
            setIsFullScreen(false);
            setIsPanelVisible(false);
        }
    }

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        // Force a reflow at opacity-0 before scheduling the transition to opacity-100 below.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsPanelVisible(false);
        const timeoutId = window.setTimeout(() => {
            setIsPanelVisible(true);
        }, 20);

        return () => window.clearTimeout(timeoutId);
    }, [isOpen]);

    const handleRetryToken = () => {
        setToken(null);
        setTokenError(null);
    };

    const handleReconnect = (targetSession: CachedTerminalSession) => {
        const key = sessionKey(targetSession.nodeId, targetSession.serviceId);
        setConnectionStates((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
        });
        setConnectionErrors((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
        });
        setCachedSessions((prev) => (
            prev.some((session) => sessionKey(session.nodeId, session.serviceId) === key)
                ? prev
                : [...prev, targetSession]
        ));
        setActiveSessionKey(key);
        setSessionRenderVersions((prev) => ({
            ...prev,
            [key]: (prev[key] ?? 0) + 1,
        }));
    };

    const handleCloseSession = (targetSession: CachedTerminalSession) => {
        const key = sessionKey(targetSession.nodeId, targetSession.serviceId);

        setCachedSessions((prev) => {
            const closeIndex = prev.findIndex((session) => sessionKey(session.nodeId, session.serviceId) === key);
            const remainingSessions = prev.filter((session) => sessionKey(session.nodeId, session.serviceId) !== key);

            setActiveSessionKey((currentActiveKey) => {
                if (currentActiveKey !== key) {
                    return currentActiveKey;
                }

                if (remainingSessions.length === 0) {
                    return null;
                }

                const fallbackSession = remainingSessions[Math.max(0, closeIndex - 1)] ?? remainingSessions[0];
                return sessionKey(fallbackSession.nodeId, fallbackSession.serviceId);
            });

            return remainingSessions;
        });

        setConnectionStates((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
        });

        setConnectionErrors((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
        });

        setSessionRenderVersions((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
        });
    };

    const activeConnectionState = activeSessionKey ? connectionStates[activeSessionKey] : undefined;
    const activeConnectionError = activeSessionKey ? connectionErrors[activeSessionKey] : null;

    return (
        <div className={cn('mb-0 fixed inset-0 z-50 transition-opacity duration-500', isOpen ? 'pointer-events-auto' : 'pointer-events-none')}>
            <div
                className={cn(
                    'absolute inset-0 bg-black/55 backdrop-blur-sm transition-all duration-500',
                    isPanelVisible ? 'opacity-100' : 'opacity-0 backdrop-blur-none'
                )}
                onClick={onClose}
                aria-hidden="true"
            />

            <div className="absolute inset-0 flex justify-end pointer-events-none">
                <div className={cn(
                    'h-full min-h-0 min-w-0 bg-card shadow-2xl flex flex-col overflow-hidden border-border will-change-transform pointer-events-auto transition-[transform,width,border-radius] ease-[cubic-bezier(0.22,1,0.36,1)]',
                    isFullScreen
                        ? 'w-full border-0 rounded-none'
                        : 'w-full md:w-[700px] lg:w-[900px] border-l rounded-none md:rounded-l-2xl'
                )}
                    style={{
                        transitionDuration: `${panelTransitionDurationMs}ms`,
                        transform: isPanelVisible ? 'translateX(0)' : 'translateX(110%)',
                    }}>
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/50 shrink-0">
                        <div className="flex items-center gap-2">
                            <Terminal className="w-5 h-5 text-primary" />
                            <div>
                                <span className="text-sm font-medium">Connect</span>
                                <p className="text-xs text-muted-foreground">Interactive terminal session</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            {activeSessionKey && token && (
                                <div className="mr-2 flex items-center gap-2 text-xs">
                                    <span className="text-muted-foreground">Connection:</span>
                                    <span
                                        className={cn(
                                            'font-medium capitalize',
                                            activeConnectionState === 'connected' && 'text-emerald-500',
                                            activeConnectionState === 'error' && 'text-destructive',
                                            (!activeConnectionState || activeConnectionState === 'disconnected') && 'text-amber-500'
                                        )}
                                    >
                                        {activeConnectionState ?? 'connecting'}
                                    </span>
                                </div>
                            )}

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

                    {cachedSessions.length > 0 && (
                        <div className="flex items-center gap-1 px-2 py-2 border-b border-border bg-background overflow-x-auto shrink-0">
                            {cachedSessions.map((session) => {
                                const key = sessionKey(session.nodeId, session.serviceId);
                                const label = session.serviceName?.trim() || session.nodeName || session.nodeId;
                                return (
                                <div
                                    key={key}
                                    className={cn(
                                        'flex shrink-0 items-center gap-2 px-3 py-1.5 rounded-md text-sm cursor-pointer transition-colors group',
                                        activeSessionKey === key
                                            ? 'bg-secondary text-foreground'
                                            : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                                    )}
                                    onClick={() => setActiveSessionKey(key)}
                                >
                                    <span className="font-mono text-xs whitespace-nowrap">{label}</span>
                                    <button
                                        className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            handleCloseSession(session);
                                        }}
                                        aria-label={`Close terminal session for ${label}`}
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                                );
                            })}
                        </div>
                    )}

                    <div className="flex-1 min-h-0 min-w-0 overflow-hidden p-4">
                        {!activeSessionKey && (
                            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                                Select a node to start a terminal session.
                            </div>
                        )}

                        {activeConnectionError && (
                            <p className="mb-3 text-xs text-destructive break-words">{activeConnectionError}</p>
                        )}

                        {activeSessionKey && loadingToken && (
                            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                                Loading terminal token...
                            </div>
                        )}

                        {activeSessionKey && !loadingToken && tokenError && (
                            <div className="h-full flex flex-col items-center justify-center gap-3 text-sm text-destructive text-center px-6">
                                <div>{tokenError}</div>
                                <Button variant="outline" size="sm" onClick={handleRetryToken}>
                                    Retry
                                </Button>
                            </div>
                        )}

                        {token && activeSessionKey && (cachedSessions.length > 0 || activeConnectionState === 'disconnected') && (
                            <div className="relative h-full w-full min-h-0 min-w-0 border border-border overflow-hidden bg-black/20">
                                {activeConnectionState !== 'connected' && (
                                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3">
                                        {activeConnectionState === 'disconnected' ? (
                                            <>
                                                <span className="text-sm text-muted-foreground">Disconnected</span>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => {
                                                        const activeSession = cachedSessions.find((session) => sessionKey(session.nodeId, session.serviceId) === activeSessionKey);
                                                        if (activeSession) handleReconnect(activeSession);
                                                    }}
                                                >
                                                    Reconnect
                                                </Button>
                                            </>
                                        ) : (
                                            <span className="text-sm text-muted-foreground">Connecting...</span>
                                        )}
                                    </div>
                                )}
                                {cachedSessions.map((session) => {
                                    const { nodeId: cachedNodeId, serverId: cachedServerId, serviceId: cachedServiceId } = session;
                                    const key = sessionKey(session.nodeId, session.serviceId);
                                    const renderVersion = sessionRenderVersions[key] ?? 0;
                                    const isActive = activeSessionKey === key;
                                    const sessionState = connectionStates[key];
                                    const isConnected = sessionState === 'connected';
                                    return <div key={`${key}-${renderVersion}`}
                                        id={`terminal-session-${key}`}
                                        className={cn(
                                            'terminal-session absolute inset-0 h-full w-full min-h-0 min-w-0 transition-opacity duration-200',
                                            isActive && isConnected
                                                ? 'opacity-100 pointer-events-auto'
                                                : 'opacity-0 pointer-events-none'
                                        )} aria-hidden={!isActive || !isConnected || undefined}>
                                        <phirepass-terminal
                                            node-id={cachedNodeId}
                                            server-id={cachedServerId ?? undefined}
                                            service-id={cachedServiceId}
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
