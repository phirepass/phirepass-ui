"use client";

import { useState, useEffect } from 'react';
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
import { NodeStats, TunnelNode } from '@/types/node';
import { Search, Filter, Grid, List, CheckSquare, Plus, Users } from 'lucide-react';
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

export default function Nodes() {
    const [nodes, setNodes] = useState<TunnelNode[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedNodes, setSelectedNodes] = useState<TunnelNode[]>([]);

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
    const [selectedFileNode, setSelectedFileNode] = useState<TunnelNode | null>(null);

    // Create tunnel panel state
    const [createTunnelPanelOpen, setCreateTunnelPanelOpen] = useState(false);
    const [selectedTunnelNode, setSelectedTunnelNode] = useState<TunnelNode | null>(null);

    // Add Node dialog
    const [addNodeOpen, setAddNodeOpen] = useState(false);

    // Share dialogs
    const [shareDialogOpen, setShareDialogOpen] = useState(false);
    const [shareManagementOpen, setShareManagementOpen] = useState(false);
    const [nodeToShare, setNodeToShare] = useState<TunnelNode | null>(null);
    const [renameDialogOpen, setRenameDialogOpen] = useState(false);
    const [nodeToRename, setNodeToRename] = useState<TunnelNode | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [renameSaving, setRenameSaving] = useState(false);
    const [renameError, setRenameError] = useState<string | null>(null);

    const normalizedQuery = searchQuery.trim().toLowerCase();
    const filteredNodes = nodes.filter(node => !!node.stats).filter((node) => {
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
        /* ||
        node.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery))*/
    });

    const handleCreateTunnel = (node: TunnelNode) => {
        setSelectedTunnelNode(node);
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
            setSelectedNodes((prev) => prev.map((entry) => (entry.id === refreshedNode.id ? refreshedNode : entry)));
            setSelectedFileNode((prev) => (prev?.id === refreshedNode.id ? refreshedNode : prev));
        } catch (err) {
            console.warn('[client][refresh-stats] failed', err);
        }
    };

    const handleOpenFiles = (node: TunnelNode) => {
        setSelectedFileNode(node);
        setFilePanelOpen(true);
    };

    const handleSelectNode = (node: TunnelNode) => {
        setSelectedNodes((prev) =>
            prev.some((n) => n.id === node.id)
                ? prev.filter((n) => n.id !== node.id)
                : [...prev, node]
        );
    };

    const handleSelectAll = () => {
        if (selectedNodes.length === filteredNodes.length) {
            setSelectedNodes([]);
        } else {
            setSelectedNodes(filteredNodes);
        }
    };

    const handleShare = (node: TunnelNode) => {
        setNodeToShare(node);
        setShareDialogOpen(true);
    };

    const applyNodeNameUpdate = (nodeId: string, nextName: string) => {
        const updateName = (entry: TunnelNode) => (entry.id === nodeId ? { ...entry, name: nextName } : entry);

        setNodes((prev) => prev.map(updateName));
        setSelectedNodes((prev) => prev.map(updateName));
        setSelectedFileNode((prev) => (prev && prev.id === nodeId ? { ...prev, name: nextName } : prev));
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

    return (
        <div className="container mx-auto px-4 py-6 space-y-6">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Nodes</h1>
                    <p className="text-muted-foreground">Manage your connected servers and infrastructure</p>
                </div>

                <Button size="sm" onClick={handleAddNode} className="gap-2">
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

                        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                            <Button variant="outline" size="sm" className="gap-2">
                                <Filter className="h-4 w-4" />
                                Filter
                            </Button>

                            <div className="flex rounded-lg border border-border bg-background/50 backdrop-blur-sm p-1">
                                <button
                                    onClick={() => setViewMode('grid')}
                                    className={cn(
                                        'p-2 rounded transition-colors',
                                        viewMode === 'grid'
                                            ? 'bg-primary/10 text-primary'
                                            : 'hover:bg-secondary/50 text-muted-foreground'
                                    )}
                                >
                                    <Grid className="h-4 w-4" />
                                </button>
                                <button
                                    onClick={() => setViewMode('list')}
                                    className={cn(
                                        'p-2 rounded transition-colors',
                                        viewMode === 'list'
                                            ? 'bg-primary/10 text-primary'
                                            : 'hover:bg-secondary/50 text-muted-foreground'
                                    )}
                                >
                                    <List className="h-4 w-4" />
                                </button>
                            </div>

                            <Button
                                variant={selectionMode ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => {
                                    setSelectionMode(!selectionMode);
                                    if (selectionMode) setSelectedNodes([]);
                                }}
                                className="gap-2"
                            >
                                <CheckSquare className="h-4 w-4" />
                                Select
                            </Button>

                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShareManagementOpen(true)}
                                className="gap-2"
                            >
                                <Users className="h-4 w-4" />
                                Shared ({mockSharedNodes.length})
                            </Button>
                        </div>
                    </div>

                    {/* Bulk Actions */}
                    {selectionMode && selectedNodes.length > 0 && (
                        <BulkActionsBar
                            selectedNodes={selectedNodes}
                            onClearSelection={() => setSelectedNodes([])}
                            onBulkTerminal={() => { }}
                            onBulkFileTransfer={() => { }}
                            onBulkReboot={() => { }}
                            onBulkShutdown={() => { }}
                            onBulkRefresh={() => { }}
                            onBulkExport={() => { }}
                        />
                    )}

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
                                showSelection={selectionMode}
                                isSelected={selectedNodes.some((n) => n.id === node.id)}
                                onSelect={(n, selected) => {
                                    if (selected) {
                                        handleSelectNode(n);
                                    } else {
                                        setSelectedNodes(selectedNodes.filter(sn => sn.id !== n.id));
                                    }
                                }}
                                onCreateTunnel={handleCreateTunnel}
                                onOpenFiles={handleOpenFiles}
                                onRefreshStats={handleRefreshStats}
                                onShare={handleShare}
                                onRename={handleRenameNode}
                            />
                        ))}
                    </div>

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
                        selectedNode={selectedFileNode}
                        onSelectNode={setSelectedFileNode}
                    />

                    {/* Create Tunnel Panel */}
                    <CreateTunnelPanel
                        isOpen={createTunnelPanelOpen}
                        onClose={() => {
                            setCreateTunnelPanelOpen(false);
                        }}
                        nodeId={selectedTunnelNode?.id ?? null}
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
                </>
            )}

            {/* Add Node Dialog (always mounted so it can open even during loading/error states) */}
            <AddNodeDialog open={addNodeOpen} onOpenChange={setAddNodeOpen} />
        </div>
    );
}
