import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardStats } from '@/components/DashboardStats';
import { NodeCard } from '@/components/NodeCard';
import { FilePanel } from '@/components/FilePanel';
import { BulkActionsBar } from '@/components/BulkActionsBar';
import { AddServerDialog } from '@/components/AddServerDialog';
import { ShareNodeDialog } from '@/components/ShareNodeDialog';
import { ShareManagementDialog } from '@/components/ShareManagementDialog';
import { MonitoringAlerts } from '@/components/MonitoringAlerts';
import { mockNodes } from '@/data/mockNodes';
import { mockSharedNodes } from '@/data/mockSharedNodes';
import { TunnelNode } from '@/types/node';
import { Search, Filter, Grid, List, CheckSquare, Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function Nodes() {
  const router = useRouter();
  const [nodes] = useState(mockNodes);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedNodes, setSelectedNodes] = useState<TunnelNode[]>([]);

  // File panel state
  const [filePanelOpen, setFilePanelOpen] = useState(false);
  const [selectedFileNode, setSelectedFileNode] = useState<TunnelNode | null>(null);

  // Add server dialog
  const [addServerOpen, setAddServerOpen] = useState(false);

  // Share dialogs
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareManagementOpen, setShareManagementOpen] = useState(false);
  const [nodeToShare, setNodeToShare] = useState<TunnelNode | null>(null);

  const filteredNodes = nodes.filter(
    (node) =>
    node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    node.ip.includes(searchQuery) ||
    node.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleCreateTunnel = (node: TunnelNode) => {
    router.push('/tunnels?create=true');
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

  const handleAddServer = () => {
    setAddServerOpen(true);
  };

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
    {/* Page Header */}
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
        <h1 className="text-2xl font-bold text-foreground">Nodes</h1>
        <p className="text-muted-foreground">Manage your connected servers and infrastructure</p>
        </div>

        <Button size="sm" onClick={handleAddServer} className="gap-2">
        <Plus className="h-4 w-4" />
        Add Server
        </Button>
    </div>

    {/* Stats Section */}
    <DashboardStats nodes={nodes} />

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

        <div className="flex gap-2 w-full sm:w-auto">
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
        onBulkTerminal={() => {}}
        onBulkFileTransfer={() => {}}
        onBulkReboot={() => {}}
        onBulkShutdown={() => {}}
        onBulkRefresh={() => {}}
        onBulkExport={() => {}}
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
            onShare={handleShare}
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

    {/* Add Server Dialog */}
    <AddServerDialog open={addServerOpen} onOpenChange={setAddServerOpen} />

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
    </div>
  );
}
