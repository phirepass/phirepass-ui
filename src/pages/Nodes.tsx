"use client";
import React, { useState, useEffect } from 'react';

// ...existing code...
import { DashboardStats } from '@/components/DashboardStats';
import { NodeCard } from '@/components/NodeCard';
import { FilePanel } from '@/components/FilePanel';
import { BulkActionsBar } from '@/components/BulkActionsBar';
import { AddNodeDialog } from '@/components/AddNodeDialog';
import { ShareNodeDialog } from '@/components/ShareNodeDialog';
import { ShareManagementDialog } from '@/components/ShareManagementDialog';
import { CreateTunnelPanel } from '@/components/CreateTunnelPanel';
import { MonitoringAlerts } from '@/components/MonitoringAlerts';
import { mockSharedNodes } from '@/data/mockSharedNodes';
import { FilePanelTab, NodeStats, TunnelNode } from '@/types/node';
import { Search, Filter, Grid, List, CheckSquare, Plus, Users, CheckCircle2, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useRuntimeConfig } from '@/components/RuntimeConfigProvider';
import initChannel, { Channel } from 'phirepass-channel';

export default function Nodes() {
    const [nodes, setNodes] = useState<TunnelNode[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

    // Fetch nodes from same-origin API
    useEffect(() => {
        let isDisposed = false;

        const fetchNodes = async (showLoading = false) => {
            try {
                if (showLoading) {
                    setLoading(true);
                }

                const response = await fetch('/api/nodes');
                if (!response.ok) {
                    throw new Error(`Failed to fetch nodes: ${response.statusText}`);
                }

                const nextNodes = await response.json() as TunnelNode[];
                if (isDisposed) {
                    return;
                }

                setNodes(nextNodes);
                setError(null);
            } catch (err) {
                if (isDisposed) {
                    return;
                }

                setError(err instanceof Error ? err.message : 'Failed to fetch nodes');
            } finally {
                if (!isDisposed && showLoading) {
                    setLoading(false);
                }
            }
        };

        void fetchNodes(true);

        const intervalId = window.setInterval(() => {
            void fetchNodes(false);
        }, 15_000);

        return () => {
            isDisposed = true;
            window.clearInterval(intervalId);
        };
    }, []);

    // File panel state
    const [filePanelOpen, setFilePanelOpen] = useState(false);
    const [filePanelTabs, setFilePanelTabs] = useState<FilePanelTab[]>([]);
    const [activeFileTabId, setActiveFileTabId] = useState<string | null>(null);

    // Create tunnel panel state
    const [createTunnelPanelOpen, setCreateTunnelPanelOpen] = useState(false);
    const [selectedTunnelNode, setSelectedTunnelNode] = useState<TunnelNode | null>(null);

    // Add Node dialog
    const [addNodeOpen, setAddNodeOpen] = useState(false);

    // Share dialogs
    const [shareDialogOpen, setShareDialogOpen] = useState(false);
    const [shareManagementOpen, setShareManagementOpen] = useState(false);
    const [nodeToShare, setNodeToShare] = useState<TunnelNode | null>(null);
    const [viewNodeIdDialogOpen, setViewNodeIdDialogOpen] = useState(false);
    const [nodeToViewId, setNodeToViewId] = useState<TunnelNode | null>(null);
    const [nodeIdCopied, setNodeIdCopied] = useState(false);
    const [renameDialogOpen, setRenameDialogOpen] = useState(false);
    const [nodeToRename, setNodeToRename] = useState<TunnelNode | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [renameSaving, setRenameSaving] = useState(false);
    const [renameError, setRenameError] = useState<string | null>(null);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [nodeToDelete, setNodeToDelete] = useState<TunnelNode | null>(null);
    const [deleteSaving, setDeleteSaving] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [enableSshDialogOpen, setEnableSshDialogOpen] = useState(false);
    const [nodeToEnableSsh, setNodeToEnableSsh] = useState<TunnelNode | null>(null);
    const [enableSshHost, setEnableSshHost] = useState('0.0.0.0');
    const [enableSshPort, setEnableSshPort] = useState('22');
    const [enableSshUsername, setEnableSshUsername] = useState('');
    const [enableSshPassword, setEnableSshPassword] = useState('');
    const [enableSshSubmitting, setEnableSshSubmitting] = useState(false);
    const [enableSshError, setEnableSshError] = useState<string | null>(null);
    const [disableSshDialogOpen, setDisableSshDialogOpen] = useState(false);
    const [nodeToDisableSsh, setNodeToDisableSsh] = useState<TunnelNode | null>(null);
    const [disableSshSubmitting, setDisableSshSubmitting] = useState(false);
    const [disableSshError, setDisableSshError] = useState<string | null>(null);
    const [enableSftpDialogOpen, setEnableSftpDialogOpen] = useState(false);
    const [nodeToEnableSftp, setNodeToEnableSftp] = useState<TunnelNode | null>(null);
    const [enableSftpHost, setEnableSftpHost] = useState('0.0.0.0');
    const [enableSftpPort, setEnableSftpPort] = useState('22');
    const [enableSftpUsername, setEnableSftpUsername] = useState('');
    const [enableSftpPassword, setEnableSftpPassword] = useState('');
    const [enableSftpSubmitting, setEnableSftpSubmitting] = useState(false);
    const [enableSftpError, setEnableSftpError] = useState<string | null>(null);
    const [disableSftpDialogOpen, setDisableSftpDialogOpen] = useState(false);
    const [nodeToDisableSftp, setNodeToDisableSftp] = useState<TunnelNode | null>(null);
    const [disableSftpSubmitting, setDisableSftpSubmitting] = useState(false);
    const [disableSftpError, setDisableSftpError] = useState<string | null>(null);
    const [enableHttpProxyDialogOpen, setEnableHttpProxyDialogOpen] = useState(false);
    const [nodeToEnableHttpProxy, setNodeToEnableHttpProxy] = useState<TunnelNode | null>(null);
    const [enableHttpProxyHost, setEnableHttpProxyHost] = useState('0.0.0.0');
    const [enableHttpProxyPort, setEnableHttpProxyPort] = useState('8080');
    const [enableHttpProxyUsername, setEnableHttpProxyUsername] = useState('');
    const [enableHttpProxyPassword, setEnableHttpProxyPassword] = useState('');
    const [enableHttpProxySubmitting, setEnableHttpProxySubmitting] = useState(false);
    const [enableHttpProxyError, setEnableHttpProxyError] = useState<string | null>(null);
    const [disableHttpProxyDialogOpen, setDisableHttpProxyDialogOpen] = useState(false);
    const [nodeToDisableHttpProxy, setNodeToDisableHttpProxy] = useState<TunnelNode | null>(null);
    const [disableHttpProxySubmitting, setDisableHttpProxySubmitting] = useState(false);
    const [disableHttpProxyError, setDisableHttpProxyError] = useState<string | null>(null);

    const { config } = useRuntimeConfig();

    const normalizedQuery = searchQuery.trim().toLowerCase();
    const filteredNodes = nodes
        .filter(node => !!node.stats)
        .filter((node) => {
            if (!normalizedQuery) return true;

            const name = (node.name ?? '').toLowerCase();
            const hostName = (node.stats.host_name ?? '').toLowerCase();
            const ip = (node.ip ?? '').toLowerCase();
            const osInfo = (node.stats.host_os_info ?? '').toLowerCase();

            return (
                name.includes(normalizedQuery) ||
                hostName.includes(normalizedQuery) ||
                ip.includes(normalizedQuery) ||
                osInfo.includes(normalizedQuery)
            );
        })
        .sort((a, b) => {
            // Sort online nodes first
            if (a.is_online === b.is_online) return 0;
            return a.is_online ? -1 : 1;
        });

    const handleCreateTunnel = (node: TunnelNode) => {
        setSelectedTunnelNode({ ...node });
        setCreateTunnelPanelOpen(true);
    };

    const handleRefreshStats = async (node: TunnelNode) => {
        const params = new URLSearchParams({
            refresh: '1',
            id: node.id,
        });

        try {
            const response = await fetch(`/api/nodes?${params.toString()}`);
            if (!response.ok) {
                throw new Error(`Refresh failed: ${response.statusText}`);
            }

            const refreshedNodes = await response.json() as TunnelNode[];
            if (!Array.isArray(refreshedNodes) || refreshedNodes.length === 0) {
                return;
            }

            const refreshedNode = refreshedNodes[0];
            setNodes((prev) => prev.map((entry) => (entry.id === refreshedNode.id ? refreshedNode : entry)));
            setFilePanelTabs((prev) => prev.map((entry) => (
                entry.nodeId === refreshedNode.id
                    ? {
                        ...entry,
                        nodeName: refreshedNode.name,
                        serverId: refreshedNode.server_id,
                    }
                    : entry
            )));
        } catch (err) {
            console.warn('[client][refresh-stats] failed', err);
        }
    };

    const handleOpenFiles = (node: TunnelNode) => {
        setFilePanelTabs((prev) => {
            const existingTab = prev.find((tab) => tab.nodeId === node.id);
            if (existingTab) {
                setActiveFileTabId(existingTab.id);
                return prev;
            }

            const newTab: FilePanelTab = {
                id: `file-${node.id}`,
                nodeId: node.id,
                nodeName: node.name,
                serverId: node.server_id,
            };

            setActiveFileTabId(newTab.id);
            return [...prev, newTab];
        });
        setFilePanelOpen(true);
    };

    const handleCloseFileTab = (tabId: string) => {
        setFilePanelTabs((prev) => {
            const remainingTabs = prev.filter((tab) => tab.id !== tabId);

            setActiveFileTabId((currentActiveTabId) => {
                if (currentActiveTabId !== tabId) {
                    return currentActiveTabId;
                }

                const closedTabIndex = prev.findIndex((tab) => tab.id === tabId);
                const fallbackTab = remainingTabs[Math.max(0, closedTabIndex - 1)] ?? remainingTabs[0] ?? null;
                return fallbackTab?.id ?? null;
            });

            if (remainingTabs.length === 0) {
                setFilePanelOpen(false);
            }

            return remainingTabs;
        });
    };


    const handleShare = (node: TunnelNode) => {
        setNodeToShare(node);
        setShareDialogOpen(true);
    };

    const handleViewNodeId = (node: TunnelNode) => {
        setNodeToViewId(node);
        setNodeIdCopied(false);
        setViewNodeIdDialogOpen(true);
    };

    const closeViewNodeIdDialog = () => {
        setViewNodeIdDialogOpen(false);
        setNodeToViewId(null);
        setNodeIdCopied(false);
    };

    const copyNodeIdToClipboard = async () => {
        if (!nodeToViewId) {
            return;
        }

        try {
            await navigator.clipboard.writeText(nodeToViewId.id);
            setNodeIdCopied(true);
        } catch (_err) {
            setNodeIdCopied(false);
        }
    };

    const applyNodeNameUpdate = (nodeId: string, nextName: string) => {
        const updateName = (entry: TunnelNode) => (entry.id === nodeId ? { ...entry, name: nextName } : entry);

        setNodes((prev) => prev.map(updateName));
        setFilePanelTabs((prev) => prev.map((entry) => (entry.nodeId === nodeId ? { ...entry, nodeName: nextName } : entry)));
        setSelectedTunnelNode((prev) => (prev && prev.id === nodeId ? { ...prev, name: nextName } : prev));
        setNodeToShare((prev) => (prev && prev.id === nodeId ? { ...prev, name: nextName } : prev));
    };

    const handleRenameNode = (node: TunnelNode) => {
        setNodeToRename(node);
        setRenameValue(node.name);
        setRenameError(null);
        setRenameDialogOpen(true);
    };

    const closeRenameDialog = () => {
        setRenameDialogOpen(false);
        setRenameSaving(false);
        setRenameError(null);
        setNodeToRename(null);
        setRenameValue('');
    };

    const submitRenameNode = async () => {
        if (!nodeToRename) return;

        const nextName = renameValue.trim();
        if (!nextName) {
            setRenameError('Node name is required');
            return;
        }

        if (nextName === nodeToRename.name) {
            closeRenameDialog();
            return;
        }

        try {
            setRenameSaving(true);
            setRenameError(null);

            const response = await fetch('/api/nodes', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    id: nodeToRename.id,
                    name: nextName,
                }),
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => ({ error: 'Failed to rename node' }));
                throw new Error(payload.error ?? 'Failed to rename node');
            }

            const updatedNode = await response.json() as { id: string; name: string };
            applyNodeNameUpdate(updatedNode.id, updatedNode.name);
            closeRenameDialog();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to rename node';
            setRenameError(message);
        } finally {
            setRenameSaving(false);
        }
    };

    const handleAddNode = () => {
        setAddNodeOpen(true);
    };

    const removeNodeFromState = (nodeId: string) => {
        setNodes((prev) => prev.filter((entry) => entry.id !== nodeId));
        setFilePanelTabs((prev) => {
            const remainingTabs = prev.filter((entry) => entry.nodeId !== nodeId);

            setActiveFileTabId((currentTabId) => {
                if (!currentTabId) {
                    return currentTabId;
                }

                const activeTabStillExists = remainingTabs.some((entry) => entry.id === currentTabId);
                return activeTabStillExists ? currentTabId : remainingTabs[0]?.id ?? null;
            });

            setFilePanelOpen(remainingTabs.length > 0);
            return remainingTabs;
        });
        setSelectedTunnelNode((prev) => (prev && prev.id === nodeId ? null : prev));
        setNodeToShare((prev) => (prev && prev.id === nodeId ? null : prev));
    };

    const handleDeleteNode = (node: TunnelNode) => {
        setNodeToDelete(node);
        setDeleteError(null);
        setDeleteDialogOpen(true);
    };

    const openEnableSshDialog = (node: TunnelNode) => {
        setNodeToEnableSsh(node);
        setEnableSshHost('0.0.0.0');
        setEnableSshPort('22');
        setEnableSshUsername('');
        setEnableSshPassword('');
        setEnableSshError(null);
        setEnableSshDialogOpen(true);
    };

    const openDisableSshDialog = (node: TunnelNode) => {
        setNodeToDisableSsh(node);
        setDisableSshError(null);
        setDisableSshDialogOpen(true);
    };

    const closeEnableSshDialog = () => {
        setEnableSshDialogOpen(false);
        setNodeToEnableSsh(null);
    };

    const closeDisableSshDialog = () => {
        setDisableSshDialogOpen(false);
        setNodeToDisableSsh(null);
    };

    const openEnableSftpDialog = (node: TunnelNode) => {
        setNodeToEnableSftp(node);
        setEnableSftpHost('0.0.0.0');
        setEnableSftpPort('22');
        setEnableSftpUsername('');
        setEnableSftpPassword('');
        setEnableSftpError(null);
        setEnableSftpDialogOpen(true);
    };

    const openDisableSftpDialog = (node: TunnelNode) => {
        setNodeToDisableSftp(node);
        setDisableSftpError(null);
        setDisableSftpDialogOpen(true);
    };

    const closeEnableSftpDialog = () => {
        setEnableSftpDialogOpen(false);
        setNodeToEnableSftp(null);
    };

    const closeDisableSftpDialog = () => {
        setDisableSftpDialogOpen(false);
        setNodeToDisableSftp(null);
    };

    const openEnableHttpProxyDialog = (node: TunnelNode) => {
        setNodeToEnableHttpProxy(node);
        setEnableHttpProxyHost('0.0.0.0');
        setEnableHttpProxyPort('8080');
        setEnableHttpProxyUsername('');
        setEnableHttpProxyPassword('');
        setEnableHttpProxyError(null);
        setEnableHttpProxyDialogOpen(true);
    };

    const openDisableHttpProxyDialog = (node: TunnelNode) => {
        setNodeToDisableHttpProxy(node);
        setDisableHttpProxyError(null);
        setDisableHttpProxyDialogOpen(true);
    };

    const closeEnableHttpProxyDialog = () => {
        setEnableHttpProxyDialogOpen(false);
        setNodeToEnableHttpProxy(null);
    };

    const closeDisableHttpProxyDialog = () => {
        setDisableHttpProxyDialogOpen(false);
        setNodeToDisableHttpProxy(null);
    };

    const buildWsEndpoint = (): string => {
        const explicitUrl = config.NEXT_PUBLIC_WS_URL?.trim();
        if (explicitUrl) {
            return `${explicitUrl.replace(/\/$/, '')}/api/web/ws`;
        }
        const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
        const protocol = isHttps ? 'wss:' : 'ws:';
        const host = config.NEXT_PUBLIC_SERVER_HOST || (typeof window !== 'undefined' ? window.location.hostname : 'localhost');
        const port = config.NEXT_PUBLIC_SERVER_PORT || (isHttps ? '443' : '8080');
        return `${protocol}//${host}:${port}/api/web/ws`;
    };

    const updateSshServiceInNode = (nodeId: string, isEnabled: boolean) => {
        const upsertSshService = (services: string[]) => {
            const hasSsh = services.some((service) => service.toUpperCase() === 'SSH');

            if (isEnabled) {
                return hasSsh ? services : [...services, 'SSH'];
            }

            return services.filter((service) => service.toUpperCase() !== 'SSH');
        };

        const updateNodeServices = (entry: TunnelNode) => (
            entry.id === nodeId
                ? { ...entry, services: upsertSshService(entry.services ?? []) }
                : entry
        );

        setNodes((prev) => prev.map(updateNodeServices));
        setSelectedTunnelNode((prev) => (prev && prev.id === nodeId ? updateNodeServices(prev) : prev));
        setNodeToShare((prev) => (prev && prev.id === nodeId ? updateNodeServices(prev) : prev));
    };

    const updateSftpServiceInNode = (nodeId: string, isEnabled: boolean) => {
        const upsertSftpService = (services: string[]) => {
            const hasSftp = services.some((service) => service.toUpperCase() === 'SFTP');

            if (isEnabled) {
                return hasSftp ? services : [...services, 'SFTP'];
            }

            return services.filter((service) => service.toUpperCase() !== 'SFTP');
        };

        const updateNodeServices = (entry: TunnelNode) => (
            entry.id === nodeId
                ? { ...entry, services: upsertSftpService(entry.services ?? []) }
                : entry
        );

        setNodes((prev) => prev.map(updateNodeServices));
        setSelectedTunnelNode((prev) => (prev && prev.id === nodeId ? updateNodeServices(prev) : prev));
        setNodeToShare((prev) => (prev && prev.id === nodeId ? updateNodeServices(prev) : prev));
    };

    const updateHttpProxyServiceInNode = (nodeId: string, isEnabled: boolean) => {
        const upsertHttpProxyService = (services: string[]) => {
            const hasHttpProxy = services.some((service) => service.trim().toUpperCase().replace(/[\s_-]+/g, '') === 'HTTP');

            if (isEnabled) {
                return hasHttpProxy ? services : [...services, 'HTTP'];
            }

            return services.filter((service) => service.trim().toUpperCase().replace(/[\s_-]+/g, '') !== 'HTTP');
        };

        const updateNodeServices = (entry: TunnelNode) => (
            entry.id === nodeId
                ? { ...entry, services: upsertHttpProxyService(entry.services ?? []) }
                : entry
        );

        setNodes((prev) => prev.map(updateNodeServices));
        setSelectedTunnelNode((prev) => (prev && prev.id === nodeId ? updateNodeServices(prev) : prev));
        setNodeToShare((prev) => (prev && prev.id === nodeId ? updateNodeServices(prev) : prev));
    };

    const submitEnableSsh = async () => {
        if (!nodeToEnableSsh) return;

        setEnableSshSubmitting(true);
        setEnableSshError(null);

        try {
            const tokenRes = await fetch('/api/auth/websocket-token', {
                credentials: 'same-origin',
                cache: 'no-store',
            });
            if (!tokenRes.ok) {
                throw new Error(tokenRes.status === 401 ? 'Not authenticated.' : 'Failed to load auth token.');
            }
            const tokenPayload = await tokenRes.json() as { token?: string };
            if (!tokenPayload.token) {
                throw new Error('Auth token response was empty.');
            }

            await initChannel();

            const endpoint = buildWsEndpoint();
            const channel = new Channel(endpoint, nodeToEnableSsh.id, nodeToEnableSsh.server_id ?? null);
            const nodeId = nodeToEnableSsh.id;
            const token = tokenPayload.token;
            const host = enableSshHost;
            const portNum = parseInt(enableSshPort, 10) || 22;
            const username = enableSshUsername || null;
            const password = enableSshPassword || null;

            await new Promise<void>((resolve, reject) => {
                const timeoutId = setTimeout(() => {
                    channel.disconnect();
                    reject(new Error('Connection timed out.'));
                }, 15_000);

                channel.on_connection_error((_event: unknown) => {
                    clearTimeout(timeoutId);
                    channel.disconnect();
                    reject(new Error('WebSocket connection error.'));
                });

                channel.on_connection_open(() => {
                    channel.authenticate(token, nodeId);
                });

                channel.on_connection_error((error: unknown) => {
                    console.warn('Connection error occurred', error);
                });

                channel.on_protocol_message_type('AuthSuccess', () => {
                    channel.enable_service(nodeId, 'ssh', host, portNum, username, password, null);
                });

                channel.on_protocol_message_type('EnableServiceResponse', (data: { enabled: boolean, error?: string }) => {
                    clearTimeout(timeoutId);
                    channel.disconnect();

                    if (data.enabled) {
                        resolve();
                    } else {
                        reject(new Error(data.error ?? 'Server refused to enable SSH service.'));
                    }
                });

                channel.on_protocol_message_type('Error', (data: { message?: string }) => {
                    clearTimeout(timeoutId);
                    channel.disconnect();
                    const errFrame = data as { message?: string };
                    reject(new Error(errFrame.message ?? 'Server returned an error.'));
                });

                channel.on_protocol_message((frame: any) => {
                    console.debug('Received protocol message:', frame.data);
                });

                channel.connect();
            });

            updateSshServiceInNode(nodeId, true);
            closeEnableSshDialog();
        } catch (err) {
            setEnableSshError(err instanceof Error ? err.message : 'Failed to enable SSH.');
        } finally {
            setEnableSshSubmitting(false);
        }
    };

    const submitDisableSsh = async () => {
        if (!nodeToDisableSsh) return;

        setDisableSshSubmitting(true);
        setDisableSshError(null);

        try {
            const tokenRes = await fetch('/api/auth/websocket-token', {
                credentials: 'same-origin',
                cache: 'no-store',
            });
            if (!tokenRes.ok) {
                throw new Error(tokenRes.status === 401 ? 'Not authenticated.' : 'Failed to load auth token.');
            }
            const tokenPayload = await tokenRes.json() as { token?: string };
            if (!tokenPayload.token) {
                throw new Error('Auth token response was empty.');
            }

            await initChannel();

            const endpoint = buildWsEndpoint();
            const channel = new Channel(endpoint, nodeToDisableSsh.id, nodeToDisableSsh.server_id ?? null);
            const nodeId = nodeToDisableSsh.id;
            const token = tokenPayload.token;
            const host = '0.0.0.0';
            const portNum = 22;
            const username = null;
            const password = null;

            await new Promise<void>((resolve, reject) => {
                const timeoutId = setTimeout(() => {
                    channel.disconnect();
                    reject(new Error('Connection timed out.'));
                }, 15_000);

                channel.on_connection_error((_event: unknown) => {
                    clearTimeout(timeoutId);
                    channel.disconnect();
                    reject(new Error('WebSocket connection error.'));
                });

                channel.on_connection_open(() => {
                    channel.authenticate(token, nodeId);
                });

                channel.on_connection_error((error: unknown) => {
                    console.warn('Connection error occurred', error);
                });

                channel.on_protocol_message_type('AuthSuccess', () => {
                    channel.disable_service(nodeId, 'ssh', host, portNum, username, password, null);
                });

                channel.on_protocol_message_type('DisableServiceResponse', (data: { disabled?: boolean, enabled?: boolean, error?: string }) => {
                    clearTimeout(timeoutId);
                    channel.disconnect();

                    if (data.disabled === true || data.enabled === false) {
                        resolve();
                    } else {
                        reject(new Error(data.error ?? 'Server refused to disable SSH service.'));
                    }
                });

                channel.on_protocol_message_type('Error', (data: { message?: string }) => {
                    clearTimeout(timeoutId);
                    channel.disconnect();
                    const errFrame = data as { message?: string };
                    reject(new Error(errFrame.message ?? 'Server returned an error.'));
                });

                channel.on_protocol_message((frame: any) => {
                    console.debug('Received protocol message:', frame.data);
                });

                channel.connect();
            });

            updateSshServiceInNode(nodeId, false);
            closeDisableSshDialog();
        } catch (err) {
            setDisableSshError(err instanceof Error ? err.message : 'Failed to disable SSH.');
        } finally {
            setDisableSshSubmitting(false);
        }
    };

    const submitEnableSftp = async () => {
        if (!nodeToEnableSftp) return;

        setEnableSftpSubmitting(true);
        setEnableSftpError(null);

        try {
            const tokenRes = await fetch('/api/auth/websocket-token', {
                credentials: 'same-origin',
                cache: 'no-store',
            });
            if (!tokenRes.ok) {
                throw new Error(tokenRes.status === 401 ? 'Not authenticated.' : 'Failed to load auth token.');
            }
            const tokenPayload = await tokenRes.json() as { token?: string };
            if (!tokenPayload.token) {
                throw new Error('Auth token response was empty.');
            }

            await initChannel();

            const endpoint = buildWsEndpoint();
            const channel = new Channel(endpoint, nodeToEnableSftp.id, nodeToEnableSftp.server_id ?? null);
            const nodeId = nodeToEnableSftp.id;
            const token = tokenPayload.token;
            const host = enableSftpHost;
            const portNum = parseInt(enableSftpPort, 10) || 22;
            const username = enableSftpUsername || null;
            const password = enableSftpPassword || null;

            await new Promise<void>((resolve, reject) => {
                const timeoutId = setTimeout(() => {
                    channel.disconnect();
                    reject(new Error('Connection timed out.'));
                }, 15_000);

                channel.on_connection_error((_event: unknown) => {
                    clearTimeout(timeoutId);
                    channel.disconnect();
                    reject(new Error('WebSocket connection error.'));
                });

                channel.on_connection_open(() => {
                    channel.authenticate(token, nodeId);
                });

                channel.on_connection_error((error: unknown) => {
                    console.warn('Connection error occurred', error);
                });

                channel.on_protocol_message_type('AuthSuccess', () => {
                    channel.enable_service(nodeId, 'sftp', host, portNum, username, password, null);
                });

                channel.on_protocol_message_type('EnableServiceResponse', (data: { enabled: boolean, error?: string }) => {
                    clearTimeout(timeoutId);
                    channel.disconnect();

                    if (data.enabled) {
                        resolve();
                    } else {
                        reject(new Error(data.error ?? 'Server refused to enable SFTP service.'));
                    }
                });

                channel.on_protocol_message_type('Error', (data: { message?: string }) => {
                    clearTimeout(timeoutId);
                    channel.disconnect();
                    const errFrame = data as { message?: string };
                    reject(new Error(errFrame.message ?? 'Server returned an error.'));
                });

                channel.on_protocol_message((frame: any) => {
                    console.debug('Received protocol message:', frame.data);
                });

                channel.connect();
            });

            updateSftpServiceInNode(nodeId, true);
            closeEnableSftpDialog();
        } catch (err) {
            setEnableSftpError(err instanceof Error ? err.message : 'Failed to enable SFTP.');
        } finally {
            setEnableSftpSubmitting(false);
        }
    };

    const submitDisableSftp = async () => {
        if (!nodeToDisableSftp) return;

        setDisableSftpSubmitting(true);
        setDisableSftpError(null);

        try {
            const tokenRes = await fetch('/api/auth/websocket-token', {
                credentials: 'same-origin',
                cache: 'no-store',
            });
            if (!tokenRes.ok) {
                throw new Error(tokenRes.status === 401 ? 'Not authenticated.' : 'Failed to load auth token.');
            }
            const tokenPayload = await tokenRes.json() as { token?: string };
            if (!tokenPayload.token) {
                throw new Error('Auth token response was empty.');
            }

            await initChannel();

            const endpoint = buildWsEndpoint();
            const channel = new Channel(endpoint, nodeToDisableSftp.id, nodeToDisableSftp.server_id ?? null);
            const nodeId = nodeToDisableSftp.id;
            const token = tokenPayload.token;
            const host = '0.0.0.0';
            const portNum = 22;
            const username = null;
            const password = null;

            await new Promise<void>((resolve, reject) => {
                const timeoutId = setTimeout(() => {
                    channel.disconnect();
                    reject(new Error('Connection timed out.'));
                }, 15_000);

                channel.on_connection_error((_event: unknown) => {
                    clearTimeout(timeoutId);
                    channel.disconnect();
                    reject(new Error('WebSocket connection error.'));
                });

                channel.on_connection_open(() => {
                    channel.authenticate(token, nodeId);
                });

                channel.on_connection_error((error: unknown) => {
                    console.warn('Connection error occurred', error);
                });

                channel.on_protocol_message_type('AuthSuccess', () => {
                    channel.disable_service(nodeId, 'sftp', host, portNum, username, password, null);
                });

                channel.on_protocol_message_type('DisableServiceResponse', (data: { disabled?: boolean, enabled?: boolean, error?: string }) => {
                    clearTimeout(timeoutId);
                    channel.disconnect();

                    if (data.disabled === true || data.enabled === false) {
                        resolve();
                    } else {
                        reject(new Error(data.error ?? 'Server refused to disable SFTP service.'));
                    }
                });

                channel.on_protocol_message_type('Error', (data: { message?: string }) => {
                    clearTimeout(timeoutId);
                    channel.disconnect();
                    const errFrame = data as { message?: string };
                    reject(new Error(errFrame.message ?? 'Server returned an error.'));
                });

                channel.on_protocol_message((frame: any) => {
                    console.debug('Received protocol message:', frame.data);
                });

                channel.connect();
            });

            updateSftpServiceInNode(nodeId, false);
            closeDisableSftpDialog();
        } catch (err) {
            setDisableSftpError(err instanceof Error ? err.message : 'Failed to disable SFTP.');
        } finally {
            setDisableSftpSubmitting(false);
        }
    };

    const submitEnableHttpProxy = async () => {
        if (!nodeToEnableHttpProxy) return;

        setEnableHttpProxySubmitting(true);
        setEnableHttpProxyError(null);

        try {
            const tokenRes = await fetch('/api/auth/websocket-token', {
                credentials: 'same-origin',
                cache: 'no-store',
            });
            if (!tokenRes.ok) {
                throw new Error(tokenRes.status === 401 ? 'Not authenticated.' : 'Failed to load auth token.');
            }
            const tokenPayload = await tokenRes.json() as { token?: string };
            if (!tokenPayload.token) {
                throw new Error('Auth token response was empty.');
            }

            await initChannel();

            const endpoint = buildWsEndpoint();
            const channel = new Channel(endpoint, nodeToEnableHttpProxy.id, nodeToEnableHttpProxy.server_id ?? null);
            const nodeId = nodeToEnableHttpProxy.id;
            const token = tokenPayload.token;
            const host = enableHttpProxyHost;
            const portNum = parseInt(enableHttpProxyPort, 10) || 8080;
            const username = enableHttpProxyUsername || null;
            const password = enableHttpProxyPassword || null;

            await new Promise<void>((resolve, reject) => {
                const timeoutId = setTimeout(() => {
                    channel.disconnect();
                    reject(new Error('Connection timed out.'));
                }, 15_000);

                channel.on_connection_error((_event: unknown) => {
                    clearTimeout(timeoutId);
                    channel.disconnect();
                    reject(new Error('WebSocket connection error.'));
                });

                channel.on_connection_open(() => {
                    channel.authenticate(token, nodeId);
                });

                channel.on_connection_error((error: unknown) => {
                    console.warn('Connection error occurred', error);
                });

                channel.on_protocol_message_type('AuthSuccess', () => {
                    channel.enable_service(nodeId, 'http', host, portNum, username, password, null);
                });

                channel.on_protocol_message_type('EnableServiceResponse', (data: { enabled: boolean, error?: string }) => {
                    clearTimeout(timeoutId);
                    channel.disconnect();

                    if (data.enabled) {
                        resolve();
                    } else {
                        reject(new Error(data.error ?? 'Server refused to enable HTTP service.'));
                    }
                });

                channel.on_protocol_message_type('Error', (data: { message?: string }) => {
                    clearTimeout(timeoutId);
                    channel.disconnect();
                    const errFrame = data as { message?: string };
                    reject(new Error(errFrame.message ?? 'Server returned an error.'));
                });

                channel.on_protocol_message((frame: any) => {
                    console.debug('Received protocol message:', frame.data);
                });

                channel.connect();
            });

            updateHttpProxyServiceInNode(nodeId, true);
            closeEnableHttpProxyDialog();
        } catch (err) {
            setEnableHttpProxyError(err instanceof Error ? err.message : 'Failed to enable HTTP.');
        } finally {
            setEnableHttpProxySubmitting(false);
        }
    };

    const submitDisableHttpProxy = async () => {
        if (!nodeToDisableHttpProxy) return;

        setDisableHttpProxySubmitting(true);
        setDisableHttpProxyError(null);

        try {
            const tokenRes = await fetch('/api/auth/websocket-token', {
                credentials: 'same-origin',
                cache: 'no-store',
            });
            if (!tokenRes.ok) {
                throw new Error(tokenRes.status === 401 ? 'Not authenticated.' : 'Failed to load auth token.');
            }
            const tokenPayload = await tokenRes.json() as { token?: string };
            if (!tokenPayload.token) {
                throw new Error('Auth token response was empty.');
            }

            await initChannel();

            const endpoint = buildWsEndpoint();
            const channel = new Channel(endpoint, nodeToDisableHttpProxy.id, nodeToDisableHttpProxy.server_id ?? null);
            const nodeId = nodeToDisableHttpProxy.id;
            const token = tokenPayload.token;
            const host = '0.0.0.0';
            const portNum = 8080;
            const username = null;
            const password = null;

            await new Promise<void>((resolve, reject) => {
                const timeoutId = setTimeout(() => {
                    channel.disconnect();
                    reject(new Error('Connection timed out.'));
                }, 15_000);

                channel.on_connection_error((_event: unknown) => {
                    clearTimeout(timeoutId);
                    channel.disconnect();
                    reject(new Error('WebSocket connection error.'));
                });

                channel.on_connection_open(() => {
                    channel.authenticate(token, nodeId);
                });

                channel.on_connection_error((error: unknown) => {
                    console.warn('Connection error occurred', error);
                });

                channel.on_protocol_message_type('AuthSuccess', () => {
                    channel.disable_service(nodeId, 'http', host, portNum, username, password, null);
                });

                channel.on_protocol_message_type('DisableServiceResponse', (data: { disabled?: boolean, enabled?: boolean, error?: string }) => {
                    clearTimeout(timeoutId);
                    channel.disconnect();

                    if (data.disabled === true || data.enabled === false) {
                        resolve();
                    } else {
                        reject(new Error(data.error ?? 'Server refused to disable HTTP service.'));
                    }
                });

                channel.on_protocol_message_type('Error', (data: { message?: string }) => {
                    clearTimeout(timeoutId);
                    channel.disconnect();
                    const errFrame = data as { message?: string };
                    reject(new Error(errFrame.message ?? 'Server returned an error.'));
                });

                channel.on_protocol_message((frame: any) => {
                    console.debug('Received protocol message:', frame.data);
                });

                channel.connect();
            });

            updateHttpProxyServiceInNode(nodeId, false);
            closeDisableHttpProxyDialog();
        } catch (err) {
            setDisableHttpProxyError(err instanceof Error ? err.message : 'Failed to disable HTTP.');
        } finally {
            setDisableHttpProxySubmitting(false);
        }
    };

    const closeDeleteDialog = () => {
        setDeleteDialogOpen(false);
        setDeleteSaving(false);
        setDeleteError(null);
        setNodeToDelete(null);
    };

    const submitDeleteNode = async () => {
        if (!nodeToDelete) {
            return;
        }

        try {
            setDeleteSaving(true);
            setDeleteError(null);

            const response = await fetch('/api/nodes', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    id: nodeToDelete.id,
                }),
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => ({ error: 'Failed to delete node' }));
                throw new Error(payload.error ?? 'Failed to delete node');
            }

            removeNodeFromState(nodeToDelete.id);
            closeDeleteDialog();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to delete node';
            setDeleteError(message);
        } finally {
            setDeleteSaving(false);
        }
    };

    return (
        <div className="container mx-auto px-4 py-6 space-y-6">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Nodes</h1>
                    <p className="text-muted-foreground">Manage your connected servers and infrastructure</p>
                </div>

                <Button size="sm" onClick={handleAddNode} className="gap-2" disabled>
                    <Plus className="h-4 w-4" />
                    Add Node
                </Button>
            </div>

            {/* Stats Section */}
            <DashboardStats nodes={nodes} />

            {/* Loading State */}
            {loading && (
                <div className="text-center py-12 text-muted-foreground">
                    <p>Loading nodes...</p>
                </div>
            )}

            {/* Error State */}
            {error && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-destructive">
                    <p>Error: {error}</p>
                </div>
            )}

            {/* Only show remaining content when not loading */}
            {!loading && !error && (
                <>
                    {/* Monitoring Alerts */}
                    <MonitoringAlerts nodes={nodes} />

                    {/* Actions Bar */}
                    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                        <div className="relative flex-1 w-full sm:max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Search nodes..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 rounded-lg border border-border bg-background/50 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                            />
                        </div>

                        {/* Layout toggle button removed */}
                    </div>

                    {/* Bulk Actions */}
                    {/* BulkActionsBar removed */}

                    {/* Nodes Grid/List */}
                    <div
                        className={cn(
                            viewMode === 'grid'
                                ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
                                : 'flex flex-col gap-3'
                        )}
                    >
                        {filteredNodes.map((node) => (
                            <NodeCard
                                key={node.id}
                                node={node}
                                onCreateTunnel={handleCreateTunnel}
                                onOpenFiles={handleOpenFiles}
                                onRefreshStats={handleRefreshStats}
                                onShare={handleShare}
                                onViewNodeId={handleViewNodeId}
                                onRename={handleRenameNode}
                                onDelete={handleDeleteNode}
                                onEnableSsh={() => openEnableSshDialog(node)}
                                onDisableSsh={() => openDisableSshDialog(node)}
                                onEnableSftp={() => openEnableSftpDialog(node)}
                                onDisableSftp={() => openDisableSftpDialog(node)}
                                onEnableHttpProxy={() => openEnableHttpProxyDialog(node)}
                                onDisableHttpProxy={() => openDisableHttpProxyDialog(node)}
                            />
                        ))}
                    </div>

                    <Dialog
                        open={enableSshDialogOpen}
                        onOpenChange={(open) => {
                            if (!open) {
                                closeEnableSshDialog();
                            } else {
                                setEnableSshDialogOpen(true);
                            }
                        }}
                    >
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Enable SSH</DialogTitle>
                                <DialogDescription>
                                    Configure SSH settings for {nodeToEnableSsh?.name ?? 'this node'}.
                                </DialogDescription>
                            </DialogHeader>

                            <form
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    void submitEnableSsh();
                                }}
                                className="space-y-4"
                            >
                                <div>
                                    <label className="block text-sm font-medium mb-1">Host</label>
                                    <Input
                                        value={enableSshHost}
                                        onChange={(event) => setEnableSshHost(event.target.value)}
                                        placeholder="0.0.0.0"
                                        disabled={enableSshSubmitting}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Port</label>
                                    <Input
                                        value={enableSshPort}
                                        onChange={(event) => setEnableSshPort(event.target.value)}
                                        placeholder="22"
                                        type="number"
                                        min="1"
                                        max="65535"
                                        disabled={enableSshSubmitting}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Username</label>
                                    <Input
                                        value={enableSshUsername}
                                        onChange={(event) => setEnableSshUsername(event.target.value)}
                                        placeholder="Username"
                                        disabled={enableSshSubmitting}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Password</label>
                                    <Input
                                        value={enableSshPassword}
                                        onChange={(event) => setEnableSshPassword(event.target.value)}
                                        placeholder="Password"
                                        type="password"
                                        disabled={enableSshSubmitting}
                                    />
                                </div>
                                {enableSshError && (
                                    <p className="text-sm text-destructive">{enableSshError}</p>
                                )}
                                <DialogFooter>
                                    <Button type="button" variant="outline" onClick={closeEnableSshDialog} disabled={enableSshSubmitting}>
                                        Cancel
                                    </Button>
                                    <Button type="submit" disabled={enableSshSubmitting}>
                                        {enableSshSubmitting ? 'Enabling...' : 'Enable SSH'}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>

                    <Dialog
                        open={disableSshDialogOpen}
                        onOpenChange={(open) => {
                            if (!open) {
                                closeDisableSshDialog();
                            } else {
                                setDisableSshDialogOpen(true);
                            }
                        }}
                    >
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Disable SSH</DialogTitle>
                                <DialogDescription>
                                    Disable SSH service for {nodeToDisableSsh?.name ?? 'this node'}?
                                </DialogDescription>
                            </DialogHeader>

                            {disableSshError ? (
                                <p className="text-sm text-destructive">{disableSshError}</p>
                            ) : null}

                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={closeDisableSshDialog} disabled={disableSshSubmitting}>
                                    Cancel
                                </Button>
                                <Button
                                    type="button"
                                    variant="destructive"
                                    onClick={() => {
                                        void submitDisableSsh();
                                    }}
                                    disabled={disableSshSubmitting}
                                >
                                    {disableSshSubmitting ? 'Disabling...' : 'Disable SSH'}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                    <Dialog
                        open={enableSftpDialogOpen}
                        onOpenChange={(open) => {
                            if (!open) {
                                closeEnableSftpDialog();
                            } else {
                                setEnableSftpDialogOpen(true);
                            }
                        }}
                    >
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Enable SFTP</DialogTitle>
                                <DialogDescription>
                                    Configure SFTP settings for {nodeToEnableSftp?.name ?? 'this node'}.
                                </DialogDescription>
                            </DialogHeader>

                            <form
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    void submitEnableSftp();
                                }}
                                className="space-y-4"
                            >
                                <div>
                                    <label className="block text-sm font-medium mb-1">Host</label>
                                    <Input
                                        value={enableSftpHost}
                                        onChange={(event) => setEnableSftpHost(event.target.value)}
                                        placeholder="0.0.0.0"
                                        disabled={enableSftpSubmitting}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Port</label>
                                    <Input
                                        value={enableSftpPort}
                                        onChange={(event) => setEnableSftpPort(event.target.value)}
                                        placeholder="22"
                                        type="number"
                                        min="1"
                                        max="65535"
                                        disabled={enableSftpSubmitting}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Username</label>
                                    <Input
                                        value={enableSftpUsername}
                                        onChange={(event) => setEnableSftpUsername(event.target.value)}
                                        placeholder="Username"
                                        disabled={enableSftpSubmitting}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Password</label>
                                    <Input
                                        value={enableSftpPassword}
                                        onChange={(event) => setEnableSftpPassword(event.target.value)}
                                        placeholder="Password"
                                        type="password"
                                        disabled={enableSftpSubmitting}
                                    />
                                </div>
                                {enableSftpError && (
                                    <p className="text-sm text-destructive">{enableSftpError}</p>
                                )}
                                <DialogFooter>
                                    <Button type="button" variant="outline" onClick={closeEnableSftpDialog} disabled={enableSftpSubmitting}>
                                        Cancel
                                    </Button>
                                    <Button type="submit" disabled={enableSftpSubmitting}>
                                        {enableSftpSubmitting ? 'Enabling...' : 'Enable SFTP'}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>

                    <Dialog
                        open={disableSftpDialogOpen}
                        onOpenChange={(open) => {
                            if (!open) {
                                closeDisableSftpDialog();
                            } else {
                                setDisableSftpDialogOpen(true);
                            }
                        }}
                    >
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Disable SFTP</DialogTitle>
                                <DialogDescription>
                                    Disable SFTP service for {nodeToDisableSftp?.name ?? 'this node'}?
                                </DialogDescription>
                            </DialogHeader>

                            {disableSftpError ? (
                                <p className="text-sm text-destructive">{disableSftpError}</p>
                            ) : null}

                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={closeDisableSftpDialog} disabled={disableSftpSubmitting}>
                                    Cancel
                                </Button>
                                <Button
                                    type="button"
                                    variant="destructive"
                                    onClick={() => {
                                        void submitDisableSftp();
                                    }}
                                    disabled={disableSftpSubmitting}
                                >
                                    {disableSftpSubmitting ? 'Disabling...' : 'Disable SFTP'}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                    <Dialog
                        open={enableHttpProxyDialogOpen}
                        onOpenChange={(open) => {
                            if (!open) {
                                closeEnableHttpProxyDialog();
                            } else {
                                setEnableHttpProxyDialogOpen(true);
                            }
                        }}
                    >
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Enable HTTP</DialogTitle>
                                <DialogDescription>
                                    Configure HTTP settings for {nodeToEnableHttpProxy?.name ?? 'this node'}.
                                </DialogDescription>
                            </DialogHeader>

                            <form
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    void submitEnableHttpProxy();
                                }}
                                className="space-y-4"
                            >
                                <div>
                                    <label className="block text-sm font-medium mb-1">Host</label>
                                    <Input
                                        value={enableHttpProxyHost}
                                        onChange={(event) => setEnableHttpProxyHost(event.target.value)}
                                        placeholder="0.0.0.0"
                                        disabled={enableHttpProxySubmitting}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Port</label>
                                    <Input
                                        value={enableHttpProxyPort}
                                        onChange={(event) => setEnableHttpProxyPort(event.target.value)}
                                        placeholder="8080"
                                        type="number"
                                        min="1"
                                        max="65535"
                                        disabled={enableHttpProxySubmitting}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Username</label>
                                    <Input
                                        value={enableHttpProxyUsername}
                                        onChange={(event) => setEnableHttpProxyUsername(event.target.value)}
                                        placeholder="Username"
                                        disabled={enableHttpProxySubmitting}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Password</label>
                                    <Input
                                        value={enableHttpProxyPassword}
                                        onChange={(event) => setEnableHttpProxyPassword(event.target.value)}
                                        placeholder="Password"
                                        type="password"
                                        disabled={enableHttpProxySubmitting}
                                    />
                                </div>
                                {enableHttpProxyError && (
                                    <p className="text-sm text-destructive">{enableHttpProxyError}</p>
                                )}
                                <DialogFooter>
                                    <Button type="button" variant="outline" onClick={closeEnableHttpProxyDialog} disabled={enableHttpProxySubmitting}>
                                        Cancel
                                    </Button>
                                    <Button type="submit" disabled={enableHttpProxySubmitting}>
                                        {enableHttpProxySubmitting ? 'Enabling...' : 'Enable HTTP'}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>

                    <Dialog
                        open={disableHttpProxyDialogOpen}
                        onOpenChange={(open) => {
                            if (!open) {
                                closeDisableHttpProxyDialog();
                            } else {
                                setDisableHttpProxyDialogOpen(true);
                            }
                        }}
                    >
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Disable HTTP</DialogTitle>
                                <DialogDescription>
                                    Disable HTTP service for {nodeToDisableHttpProxy?.name ?? 'this node'}?
                                </DialogDescription>
                            </DialogHeader>

                            {disableHttpProxyError ? (
                                <p className="text-sm text-destructive">{disableHttpProxyError}</p>
                            ) : null}

                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={closeDisableHttpProxyDialog} disabled={disableHttpProxySubmitting}>
                                    Cancel
                                </Button>
                                <Button
                                    type="button"
                                    variant="destructive"
                                    onClick={() => {
                                        void submitDisableHttpProxy();
                                    }}
                                    disabled={disableHttpProxySubmitting}
                                >
                                    {disableHttpProxySubmitting ? 'Disabling...' : 'Disable HTTP'}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                    {filteredNodes.length === 0 && (
                        <div className="text-center py-12 text-muted-foreground">
                            <p>No nodes found matching your search.</p>
                        </div>
                    )}

                    {/* File Panel */}
                    <FilePanel
                        isOpen={filePanelOpen}
                        onClose={() => setFilePanelOpen(false)}
                        nodes={nodes}
                        tabs={filePanelTabs}
                        activeTabId={activeFileTabId}
                        onSelectTab={setActiveFileTabId}
                        onCloseTab={handleCloseFileTab}
                    />

                    {/* Create Tunnel Panel */}
                    <CreateTunnelPanel
                        isOpen={createTunnelPanelOpen}
                        onClose={() => {
                            setCreateTunnelPanelOpen(false);
                        }}
                        nodeId={selectedTunnelNode?.id}
                        serverId={selectedTunnelNode?.server_id}
                        nodeName={selectedTunnelNode?.name}
                    />

                    {/* Share Node Dialog */}
                    <ShareNodeDialog
                        open={shareDialogOpen}
                        onOpenChange={setShareDialogOpen}
                        node={nodeToShare}
                    />

                    {/* Share Management Dialog */}
                    <ShareManagementDialog
                        open={shareManagementOpen}
                        onOpenChange={setShareManagementOpen}
                        node={null}
                    />

                    <Dialog
                        open={viewNodeIdDialogOpen}
                        onOpenChange={(open) => {
                            if (!open) {
                                closeViewNodeIdDialog();
                            } else {
                                setViewNodeIdDialogOpen(true);
                            }
                        }}
                    >
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Node ID</DialogTitle>
                                <DialogDescription>
                                    View and copy the node identifier for {nodeToViewId?.name ?? 'this node'}.
                                </DialogDescription>
                            </DialogHeader>

                            <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                                <div className="flex items-start gap-3 mb-3">
                                    <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5" />
                                    <div>
                                        <h4 className="font-medium text-green-500">Node ID Ready</h4>
                                        <p className="text-sm text-muted-foreground mt-1">
                                            Copy your node ID now for use in setup or integrations.
                                        </p>
                                    </div>
                                </div>
                                <div className="relative mt-3">
                                    <Input
                                        value={nodeToViewId?.id ?? ''}
                                        readOnly
                                        className="pr-10 font-mono text-sm"
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                        aria-label="Copy node id to clipboard"
                                        onClick={() => void copyNodeIdToClipboard()}
                                    >
                                        {nodeIdCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                                    </Button>
                                </div>
                                {nodeIdCopied ? <p className="text-sm text-green-500 mt-2">Copied to clipboard.</p> : null}
                            </div>

                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={closeViewNodeIdDialog}>
                                    Close
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                    <Dialog
                        open={renameDialogOpen}
                        onOpenChange={(open) => {
                            if (!open) {
                                closeRenameDialog();
                            } else {
                                setRenameDialogOpen(true);
                            }
                        }}
                    >
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Rename node</DialogTitle>
                                <DialogDescription>
                                    Update the node display name saved in the database.
                                </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-2">
                                <Input
                                    value={renameValue}
                                    onChange={(event) => setRenameValue(event.target.value)}
                                    placeholder="Node name"
                                    disabled={renameSaving}
                                    maxLength={120}
                                    autoFocus
                                />
                                {renameError ? (
                                    <p className="text-sm text-destructive">{renameError}</p>
                                ) : null}
                            </div>

                            <DialogFooter>
                                <Button variant="outline" onClick={closeRenameDialog} disabled={renameSaving}>
                                    Cancel
                                </Button>
                                <Button onClick={submitRenameNode} disabled={renameSaving || renameValue.trim().length === 0}>
                                    {renameSaving ? 'Saving...' : 'Save'}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                    <Dialog
                        open={deleteDialogOpen}
                        onOpenChange={(open) => {
                            if (!open) {
                                closeDeleteDialog();
                            } else {
                                setDeleteDialogOpen(true);
                            }
                        }}
                    >
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Delete node</DialogTitle>
                                <DialogDescription>
                                    This will permanently remove
                                    {' '}
                                    <span className="font-medium text-foreground">{nodeToDelete?.name ?? 'this node'}</span>
                                    {' '}
                                    from your account.
                                </DialogDescription>
                            </DialogHeader>

                            {deleteError ? (
                                <p className="text-sm text-destructive">{deleteError}</p>
                            ) : null}

                            <DialogFooter>
                                <Button variant="outline" onClick={closeDeleteDialog} disabled={deleteSaving}>
                                    Cancel
                                </Button>
                                <Button variant="destructive" onClick={submitDeleteNode} disabled={deleteSaving || !nodeToDelete}>
                                    {deleteSaving ? 'Deleting...' : 'Delete'}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </>
            )}

            {/* Add Node Dialog (always mounted so it can open even during loading/error states) */}
            <AddNodeDialog open={addNodeOpen} onOpenChange={setAddNodeOpen} />
        </div>
    );
}
