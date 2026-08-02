"use client";
import React, { useState, useEffect, useRef } from 'react';

// ...existing code...
import { DashboardStats } from '@/components/DashboardStats';
import { NodeCard } from '@/components/NodeCard';
import { FilePanel } from '@/components/FilePanel';
import { RdpPanel } from '@/components/RDPPanel';
import { BulkActionsBar } from '@/components/BulkActionsBar';
import { AddNodeDialog } from '@/components/AddNodeDialog';
import { ShareNodeDialog } from '@/components/ShareNodeDialog';
import { ShareManagementDialog } from '@/components/ShareManagementDialog';
import { CreateTunnelPanel } from '@/components/CreateTunnelPanel';
import { MonitoringAlerts } from '@/components/MonitoringAlerts';
import { mockSharedNodes } from '@/data/mockSharedNodes';
import { FilePanelTab, NodeStats, TunnelNode, RdpPanelTab } from '@/types/node';
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
import { toast } from 'sonner';
import { getCachedNodes, setCachedNodes } from '@/lib/nodesCache';
import { removeService, saveService } from '@/lib/service-mutations';
import {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from '@/components/ui/pagination';

const NODES_PER_PAGE = 6;

const getPaginationRange = (page: number, pageCount: number): (number | 'ellipsis')[] => {
    const range: (number | 'ellipsis')[] = [];
    const window = new Set([1, pageCount, page - 1, page, page + 1]);

    for (let i = 1; i <= pageCount; i++) {
        if (window.has(i)) {
            range.push(i);
        } else if (range[range.length - 1] !== 'ellipsis') {
            range.push('ellipsis');
        }
    }

    return range;
};

export default function Nodes() {
    const [initialCachedNodes] = useState(() => getCachedNodes());
    const [nodes, setNodes] = useState<TunnelNode[]>(() => initialCachedNodes ?? []);
    const [loading, setLoading] = useState(() => initialCachedNodes === null);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [nodesPage, setNodesPage] = useState(1);
    // True once we have a live /api/nodes response for this page load. Nodes rendered
    // from the localStorage cache may be stale, so their action buttons stay disabled
    // until the first real response confirms current state.
    const [nodesFresh, setNodesFresh] = useState(initialCachedNodes === null);
    const hasLoadedNodesOnceRef = useRef(initialCachedNodes !== null);

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

                // Merge by id so nodes missing from the response (e.g. dropped due to
                // malformed stats) aren't removed from the UI.
                setNodes((prevNodes) => {
                    const nextById = new Map(nextNodes.map((node) => [node.id, node]));
                    const merged = prevNodes.map((node) => nextById.get(node.id) ?? node);
                    const prevIds = new Set(prevNodes.map((node) => node.id));
                    for (const node of nextNodes) {
                        if (!prevIds.has(node.id)) {
                            merged.push(node);
                        }
                    }
                    setCachedNodes(merged);
                    return merged;
                });
                setError(null);
                setNodesFresh(true);
                hasLoadedNodesOnceRef.current = true;
            } catch (err) {
                if (isDisposed) {
                    return;
                }

                // Only surface the error inline before nodes have ever loaded successfully;
                // once we have a node list, a failed poll shouldn't disturb the UI - just toast it.
                if (!hasLoadedNodesOnceRef.current) {
                    setError('Failed to fetch nodes');
                } else {
                    toast.error('Failed to fetch nodes');
                }
            } finally {
                if (!isDisposed && showLoading) {
                    setLoading(false);
                }
            }
        };

        // Skip the loading spinner on the very first fetch if we already have cached
        // nodes to show instantly; the request still runs to refresh them in the background.
        void fetchNodes(initialCachedNodes === null);

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

    // RDP panel state
    const [rdpPanelOpen, setRdpPanelOpen] = useState(false);
    const [rdpPanelTabs, setRdpPanelTabs] = useState<RdpPanelTab[]>([]);
    const [activeRdpTabId, setActiveRdpTabId] = useState<string | null>(null);

    // Create tunnel panel state
    const [createTunnelPanelOpen, setCreateTunnelPanelOpen] = useState(false);
    const [selectedTunnelNode, setSelectedTunnelNode] = useState<TunnelNode | null>(null);
    const [selectedTunnelServiceId, setSelectedTunnelServiceId] = useState<string | null>(null);
    const [selectedTunnelServiceName, setSelectedTunnelServiceName] = useState<string | null>(null);

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
    const [enableSshMode, setEnableSshMode] = useState<'create' | 'update'>('create');
    const [enableSshLoadingDetails, setEnableSshLoadingDetails] = useState(false);
    const [nodeToEnableSsh, setNodeToEnableSsh] = useState<TunnelNode | null>(null);
    const [enableSshServiceId, setEnableSshServiceId] = useState<string | null>(null);
    const [enableSshName, setEnableSshName] = useState('');
    const [enableSshHost, setEnableSshHost] = useState('0.0.0.0');
    const [enableSshPort, setEnableSshPort] = useState('22');
    const [enableSshUsername, setEnableSshUsername] = useState('');
    const [enableSshPassword, setEnableSshPassword] = useState('');
    const [enableSshSubmitting, setEnableSshSubmitting] = useState(false);
    const [enableSshError, setEnableSshError] = useState<string | null>(null);
    // RDP dialog state. There are no credential fields: CredSSP runs in the
    // browser's own RDP client, so the username and password are entered when
    // the screen is opened and never stored on the service.
    const [enableRdpDialogOpen, setEnableRdpDialogOpen] = useState(false);
    const [enableRdpMode, setEnableRdpMode] = useState<'create' | 'update'>('create');
    const [enableRdpLoadingDetails, setEnableRdpLoadingDetails] = useState(false);
    const [nodeToEnableRdp, setNodeToEnableRdp] = useState<TunnelNode | null>(null);
    const [enableRdpServiceId, setEnableRdpServiceId] = useState<string | null>(null);
    const [enableRdpName, setEnableRdpName] = useState('');
    const [enableRdpHost, setEnableRdpHost] = useState('0.0.0.0');
    const [enableRdpPort, setEnableRdpPort] = useState('3389');
    const [enableRdpSubmitting, setEnableRdpSubmitting] = useState(false);
    const [enableRdpError, setEnableRdpError] = useState<string | null>(null);
    const [disableRdpDialogOpen, setDisableRdpDialogOpen] = useState(false);
    const [nodeToDisableRdp, setNodeToDisableRdp] = useState<TunnelNode | null>(null);
    const [serviceIdToDisableRdp, setServiceIdToDisableRdp] = useState<string | null>(null);
    const [disableRdpSubmitting, setDisableRdpSubmitting] = useState(false);
    const [disableRdpError, setDisableRdpError] = useState<string | null>(null);

    const [disableSshDialogOpen, setDisableSshDialogOpen] = useState(false);
    const [nodeToDisableSsh, setNodeToDisableSsh] = useState<TunnelNode | null>(null);
    const [serviceIdToDisableSsh, setServiceIdToDisableSsh] = useState<string | null>(null);
    const [disableSshSubmitting, setDisableSshSubmitting] = useState(false);
    const [disableSshError, setDisableSshError] = useState<string | null>(null);
    const [enableSftpDialogOpen, setEnableSftpDialogOpen] = useState(false);
    const [enableSftpMode, setEnableSftpMode] = useState<'create' | 'update'>('create');
    const [enableSftpLoadingDetails, setEnableSftpLoadingDetails] = useState(false);
    const [nodeToEnableSftp, setNodeToEnableSftp] = useState<TunnelNode | null>(null);
    const [enableSftpServiceId, setEnableSftpServiceId] = useState<string | null>(null);
    const [enableSftpName, setEnableSftpName] = useState('');
    const [enableSftpHost, setEnableSftpHost] = useState('0.0.0.0');
    const [enableSftpPort, setEnableSftpPort] = useState('22');
    const [enableSftpUsername, setEnableSftpUsername] = useState('');
    const [enableSftpPassword, setEnableSftpPassword] = useState('');
    const [enableSftpSubmitting, setEnableSftpSubmitting] = useState(false);
    const [enableSftpError, setEnableSftpError] = useState<string | null>(null);
    const [disableSftpDialogOpen, setDisableSftpDialogOpen] = useState(false);
    const [nodeToDisableSftp, setNodeToDisableSftp] = useState<TunnelNode | null>(null);
    const [serviceIdToDisableSftp, setServiceIdToDisableSftp] = useState<string | null>(null);
    const [disableSftpSubmitting, setDisableSftpSubmitting] = useState(false);
    const [disableSftpError, setDisableSftpError] = useState<string | null>(null);
    const [enableHttpProxyDialogOpen, setEnableHttpProxyDialogOpen] = useState(false);
    const [enableHttpProxyMode, setEnableHttpProxyMode] = useState<'create' | 'update'>('create');
    const [enableHttpProxyLoadingDetails, setEnableHttpProxyLoadingDetails] = useState(false);
    const [nodeToEnableHttpProxy, setNodeToEnableHttpProxy] = useState<TunnelNode | null>(null);
    const [enableHttpProxyServiceId, setEnableHttpProxyServiceId] = useState<string | null>(null);
    const [enableHttpProxyName, setEnableHttpProxyName] = useState('');
    const [enableHttpProxyHost, setEnableHttpProxyHost] = useState('0.0.0.0');
    const [enableHttpProxyPort, setEnableHttpProxyPort] = useState('8080');
    const [enableHttpProxyUsername, setEnableHttpProxyUsername] = useState('');
    const [enableHttpProxyPassword, setEnableHttpProxyPassword] = useState('');
    const [enableHttpProxyVisibility, setEnableHttpProxyVisibility] = useState<'private' | 'public'>('private');
    const [enableHttpProxyScheme, setEnableHttpProxyScheme] = useState<'http' | 'https'>('http');
    const [enableHttpProxySubmitting, setEnableHttpProxySubmitting] = useState(false);
    const [enableHttpProxyError, setEnableHttpProxyError] = useState<string | null>(null);
    const [disableHttpProxyDialogOpen, setDisableHttpProxyDialogOpen] = useState(false);
    const [nodeToDisableHttpProxy, setNodeToDisableHttpProxy] = useState<TunnelNode | null>(null);
    const [serviceIdToDisableHttpProxy, setServiceIdToDisableHttpProxy] = useState<string | null>(null);
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

    const nodesPageCount = Math.max(1, Math.ceil(filteredNodes.length / NODES_PER_PAGE));
    const clampedNodesPage = Math.min(nodesPage, nodesPageCount);
    const pagedNodes = filteredNodes.slice((clampedNodesPage - 1) * NODES_PER_PAGE, clampedNodesPage * NODES_PER_PAGE);

    const renderNodesPager = (page: number, pageCount: number, onPageChange: (page: number) => void) => {
        if (pageCount <= 1) {
            return null;
        }

        return (
            <Pagination className="justify-end">
                <PaginationContent>
                    <PaginationItem>
                        <PaginationPrevious
                            href="#"
                            aria-disabled={page === 1}
                            className={page === 1 ? 'pointer-events-none opacity-50' : undefined}
                            onClick={(e) => {
                                e.preventDefault();
                                if (page > 1) onPageChange(page - 1);
                            }}
                        />
                    </PaginationItem>
                    {getPaginationRange(page, pageCount).map((entry, index) => (
                        entry === 'ellipsis' ? (
                            <PaginationItem key={`ellipsis-${index}`}>
                                <PaginationEllipsis />
                            </PaginationItem>
                        ) : (
                            <PaginationItem key={entry}>
                                <PaginationLink
                                    href="#"
                                    isActive={entry === page}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        onPageChange(entry);
                                    }}
                                >
                                    {entry}
                                </PaginationLink>
                            </PaginationItem>
                        )
                    ))}
                    <PaginationItem>
                        <PaginationNext
                            href="#"
                            aria-disabled={page === pageCount}
                            className={page === pageCount ? 'pointer-events-none opacity-50' : undefined}
                            onClick={(e) => {
                                e.preventDefault();
                                if (page < pageCount) onPageChange(page + 1);
                            }}
                        />
                    </PaginationItem>
                </PaginationContent>
            </Pagination>
        );
    };

    const handleCreateTunnel = (node: TunnelNode, serviceId: string, serviceName?: string | null) => {
        setSelectedTunnelNode({ ...node });
        setSelectedTunnelServiceId(serviceId);
        setSelectedTunnelServiceName(serviceName ?? null);
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

    const handleOpenFiles = (node: TunnelNode, serviceId: string, serviceName?: string | null) => {
        setFilePanelTabs((prev) => {
            const existingTab = prev.find((tab) => tab.nodeId === node.id && tab.serviceId === serviceId);
            if (existingTab) {
                setActiveFileTabId(existingTab.id);
                return prev;
            }

            const newTab: FilePanelTab = {
                id: `file-${node.id}-${serviceId}`,
                nodeId: node.id,
                nodeName: node.name,
                serverId: node.server_id,
                serviceId,
                serviceName: serviceName ?? null,
            };

            setActiveFileTabId(newTab.id);
            return [...prev, newTab];
        });
        setFilePanelOpen(true);
    };

    const openScreen = async (node: TunnelNode, serviceId: string, serviceName?: string | null) => {
        const existingTab = rdpPanelTabs.find((tab) => tab.nodeId === node.id && tab.serviceId === serviceId);
        if (existingTab) {
            setActiveRdpTabId(existingTab.id);
            setRdpPanelOpen(true);
            return;
        }

        // Only for the CredSSP service principal — the agent dials the host in
        // its own settings regardless, so a failed lookup is not fatal.
        const services = await fetchServicesForKind(node.id, 'rdp');
        const detail = services.find((service) => service.id === serviceId) ?? null;

        const newTab: RdpPanelTab = {
            id: `rdp-${node.id}-${serviceId}`,
            nodeId: node.id,
            nodeName: node.name,
            serverId: node.server_id,
            serviceId,
            serviceName: serviceName ?? null,
            destination: detail ? `${detail.host}:${detail.port}` : undefined,
        };

        setRdpPanelTabs((prev) => (
            prev.some((tab) => tab.id === newTab.id) ? prev : [...prev, newTab]
        ));
        setActiveRdpTabId(newTab.id);
        setRdpPanelOpen(true);
    };

    const handleCloseRdpTab = (tabId: string) => {
        setRdpPanelTabs((prev) => {
            const remainingTabs = prev.filter((tab) => tab.id !== tabId);

            setActiveRdpTabId((currentActiveTabId) => {
                if (currentActiveTabId !== tabId) {
                    return currentActiveTabId;
                }

                const closedTabIndex = prev.findIndex((tab) => tab.id === tabId);
                const fallbackTab = remainingTabs[Math.max(0, closedTabIndex - 1)] ?? remainingTabs[0] ?? null;
                return fallbackTab?.id ?? null;
            });

            if (remainingTabs.length === 0) {
                setRdpPanelOpen(false);
            }

            return remainingTabs;
        });
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

    type ServiceDetail = {
        id: string;
        name: string | null;
        kind: string;
        host: string;
        port: number;
        username: string | null;
        password: string | null;
        visibility: 'public' | 'private';
        scheme: 'http' | 'https' | null;
    };

    const fetchServicesForKind = async (nodeId: string, kind: 'ssh' | 'sftp' | 'http' | 'rdp'): Promise<ServiceDetail[]> => {
        try {
            const res = await fetch(`/api/nodes/services?id=${encodeURIComponent(nodeId)}&kind=${kind}`, {
                credentials: 'include',
            });
            if (!res.ok) {
                return [];
            }
            const data = await res.json() as { services?: ServiceDetail[] };
            return data.services ?? [];
        } catch {
            return [];
        }
    };

    const openEditSshDialog = async (node: TunnelNode, serviceId: string) => {
        setNodeToEnableSsh(node);
        setEnableSshMode('update');
        setEnableSshServiceId(serviceId);
        setEnableSshError(null);
        setEnableSshLoadingDetails(true);
        setEnableSshDialogOpen(true);

        const services = await fetchServicesForKind(node.id, 'ssh');
        const detail = services.find((s) => s.id === serviceId) ?? null;
        setEnableSshName(detail?.name ?? '');
        setEnableSshHost(detail?.host || '0.0.0.0');
        setEnableSshPort(detail ? String(detail.port) : '22');
        setEnableSshUsername(detail?.username ?? '');
        setEnableSshPassword(detail?.password ?? '');
        setEnableSshLoadingDetails(false);
    };

    const openEditSftpDialog = async (node: TunnelNode, serviceId: string) => {
        setNodeToEnableSftp(node);
        setEnableSftpMode('update');
        setEnableSftpServiceId(serviceId);
        setEnableSftpError(null);
        setEnableSftpLoadingDetails(true);
        setEnableSftpDialogOpen(true);

        const services = await fetchServicesForKind(node.id, 'sftp');
        const detail = services.find((s) => s.id === serviceId) ?? null;
        setEnableSftpName(detail?.name ?? '');
        setEnableSftpHost(detail?.host || '0.0.0.0');
        setEnableSftpPort(detail ? String(detail.port) : '22');
        setEnableSftpUsername(detail?.username ?? '');
        setEnableSftpPassword(detail?.password ?? '');
        setEnableSftpLoadingDetails(false);
    };

    const openEditHttpProxyDialog = async (node: TunnelNode, serviceId: string) => {
        setNodeToEnableHttpProxy(node);
        setEnableHttpProxyMode('update');
        setEnableHttpProxyServiceId(serviceId);
        setEnableHttpProxyError(null);
        setEnableHttpProxyLoadingDetails(true);
        setEnableHttpProxyDialogOpen(true);

        const services = await fetchServicesForKind(node.id, 'http');
        const detail = services.find((s) => s.id === serviceId) ?? null;
        setEnableHttpProxyName(detail?.name ?? '');
        setEnableHttpProxyHost(detail?.host || '0.0.0.0');
        setEnableHttpProxyPort(detail ? String(detail.port) : '8080');
        setEnableHttpProxyUsername(detail?.username ?? '');
        setEnableHttpProxyPassword(detail?.password ?? '');
        setEnableHttpProxyVisibility(detail?.visibility ?? 'private');
        setEnableHttpProxyScheme(detail?.scheme ?? 'http');
        setEnableHttpProxyLoadingDetails(false);
    };

    const openEnableSshDialog = (node: TunnelNode, mode: 'create' | 'update' = 'create') => {
        setNodeToEnableSsh(node);
        setEnableSshMode(mode);
        setEnableSshServiceId(null);
        setEnableSshName('');
        setEnableSshHost('0.0.0.0');
        setEnableSshPort('22');
        setEnableSshUsername('');
        setEnableSshPassword('');
        setEnableSshError(null);
        setEnableSshDialogOpen(true);
    };

    const openDisableSshDialog = (node: TunnelNode, serviceId: string) => {
        setNodeToDisableSsh(node);
        setServiceIdToDisableSsh(serviceId);
        setDisableSshError(null);
        setDisableSshDialogOpen(true);
    };

    const closeEnableSshDialog = () => {
        setEnableSshDialogOpen(false);
        setNodeToEnableSsh(null);
        setEnableSshServiceId(null);
    };

    const closeDisableSshDialog = () => {
        setDisableSshDialogOpen(false);
        setNodeToDisableSsh(null);
        setServiceIdToDisableSsh(null);
    };

    const openEditRdpDialog = async (node: TunnelNode, serviceId: string) => {
        setNodeToEnableRdp(node);
        setEnableRdpMode('update');
        setEnableRdpServiceId(serviceId);
        setEnableRdpError(null);
        setEnableRdpLoadingDetails(true);
        setEnableRdpDialogOpen(true);

        const services = await fetchServicesForKind(node.id, 'rdp');
        const detail = services.find((s) => s.id === serviceId) ?? null;
        setEnableRdpName(detail?.name ?? '');
        setEnableRdpHost(detail?.host || '0.0.0.0');
        setEnableRdpPort(detail ? String(detail.port) : '3389');
        setEnableRdpLoadingDetails(false);
    };

    const openEnableRdpDialog = (node: TunnelNode, mode: 'create' | 'update' = 'create') => {
        setNodeToEnableRdp(node);
        setEnableRdpMode(mode);
        setEnableRdpServiceId(null);
        setEnableRdpName('');
        setEnableRdpHost('0.0.0.0');
        setEnableRdpPort('3389');
        setEnableRdpError(null);
        setEnableRdpDialogOpen(true);
    };

    const openDisableRdpDialog = (node: TunnelNode, serviceId: string) => {
        setNodeToDisableRdp(node);
        setServiceIdToDisableRdp(serviceId);
        setDisableRdpError(null);
        setDisableRdpDialogOpen(true);
    };

    const closeEnableRdpDialog = () => {
        setEnableRdpDialogOpen(false);
        setNodeToEnableRdp(null);
        setEnableRdpServiceId(null);
    };

    const closeDisableRdpDialog = () => {
        setDisableRdpDialogOpen(false);
        setNodeToDisableRdp(null);
        setServiceIdToDisableRdp(null);
    };

    const submitEnableRdp = async () => {
        if (!nodeToEnableRdp) return;

        setEnableRdpSubmitting(true);
        setEnableRdpError(null);

        const isUpdate = enableRdpMode === 'update';

        try {
            await saveService(
                buildWsEndpoint(),
                nodeToEnableRdp,
                {
                    kind: 'rdp',
                    name: enableRdpName.trim() || null,
                    host: enableRdpHost,
                    port: parseInt(enableRdpPort, 10) || 3389,
                },
                isUpdate ? enableRdpServiceId : null,
            );

            updateServiceInNode(nodeToEnableRdp.id, 'RDP', true);
            toast.success(isUpdate ? 'RDP service updated' : 'RDP service created');
            closeEnableRdpDialog();
        } catch (err) {
            setEnableRdpError(err instanceof Error ? err.message : 'Failed to enable RDP.');
        } finally {
            setEnableRdpSubmitting(false);
        }
    };

    const submitDisableRdp = async () => {
        if (!nodeToDisableRdp || !serviceIdToDisableRdp) return;

        setDisableRdpSubmitting(true);
        setDisableRdpError(null);

        try {
            await removeService(buildWsEndpoint(), nodeToDisableRdp, serviceIdToDisableRdp, 'rdp');

            updateServiceInNode(nodeToDisableRdp.id, 'RDP', false);
            toast.success('RDP service deleted');
            closeDisableRdpDialog();
        } catch (err) {
            setDisableRdpError(err instanceof Error ? err.message : 'Failed to delete RDP.');
        } finally {
            setDisableRdpSubmitting(false);
        }
    };

    const openEnableSftpDialog = (node: TunnelNode, mode: 'create' | 'update' = 'create') => {
        setNodeToEnableSftp(node);
        setEnableSftpMode(mode);
        setEnableSftpServiceId(null);
        setEnableSftpName('');
        setEnableSftpHost('0.0.0.0');
        setEnableSftpPort('22');
        setEnableSftpUsername('');
        setEnableSftpPassword('');
        setEnableSftpError(null);
        setEnableSftpDialogOpen(true);
    };

    const openDisableSftpDialog = (node: TunnelNode, serviceId: string) => {
        setNodeToDisableSftp(node);
        setServiceIdToDisableSftp(serviceId);
        setDisableSftpError(null);
        setDisableSftpDialogOpen(true);
    };

    const closeEnableSftpDialog = () => {
        setEnableSftpDialogOpen(false);
        setNodeToEnableSftp(null);
        setEnableSftpServiceId(null);
    };

    const closeDisableSftpDialog = () => {
        setDisableSftpDialogOpen(false);
        setNodeToDisableSftp(null);
        setServiceIdToDisableSftp(null);
    };

    const openEnableHttpProxyDialog = (node: TunnelNode, mode: 'create' | 'update' = 'create') => {
        setNodeToEnableHttpProxy(node);
        setEnableHttpProxyMode(mode);
        setEnableHttpProxyServiceId(null);
        setEnableHttpProxyName('');
        setEnableHttpProxyHost('0.0.0.0');
        setEnableHttpProxyPort('8080');
        setEnableHttpProxyUsername('');
        setEnableHttpProxyPassword('');
        setEnableHttpProxyVisibility('private');
        setEnableHttpProxyScheme('http');
        setEnableHttpProxyError(null);
        setEnableHttpProxyDialogOpen(true);
    };

    const openDisableHttpProxyDialog = (node: TunnelNode, serviceId: string) => {
        setNodeToDisableHttpProxy(node);
        setServiceIdToDisableHttpProxy(serviceId);
        setDisableHttpProxyError(null);
        setDisableHttpProxyDialogOpen(true);
    };

    const closeEnableHttpProxyDialog = () => {
        setEnableHttpProxyDialogOpen(false);
        setNodeToEnableHttpProxy(null);
        setEnableHttpProxyServiceId(null);
    };

    const closeDisableHttpProxyDialog = () => {
        setDisableHttpProxyDialogOpen(false);
        setNodeToDisableHttpProxy(null);
        setServiceIdToDisableHttpProxy(null);
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

    const normalizeServiceKind = (service: string) => service.trim().toUpperCase().replace(/[\s_-]+/g, '');

    const upsertServiceCount = (
        services: TunnelNode['services'],
        kind: string,
        isEnabled: boolean,
        visibility?: 'public' | 'private'
    ) => {
        const existingKey = Object.keys(services).find((service) => normalizeServiceKind(service) === kind);

        if (!isEnabled) {
            if (!existingKey) {
                return services;
            }
            const { [existingKey]: _removed, ...rest } = services;
            return rest;
        }

        if (existingKey) {
            return services;
        }

        return { ...services, [kind]: visibility ? { visibility, count: 1 } : 1 };
    };

    const updateServiceInNode = (nodeId: string, kind: string, isEnabled: boolean, visibility?: 'public' | 'private') => {
        const updateNodeServices = (entry: TunnelNode) => (
            entry.id === nodeId
                ? { ...entry, services: upsertServiceCount(entry.services ?? {}, kind, isEnabled, visibility) }
                : entry
        );

        setNodes((prev) => prev.map(updateNodeServices));
        setSelectedTunnelNode((prev) => (prev && prev.id === nodeId ? updateNodeServices(prev) : prev));
        setNodeToShare((prev) => (prev && prev.id === nodeId ? updateNodeServices(prev) : prev));
    };

    const updateSshServiceInNode = (nodeId: string, isEnabled: boolean) => updateServiceInNode(nodeId, 'SSH', isEnabled);
    const updateSftpServiceInNode = (nodeId: string, isEnabled: boolean) => updateServiceInNode(nodeId, 'SFTP', isEnabled);
    const updateHttpProxyServiceInNode = (nodeId: string, isEnabled: boolean, visibility?: 'public' | 'private') =>
        updateServiceInNode(nodeId, 'HTTP', isEnabled, visibility);

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
            const name = enableSshName.trim() || null;
            const host = enableSshHost;
            const portNum = parseInt(enableSshPort, 10) || 22;
            const username = enableSshUsername || null;
            const password = enableSshPassword || null;
            const isUpdate = enableSshMode === 'update';
            const serviceId = enableSshServiceId;
            const responseType = isUpdate ? 'UpdateServiceResponse' : 'CreateServiceResponse';

            await new Promise<void>((resolve, reject) => {
                let settled = false;
                const settle = (fn: () => void) => {
                    if (!settled) { settled = true; fn(); }
                };

                const timeoutId = setTimeout(() => {
                    channel.disconnect();
                    settle(() => reject(new Error('Connection timed out.')));
                }, 35_000);

                channel.on_connection_error((_event: unknown) => {
                    clearTimeout(timeoutId);
                    channel.disconnect();
                    settle(() => reject(new Error('WebSocket connection error.')));
                });

                channel.on_connection_close((_event: unknown) => {
                    clearTimeout(timeoutId);
                    settle(() => reject(new Error('WebSocket connection closed unexpectedly.')));
                });

                channel.on_connection_open(() => {
                    channel.authenticate(token, nodeId);
                });

                channel.on_protocol_message_type('AuthSuccess', () => {
                    if (isUpdate && serviceId) {
                        channel.update_service(nodeId, serviceId, 'ssh', name, host, portNum, username, password, null, null, null);
                    } else {
                        channel.create_service(nodeId, 'ssh', name, host, portNum, username, password, null, null, null);
                    }
                });

                channel.on_protocol_message_type(responseType, (data: { created?: boolean, updated?: boolean, error?: string }) => {
                    clearTimeout(timeoutId);
                    if (data.created || data.updated) {
                        settle(resolve);
                    } else {
                        settle(() => reject(new Error(data.error ?? `Server refused to ${isUpdate ? 'update' : 'enable'} SSH service.`)));
                    }
                    channel.disconnect();
                });

                channel.on_protocol_message_type('Error', (data: { message?: string }) => {
                    clearTimeout(timeoutId);
                    settle(() => reject(new Error(data.message ?? 'Server returned an error.')));
                    channel.disconnect();
                });

                channel.on_protocol_message((frame: { data?: unknown }) => {
                    console.debug('Received protocol message:', frame.data);
                });

                channel.connect();
            });

            updateSshServiceInNode(nodeId, true);
            toast.success(isUpdate ? 'SSH service updated' : 'SSH service created');
            closeEnableSshDialog();
        } catch (err) {
            setEnableSshError(err instanceof Error ? err.message : 'Failed to enable SSH.');
        } finally {
            setEnableSshSubmitting(false);
        }
    };

    const submitDisableSsh = async () => {
        if (!nodeToDisableSsh || !serviceIdToDisableSsh) return;

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
            const serviceId = serviceIdToDisableSsh;
            const token = tokenPayload.token;

            await new Promise<void>((resolve, reject) => {
                let settled = false;
                const settle = (fn: () => void) => {
                    if (!settled) { settled = true; fn(); }
                };

                const timeoutId = setTimeout(() => {
                    channel.disconnect();
                    settle(() => reject(new Error('Connection timed out.')));
                }, 35_000);

                channel.on_connection_error((_event: unknown) => {
                    clearTimeout(timeoutId);
                    channel.disconnect();
                    settle(() => reject(new Error('WebSocket connection error.')));
                });

                channel.on_connection_close((_event: unknown) => {
                    clearTimeout(timeoutId);
                    settle(() => reject(new Error('WebSocket connection closed unexpectedly.')));
                });

                channel.on_connection_open(() => {
                    channel.authenticate(token, nodeId);
                });

                channel.on_protocol_message_type('AuthSuccess', () => {
                    channel.delete_service(nodeId, serviceId, null);
                });

                channel.on_protocol_message_type('DeleteServiceResponse', (data: { deleted?: boolean, error?: string }) => {
                    clearTimeout(timeoutId);
                    if (data.deleted === true) {
                        settle(resolve);
                    } else {
                        settle(() => reject(new Error(data.error ?? 'Server refused to delete SSH service.')));
                    }
                    channel.disconnect();
                });

                channel.on_protocol_message_type('Error', (data: { message?: string }) => {
                    clearTimeout(timeoutId);
                    settle(() => reject(new Error(data.message ?? 'Server returned an error.')));
                    channel.disconnect();
                });

                channel.on_protocol_message((frame: { data?: unknown }) => {
                    console.debug('Received protocol message:', frame.data);
                });

                channel.connect();
            });

            updateSshServiceInNode(nodeId, false);
            toast.success('SSH service deleted');
            closeDisableSshDialog();
        } catch (err) {
            setDisableSshError(err instanceof Error ? err.message : 'Failed to delete SSH.');
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
            const name = enableSftpName.trim() || null;
            const host = enableSftpHost;
            const portNum = parseInt(enableSftpPort, 10) || 22;
            const username = enableSftpUsername || null;
            const password = enableSftpPassword || null;
            const isUpdate = enableSftpMode === 'update';
            const serviceId = enableSftpServiceId;
            const responseType = isUpdate ? 'UpdateServiceResponse' : 'CreateServiceResponse';

            await new Promise<void>((resolve, reject) => {
                let settled = false;
                const settle = (fn: () => void) => {
                    if (!settled) { settled = true; fn(); }
                };

                const timeoutId = setTimeout(() => {
                    channel.disconnect();
                    settle(() => reject(new Error('Connection timed out.')));
                }, 35_000);

                channel.on_connection_error((_event: unknown) => {
                    clearTimeout(timeoutId);
                    channel.disconnect();
                    settle(() => reject(new Error('WebSocket connection error.')));
                });

                channel.on_connection_close((_event: unknown) => {
                    clearTimeout(timeoutId);
                    settle(() => reject(new Error('WebSocket connection closed unexpectedly.')));
                });

                channel.on_connection_open(() => {
                    channel.authenticate(token, nodeId);
                });

                channel.on_protocol_message_type('AuthSuccess', () => {
                    if (isUpdate && serviceId) {
                        channel.update_service(nodeId, serviceId, 'sftp', name, host, portNum, username, password, null, null, null);
                    } else {
                        channel.create_service(nodeId, 'sftp', name, host, portNum, username, password, null, null, null);
                    }
                });

                channel.on_protocol_message_type(responseType, (data: { created?: boolean, updated?: boolean, error?: string }) => {
                    clearTimeout(timeoutId);
                    if (data.created || data.updated) {
                        settle(resolve);
                    } else {
                        settle(() => reject(new Error(data.error ?? `Server refused to ${isUpdate ? 'update' : 'enable'} SFTP service.`)));
                    }
                    channel.disconnect();
                });

                channel.on_protocol_message_type('Error', (data: { message?: string }) => {
                    clearTimeout(timeoutId);
                    settle(() => reject(new Error(data.message ?? 'Server returned an error.')));
                    channel.disconnect();
                });

                channel.on_protocol_message((frame: { data?: unknown }) => {
                    console.debug('Received protocol message:', frame.data);
                });

                channel.connect();
            });

            updateSftpServiceInNode(nodeId, true);
            toast.success(isUpdate ? 'SFTP service updated' : 'SFTP service created');
            closeEnableSftpDialog();
        } catch (err) {
            setEnableSftpError(err instanceof Error ? err.message : 'Failed to enable SFTP.');
        } finally {
            setEnableSftpSubmitting(false);
        }
    };

    const submitDisableSftp = async () => {
        if (!nodeToDisableSftp || !serviceIdToDisableSftp) return;

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
            const serviceId = serviceIdToDisableSftp;
            const token = tokenPayload.token;

            await new Promise<void>((resolve, reject) => {
                let settled = false;
                const settle = (fn: () => void) => {
                    if (!settled) { settled = true; fn(); }
                };

                const timeoutId = setTimeout(() => {
                    channel.disconnect();
                    settle(() => reject(new Error('Connection timed out.')));
                }, 35_000);

                channel.on_connection_error((_event: unknown) => {
                    clearTimeout(timeoutId);
                    channel.disconnect();
                    settle(() => reject(new Error('WebSocket connection error.')));
                });

                channel.on_connection_close((_event: unknown) => {
                    clearTimeout(timeoutId);
                    settle(() => reject(new Error('WebSocket connection closed unexpectedly.')));
                });

                channel.on_connection_open(() => {
                    channel.authenticate(token, nodeId);
                });

                channel.on_protocol_message_type('AuthSuccess', () => {
                    channel.delete_service(nodeId, serviceId, null);
                });

                channel.on_protocol_message_type('DeleteServiceResponse', (data: { deleted?: boolean, error?: string }) => {
                    clearTimeout(timeoutId);
                    if (data.deleted === true) {
                        settle(resolve);
                    } else {
                        settle(() => reject(new Error(data.error ?? 'Server refused to delete SFTP service.')));
                    }
                    channel.disconnect();
                });

                channel.on_protocol_message_type('Error', (data: { message?: string }) => {
                    clearTimeout(timeoutId);
                    settle(() => reject(new Error(data.message ?? 'Server returned an error.')));
                    channel.disconnect();
                });

                channel.on_protocol_message((frame: { data?: unknown }) => {
                    console.debug('Received protocol message:', frame.data);
                });

                channel.connect();
            });

            updateSftpServiceInNode(nodeId, false);
            toast.success('SFTP service deleted');
            closeDisableSftpDialog();
        } catch (err) {
            setDisableSftpError(err instanceof Error ? err.message : 'Failed to delete SFTP.');
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
            const name = enableHttpProxyName.trim() || null;
            const host = enableHttpProxyHost;
            const portNum = parseInt(enableHttpProxyPort, 10) || 8080;
            const username = enableHttpProxyUsername || null;
            const password = enableHttpProxyPassword || null;
            const isUpdate = enableHttpProxyMode === 'update';
            const serviceId = enableHttpProxyServiceId;
            const responseType = isUpdate ? 'UpdateServiceResponse' : 'CreateServiceResponse';

            await new Promise<void>((resolve, reject) => {
                let settled = false;
                const settle = (fn: () => void) => {
                    if (!settled) { settled = true; fn(); }
                };

                const timeoutId = setTimeout(() => {
                    channel.disconnect();
                    settle(() => reject(new Error('Connection timed out.')));
                }, 35_000);

                channel.on_connection_error((_event: unknown) => {
                    clearTimeout(timeoutId);
                    channel.disconnect();
                    settle(() => reject(new Error('WebSocket connection error.')));
                });

                channel.on_connection_close((_event: unknown) => {
                    clearTimeout(timeoutId);
                    settle(() => reject(new Error('WebSocket connection closed unexpectedly.')));
                });

                channel.on_connection_open(() => {
                    channel.authenticate(token, nodeId);
                });

                channel.on_protocol_message_type('AuthSuccess', () => {
                    if (isUpdate && serviceId) {
                        channel.update_service(nodeId, serviceId, 'http', name, host, portNum, username, password, enableHttpProxyVisibility, enableHttpProxyScheme, null);
                    } else {
                        channel.create_service(nodeId, 'http', name, host, portNum, username, password, enableHttpProxyVisibility, enableHttpProxyScheme, null);
                    }
                });

                channel.on_protocol_message_type(responseType, (data: { created?: boolean, updated?: boolean, error?: string }) => {
                    clearTimeout(timeoutId);
                    if (data.created || data.updated) {
                        settle(resolve);
                    } else {
                        settle(() => reject(new Error(data.error ?? `Server refused to ${isUpdate ? 'update' : 'enable'} HTTP service.`)));
                    }
                    channel.disconnect();
                });

                channel.on_protocol_message_type('Error', (data: { message?: string }) => {
                    clearTimeout(timeoutId);
                    settle(() => reject(new Error(data.message ?? 'Server returned an error.')));
                    channel.disconnect();
                });

                channel.on_protocol_message((frame: { data?: unknown }) => {
                    console.debug('Received protocol message:', frame.data);
                });

                channel.connect();
            });

            updateHttpProxyServiceInNode(nodeId, true, enableHttpProxyVisibility);
            toast.success(isUpdate ? 'HTTP service updated' : 'HTTP service created');
            closeEnableHttpProxyDialog();
        } catch (err) {
            setEnableHttpProxyError(err instanceof Error ? err.message : 'Failed to enable HTTP.');
        } finally {
            setEnableHttpProxySubmitting(false);
        }
    };

    const submitDisableHttpProxy = async () => {
        if (!nodeToDisableHttpProxy || !serviceIdToDisableHttpProxy) return;

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
            const serviceId = serviceIdToDisableHttpProxy;
            const token = tokenPayload.token;

            await new Promise<void>((resolve, reject) => {
                let settled = false;
                const settle = (fn: () => void) => {
                    if (!settled) { settled = true; fn(); }
                };

                const timeoutId = setTimeout(() => {
                    channel.disconnect();
                    settle(() => reject(new Error('Connection timed out.')));
                }, 35_000);

                channel.on_connection_error((_event: unknown) => {
                    clearTimeout(timeoutId);
                    channel.disconnect();
                    settle(() => reject(new Error('WebSocket connection error.')));
                });

                channel.on_connection_close((_event: unknown) => {
                    clearTimeout(timeoutId);
                    settle(() => reject(new Error('WebSocket connection closed unexpectedly.')));
                });

                channel.on_connection_open(() => {
                    channel.authenticate(token, nodeId);
                });

                channel.on_protocol_message_type('AuthSuccess', () => {
                    channel.delete_service(nodeId, serviceId, null);
                });

                channel.on_protocol_message_type('DeleteServiceResponse', (data: { deleted?: boolean, error?: string }) => {
                    clearTimeout(timeoutId);
                    if (data.deleted === true) {
                        settle(resolve);
                    } else {
                        settle(() => reject(new Error(data.error ?? 'Server refused to delete HTTP service.')));
                    }
                    channel.disconnect();
                });

                channel.on_protocol_message_type('Error', (data: { message?: string }) => {
                    clearTimeout(timeoutId);
                    settle(() => reject(new Error(data.message ?? 'Server returned an error.')));
                    channel.disconnect();
                });

                channel.on_protocol_message((frame: { data?: unknown }) => {
                    console.debug('Received protocol message:', frame.data);
                });

                channel.connect();
            });

            updateHttpProxyServiceInNode(nodeId, false);
            toast.success('HTTP service deleted');
            closeDisableHttpProxyDialog();
        } catch (err) {
            setDisableHttpProxyError(err instanceof Error ? err.message : 'Failed to delete HTTP.');
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

            {/* Only show remaining content when not loading; an inline error only
                appears before the first successful load, when there's nothing to show yet */}
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
                                onChange={(e) => { setSearchQuery(e.target.value); setNodesPage(1); }}
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
                        {pagedNodes.map((node) => (
                            <NodeCard
                                key={node.id}
                                node={node}
                                actionsDisabled={!nodesFresh}
                                onCreateTunnel={handleCreateTunnel}
                                onOpenFiles={handleOpenFiles}
                                onRefreshStats={handleRefreshStats}
                                onShare={handleShare}
                                onViewNodeId={handleViewNodeId}
                                onRename={handleRenameNode}
                                onDelete={handleDeleteNode}
                                onOpenScreen={(target, serviceId, serviceName) => void openScreen(target, serviceId, serviceName)}
                                onEnableRdp={() => openEnableRdpDialog(node)}
                                onDisableRdp={(serviceId) => openDisableRdpDialog(node, serviceId)}
                                onEditRdp={(serviceId) => void openEditRdpDialog(node, serviceId)}
                                onEnableSsh={() => openEnableSshDialog(node)}
                                onDisableSsh={(serviceId) => openDisableSshDialog(node, serviceId)}
                                onEditSsh={(serviceId) => void openEditSshDialog(node, serviceId)}
                                onEnableSftp={() => openEnableSftpDialog(node)}
                                onDisableSftp={(serviceId) => openDisableSftpDialog(node, serviceId)}
                                onEditSftp={(serviceId) => void openEditSftpDialog(node, serviceId)}
                                onEnableHttpProxy={() => openEnableHttpProxyDialog(node)}
                                onDisableHttpProxy={(serviceId) => openDisableHttpProxyDialog(node, serviceId)}
                                onEditHttpProxy={(serviceId) => void openEditHttpProxyDialog(node, serviceId)}
                                onListServices={(kind) => fetchServicesForKind(node.id, kind).then(
                                    (services) => services.map((s) => ({ id: s.id, name: s.name, visibility: s.visibility }))
                                )}
                            />
                        ))}
                    </div>

                    {renderNodesPager(clampedNodesPage, nodesPageCount, setNodesPage)}

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
                                <DialogTitle>{enableSshMode === 'update' ? 'Edit SSH' : 'Enable SSH'}</DialogTitle>
                                <DialogDescription>
                                    Configure SSH settings for {nodeToEnableSsh?.name ?? 'this node'}.
                                </DialogDescription>
                            </DialogHeader>

                            {enableSshLoadingDetails ? (
                                <p className="text-sm text-muted-foreground">Loading current settings...</p>
                            ) : (
                            <form
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    void submitEnableSsh();
                                }}
                                className="space-y-4"
                            >
                                <div>
                                    <label className="block text-sm font-medium mb-1">Name</label>
                                    <Input
                                        value={enableSshName}
                                        onChange={(event) => setEnableSshName(event.target.value)}
                                        placeholder="Optional display name"
                                        disabled={enableSshSubmitting}
                                    />
                                </div>
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
                                        {enableSshSubmitting
                                            ? (enableSshMode === 'update' ? 'Saving...' : 'Enabling...')
                                            : (enableSshMode === 'update' ? 'Save' : 'Enable SSH')}
                                    </Button>
                                </DialogFooter>
                            </form>
                            )}
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
                                <DialogTitle>Delete SSH</DialogTitle>
                                <DialogDescription>
                                    Delete SSH service for {nodeToDisableSsh?.name ?? 'this node'}?
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
                                    {disableSshSubmitting ? 'Deleting...' : 'Delete SSH'}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                    <Dialog
                        open={enableRdpDialogOpen}
                        onOpenChange={(open) => {
                            if (!open) {
                                closeEnableRdpDialog();
                            } else {
                                setEnableRdpDialogOpen(true);
                            }
                        }}
                    >
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>{enableRdpMode === 'update' ? 'Edit RDP' : 'Enable RDP'}</DialogTitle>
                                <DialogDescription>
                                    Configure the RDP host on {nodeToEnableRdp?.name ?? 'this node'}. The Windows
                                    username and password are entered when you open the screen, not stored here.
                                </DialogDescription>
                            </DialogHeader>

                            {enableRdpLoadingDetails ? (
                                <p className="text-sm text-muted-foreground">Loading current settings...</p>
                            ) : (
                            <form
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    void submitEnableRdp();
                                }}
                                className="space-y-4"
                            >
                                <div>
                                    <label className="block text-sm font-medium mb-1">Name</label>
                                    <Input
                                        value={enableRdpName}
                                        onChange={(event) => setEnableRdpName(event.target.value)}
                                        placeholder="Optional display name"
                                        disabled={enableRdpSubmitting}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Host</label>
                                    <Input
                                        value={enableRdpHost}
                                        onChange={(event) => setEnableRdpHost(event.target.value)}
                                        placeholder="0.0.0.0"
                                        disabled={enableRdpSubmitting}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Port</label>
                                    <Input
                                        value={enableRdpPort}
                                        onChange={(event) => setEnableRdpPort(event.target.value)}
                                        placeholder="3389"
                                        type="number"
                                        min="1"
                                        max="65535"
                                        disabled={enableRdpSubmitting}
                                    />
                                </div>
                                {enableRdpError && (
                                    <p className="text-sm text-destructive">{enableRdpError}</p>
                                )}
                                <DialogFooter>
                                    <Button type="button" variant="outline" onClick={closeEnableRdpDialog} disabled={enableRdpSubmitting}>
                                        Cancel
                                    </Button>
                                    <Button type="submit" disabled={enableRdpSubmitting}>
                                        {enableRdpSubmitting
                                            ? (enableRdpMode === 'update' ? 'Saving...' : 'Enabling...')
                                            : (enableRdpMode === 'update' ? 'Save' : 'Enable RDP')}
                                    </Button>
                                </DialogFooter>
                            </form>
                            )}
                        </DialogContent>
                    </Dialog>

                    <Dialog
                        open={disableRdpDialogOpen}
                        onOpenChange={(open) => {
                            if (!open) {
                                closeDisableRdpDialog();
                            } else {
                                setDisableRdpDialogOpen(true);
                            }
                        }}
                    >
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Delete RDP</DialogTitle>
                                <DialogDescription>
                                    Delete RDP service for {nodeToDisableRdp?.name ?? 'this node'}?
                                </DialogDescription>
                            </DialogHeader>

                            {disableRdpError ? (
                                <p className="text-sm text-destructive">{disableRdpError}</p>
                            ) : null}

                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={closeDisableRdpDialog} disabled={disableRdpSubmitting}>
                                    Cancel
                                </Button>
                                <Button
                                    type="button"
                                    variant="destructive"
                                    onClick={() => {
                                        void submitDisableRdp();
                                    }}
                                    disabled={disableRdpSubmitting}
                                >
                                    {disableRdpSubmitting ? 'Deleting...' : 'Delete RDP'}
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
                                <DialogTitle>{enableSftpMode === 'update' ? 'Edit SFTP' : 'Enable SFTP'}</DialogTitle>
                                <DialogDescription>
                                    Configure SFTP settings for {nodeToEnableSftp?.name ?? 'this node'}.
                                </DialogDescription>
                            </DialogHeader>

                            {enableSftpLoadingDetails ? (
                                <p className="text-sm text-muted-foreground">Loading current settings...</p>
                            ) : (
                            <form
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    void submitEnableSftp();
                                }}
                                className="space-y-4"
                            >
                                <div>
                                    <label className="block text-sm font-medium mb-1">Name</label>
                                    <Input
                                        value={enableSftpName}
                                        onChange={(event) => setEnableSftpName(event.target.value)}
                                        placeholder="Optional display name"
                                        disabled={enableSftpSubmitting}
                                    />
                                </div>
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
                                        {enableSftpSubmitting
                                            ? (enableSftpMode === 'update' ? 'Saving...' : 'Enabling...')
                                            : (enableSftpMode === 'update' ? 'Save' : 'Enable SFTP')}
                                    </Button>
                                </DialogFooter>
                            </form>
                            )}
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
                                <DialogTitle>Delete SFTP</DialogTitle>
                                <DialogDescription>
                                    Delete SFTP service for {nodeToDisableSftp?.name ?? 'this node'}?
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
                                    {disableSftpSubmitting ? 'Deleting...' : 'Delete SFTP'}
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
                                <DialogTitle>{enableHttpProxyMode === 'update' ? 'Edit HTTP' : 'Enable HTTP'}</DialogTitle>
                                <DialogDescription>
                                    Configure HTTP settings for {nodeToEnableHttpProxy?.name ?? 'this node'}.
                                </DialogDescription>
                            </DialogHeader>

                            {enableHttpProxyLoadingDetails ? (
                                <p className="text-sm text-muted-foreground">Loading current settings...</p>
                            ) : (
                            <form
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    void submitEnableHttpProxy();
                                }}
                                className="space-y-4"
                            >
                                <div>
                                    <label className="block text-sm font-medium mb-1">Name</label>
                                    <Input
                                        value={enableHttpProxyName}
                                        onChange={(event) => setEnableHttpProxyName(event.target.value)}
                                        placeholder="Optional display name"
                                        disabled={enableHttpProxySubmitting}
                                    />
                                </div>
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
                                <div className="flex flex-col gap-2">
                                    <div>
                                        <label className="block text-sm font-medium mb-1">Visibility</label>
                                        <div className="inline-flex rounded-md border border-input overflow-hidden">
                                            {(['private', 'public'] as const).map((v) => (
                                                <button
                                                    key={v}
                                                    type="button"
                                                    disabled={enableHttpProxySubmitting}
                                                    onClick={() => setEnableHttpProxyVisibility(v)}
                                                    className={cn(
                                                        'px-2 py-1 text-xs capitalize transition-colors',
                                                        enableHttpProxyVisibility === v
                                                            ? 'bg-primary text-primary-foreground'
                                                            : 'bg-secondary text-muted-foreground hover:text-foreground'
                                                    )}
                                                >
                                                    {v}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium mb-1">Scheme</label>
                                        <div className="inline-flex rounded-md border border-input overflow-hidden">
                                            {(['http', 'https'] as const).map((v) => (
                                                <button
                                                    key={v}
                                                    type="button"
                                                    disabled={enableHttpProxySubmitting}
                                                    onClick={() => setEnableHttpProxyScheme(v)}
                                                    className={cn(
                                                        'px-2 py-1 text-xs uppercase transition-colors',
                                                        enableHttpProxyScheme === v
                                                            ? 'bg-primary text-primary-foreground'
                                                            : 'bg-secondary text-muted-foreground hover:text-foreground'
                                                    )}
                                                >
                                                    {v}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                {enableHttpProxyVisibility === 'public' && (
                                    <p className="text-xs text-muted-foreground">
                                        Public services are accessible without authentication.
                                    </p>
                                )}
                                {enableHttpProxyError && (
                                    <p className="text-sm text-destructive">{enableHttpProxyError}</p>
                                )}
                                <DialogFooter>
                                    <Button type="button" variant="outline" onClick={closeEnableHttpProxyDialog} disabled={enableHttpProxySubmitting}>
                                        Cancel
                                    </Button>
                                    <Button type="submit" disabled={enableHttpProxySubmitting}>
                                        {enableHttpProxySubmitting
                                            ? (enableHttpProxyMode === 'update' ? 'Saving...' : 'Enabling...')
                                            : (enableHttpProxyMode === 'update' ? 'Save' : 'Enable HTTP')}
                                    </Button>
                                </DialogFooter>
                            </form>
                            )}
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
                                <DialogTitle>Delete HTTP</DialogTitle>
                                <DialogDescription>
                                    Delete HTTP service for {nodeToDisableHttpProxy?.name ?? 'this node'}?
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
                                    {disableHttpProxySubmitting ? 'Deleting...' : 'Delete HTTP'}
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

                    {/* RDP Panel */}
                    <RdpPanel
                        isOpen={rdpPanelOpen}
                        onClose={() => setRdpPanelOpen(false)}
                        tabs={rdpPanelTabs}
                        activeTabId={activeRdpTabId}
                        onSelectTab={setActiveRdpTabId}
                        onCloseTab={handleCloseRdpTab}
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
                        serviceId={selectedTunnelServiceId}
                        serviceName={selectedTunnelServiceName}
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
