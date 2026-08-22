import { useCallback, useEffect, useRef, useState } from 'react';
import { X, MonitorPlay, Maximize2, Minimize2, Expand } from 'lucide-react';
import { Button } from './ui/button';
import { RdpPanelTab } from '@/types/node';
import { cn } from '@/lib/utils';
import { defineCustomElements } from 'phirepass-widgets/loader';
import type { PhirepassRdpElement } from '@/types/custom-elements';

interface RdpPanelProps {
    isOpen: boolean;
    onClose: () => void;
    tabs: RdpPanelTab[];
    activeTabId: string | null;
    onSelectTab: (tabId: string) => void;
    onCloseTab: (tabId: string) => void;
}

export function RdpPanel({ isOpen, onClose, tabs, activeTabId, onSelectTab, onCloseTab }: RdpPanelProps) {
    const [token, setToken] = useState<string | null>(null);
    const [tokenError, setTokenError] = useState<string | null>(null);
    const [loadingToken, setLoadingToken] = useState(false);
    const [isPanelVisible, setIsPanelVisible] = useState(false);
    const [isFullScreen, setIsFullScreen] = useState(false);

    const widgetRefs = useRef(new Map<string, PhirepassRdpElement>());

    useEffect(() => {
        void defineCustomElements();
    }, []);

    /**
     * Puts the active session into browser fullscreen, which is also what lets
     * the widget claim the shortcuts the browser normally keeps (Ctrl+W,
     * Alt+Tab). It has to be driven from a click: browsers only grant
     * fullscreen — and therefore the keyboard lock — to a user gesture.
     */
    const toggleWidgetFullScreen = useCallback(() => {
        if (!activeTabId) {
            return;
        }

        void widgetRefs.current.get(activeTabId)?.toggleFullscreen();
    }, [activeTabId]);

    useEffect(() => {
        if (!isOpen || tabs.length === 0 || token || loadingToken || tokenError) {
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
                    throw new Error(`Failed to fetch screen token (${response.status})`);
                }

                const payload = await response.json() as { token?: string };
                if (!payload.token) {
                    throw new Error('Token response is missing token');
                }

                setToken(payload.token as string);
            } catch (error) {
                setTokenError(error instanceof Error ? error.message : 'Unable to load screen token');
            } finally {
                setLoadingToken(false);
            }
        };

        fetchToken();
    }, [isOpen, tabs.length, token, loadingToken, tokenError]);

    const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
    if (isOpen !== prevIsOpen) {
        setPrevIsOpen(isOpen);
        if (!isOpen) {
            setIsPanelVisible(false);
            setIsFullScreen(false);
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

            <div
                className={cn(
                    'fixed inset-y-0 right-0 min-h-0 min-w-0 bg-card shadow-2xl z-50 flex flex-col overflow-hidden will-change-transform pointer-events-auto transition-[transform,width] duration-[620ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
                    isFullScreen
                        ? 'w-full border-0 rounded-none'
                        : 'w-full md:w-[900px] lg:w-[1200px] border-l border-hairline rounded-none md:rounded-l-2xl'
                )}
                style={{
                    transform: isPanelVisible ? 'translateX(0)' : 'translateX(110%)',
                }}
            >
                    {/* Header */}
                    <div className="flex h-14 shrink-0 items-center justify-between px-4 border-b border-hairline bg-secondary/50">
                        <div className="flex items-center gap-2">
                            <MonitorPlay className="w-5 h-5 text-primary" />
                            <div>
                                <span className="text-sm font-medium leading-tight">Remote Screen</span>
                                <p className="text-xs leading-tight text-muted-foreground">Persistent RDP sessions</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            {tabs.length > 0 && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={toggleWidgetFullScreen}
                                    aria-label="Show the remote screen fullscreen and capture the keyboard"
                                    title="Fullscreen — captures browser shortcuts"
                                >
                                    <Expand className="w-4 h-4" />
                                </Button>
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

                    {tabs.length > 0 && (
                        <div className="flex items-center gap-1 px-2 py-2 border-b border-hairline bg-background overflow-x-auto">
                            {tabs.map((tab) => {
                                const label = tab.serviceName?.trim() || tab.nodeName;
                                return (
                                <div
                                    key={tab.id}
                                    className={cn(
                                        'flex shrink-0 items-center gap-2 px-3 py-1.5 rounded-md text-sm cursor-pointer transition-colors group',
                                        activeTabId === tab.id
                                            ? 'bg-secondary text-foreground'
                                            : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                                    )}
                                    onClick={() => onSelectTab(tab.id)}
                                >
                                    <span className="font-mono text-xs whitespace-nowrap">{label}</span>
                                    <button
                                        className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onCloseTab(tab.id);
                                        }}
                                        aria-label={`Close screen for ${label}`}
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                                );
                            })}
                        </div>
                    )}

                    {/* RDP Widget */}
                    {tabs.length > 0 && token ? (
                        <div className="flex-1 w-full overflow-hidden bg-background">
                            {tabs.map((tab) => (
                                <div
                                    key={tab.id}
                                    className={cn('w-full h-full', activeTabId === tab.id ? 'block' : 'hidden')}
                                    aria-hidden={activeTabId === tab.id ? 'false' : 'true'}
                                >
                                    <phirepass-rdp
                                        ref={(element: PhirepassRdpElement | null) => {
                                            if (element) {
                                                widgetRefs.current.set(tab.id, element);
                                            } else {
                                                widgetRefs.current.delete(tab.id);
                                            }
                                        }}
                                        node-id={tab.nodeId}
                                        server-id={tab.serverId}
                                        service-id={tab.serviceId}
                                        destination={tab.destination}
                                        token={token}
                                        style={{
                                            display: 'block',
                                            width: '100%',
                                            height: '100%',
                                        }}
                                    />
                                </div>
                            ))}
                        </div>
                    ) : tabs.length > 0 && loadingToken ? (
                        <div className="flex-1 flex items-center justify-center text-muted-foreground">
                            <div className="text-center">
                                <p className="text-sm mb-2">Loading remote screen...</p>
                            </div>
                        </div>
                    ) : tokenError ? (
                        <div className="flex-1 flex items-center justify-center text-muted-foreground">
                            <div className="text-center">
                                <p className="text-sm mb-2 text-destructive">Error loading remote screen</p>
                                <p className="text-xs text-muted-foreground">{tokenError}</p>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={onClose}
                                    className="mt-4"
                                >
                                    Close
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-muted-foreground">
                            <div className="text-center">
                                <p className="text-sm mb-2">No screen sessions open</p>
                                <p className="text-xs text-muted-foreground">Open Screen on a node to start a separate RDP session</p>
                            </div>
                        </div>
                    )}
            </div>
        </div>
    );
}
