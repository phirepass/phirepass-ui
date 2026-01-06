import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { DashboardStats } from "@/components/DashboardStats";
import { NodeCard } from "@/components/NodeCard";
import { FilePanel } from "@/components/FilePanel";
import { BulkActionsBar } from "@/components/BulkActionsBar";
import { AddServerDialog } from "@/components/AddServerDialog";
import { ShareNodeDialog } from "@/components/ShareNodeDialog";
import { ShareManagementDialog } from "@/components/ShareManagementDialog";
import { MonitoringAlerts } from "@/components/MonitoringAlerts";
import { mockNodes } from "@/data/mockNodes";
import { mockSharedNodes } from "@/data/mockSharedNodes";
import { TunnelNode } from "@/types/node";
import {
    Search,
    Filter,
    Grid,
    List,
    CheckSquare,
    Plus,
    Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export default function Dashboard() {
    const router = useRouter();
    const { toast } = useToast();
    const [nodes] = useState(mockNodes);
    const [searchQuery, setSearchQuery] = useState("");
    const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedNodes, setSelectedNodes] = useState<TunnelNode[]>([]);

    // Initialize auth check
    const [isAuthChecked, setIsAuthChecked] = useState(false);

    // User state from OAuth
    const [user, setUser] = useState<{
        name: string | null;
        email: string | null;
        avatar: string | null;
    } | null>(null);

    // File panel state
    const [filePanelOpen, setFilePanelOpen] = useState(false);
    const [selectedFileNode, setSelectedFileNode] = useState<TunnelNode | null>(
        null
    );

    // Add server dialog
    const [addServerOpen, setAddServerOpen] = useState(false);

    // Share dialogs
    const [shareDialogOpen, setShareDialogOpen] = useState(false);
    const [shareManagementOpen, setShareManagementOpen] = useState(false);
    const [nodeToShare, setNodeToShare] = useState<TunnelNode | null>(null);

    // Check authentication on mount - redirect if not authenticated
    useEffect(() => {
        const hasUser = localStorage.getItem("github_user");
        const hasCode =
            typeof window !== "undefined"
                ? new URLSearchParams(window.location.search).get("code")
                : null;

        if (hasUser) {
            // Load user from localStorage
            try {
                const userData = JSON.parse(hasUser);
                setUser(userData);
                setIsAuthChecked(true);
            } catch (err) {
                console.error("Failed to parse user data:", err);
                localStorage.removeItem("github_user");
                router.push("/login");
            }
        } else if (!hasCode) {
            // No user and no OAuth code, redirect to login
            router.push("/login");
        } else {
            // Has code, will be handled by OAuth callback effect
            setIsAuthChecked(true);
        }
    }, [router]);

    // Handle GitHub OAuth callback
    useEffect(() => {
        const code =
            typeof window !== "undefined"
                ? new URLSearchParams(window.location.search).get("code")
                : null;

        if (code) {
            // Exchange code for token and user data
            fetch(`/api/auth/github/token?code=${code}`)
                .then((res) => res.json())
                .then((data) => {
                    if (data.error) {
                        toast({
                            title: "Authentication failed",
                            description: data.error,
                            variant: "destructive",
                        });
                        return;
                    }

                    // Store user data
                    const userData = {
                        name: data.user.name || data.user.login,
                        email: data.user.email,
                        avatar: data.user.avatar_url,
                    };

                    setUser(userData);
                    localStorage.setItem(
                        "github_user",
                        JSON.stringify(userData)
                    );
                    localStorage.setItem("access_token", data.access_token);

                    // Clean up URL
                    window.history.replaceState({}, "", "/dashboard");

                    toast({
                        title: "Welcome!",
                        description: `Logged in as ${
                            userData.name || userData.email
                        }`,
                    });
                })
                .catch((err) => {
                    console.error("OAuth error:", err);
                    toast({
                        title: "Authentication failed",
                        description: "Could not complete GitHub login",
                        variant: "destructive",
                    });
                });
        }
    }, [toast]);

    // Don't render until auth is checked
    if (!isAuthChecked) {
        return null;
    }

    const filteredNodes = nodes.filter(
        (node) =>
            node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            node.ip.includes(searchQuery) ||
            node.tags.some((tag) =>
                tag.toLowerCase().includes(searchQuery.toLowerCase())
            )
    );

    const handleCreateTunnel = (node: TunnelNode) => {
        router.push("/tunnels?create=true");
    };

    const handleOpenFiles = (node: TunnelNode) => {
        setSelectedFileNode(node);
        setFilePanelOpen(true);
    };

    const handleLogout = () => {
        // Clear all auth data
        localStorage.removeItem("github_user");
        localStorage.removeItem("access_token");
        sessionStorage.removeItem("github_oauth_state");

        toast({
            title: "Logged out",
            description: "You have been successfully logged out",
        });

        router.push("/");
    };

    const handleNodeSelect = (node: TunnelNode, selected: boolean) => {
        if (selected) {
            setSelectedNodes((prev) => [...prev, node]);
        } else {
            setSelectedNodes((prev) => prev.filter((n) => n.id !== node.id));
        }
    };

    const handleClearSelection = () => {
        setSelectedNodes([]);
        setSelectionMode(false);
    };

    const handleReboot = (node: TunnelNode) => {
        toast({
            title: "Reboot initiated",
            description: `Sending reboot command to ${node.name}...`,
        });
    };

    const handleShutdown = (node: TunnelNode) => {
        toast({
            title: "Shutdown initiated",
            description: `Sending shutdown command to ${node.name}...`,
            variant: "destructive",
        });
    };

    const handleRefreshStats = (node: TunnelNode) => {
        toast({
            title: "Refreshing stats",
            description: `Fetching latest stats from ${node.name}...`,
        });
    };

    const handleConfigure = (node: TunnelNode) => {
        toast({
            title: "Configuration",
            description: `Opening configuration for ${node.name}...`,
        });
    };

    const handleShare = (node: TunnelNode) => {
        setNodeToShare(node);
        setShareDialogOpen(true);
    };

    const handleManageShares = () => {
        setShareManagementOpen(true);
    };

    // Bulk actions
    const handleBulkTerminal = () => {
        router.push("/tunnels?create=true");
        toast({
            title: "Create tunnels",
            description: "Redirecting to tunnel creation...",
        });
    };

    const handleBulkFileTransfer = () => {
        if (selectedNodes.length >= 2) {
            setSelectedFileNode(selectedNodes[0]);
            setFilePanelOpen(true);
            toast({
                title: "File transfer mode",
                description: "Select files to transfer between selected nodes",
            });
        }
    };

    const handleBulkReboot = () => {
        const onlineNodes = selectedNodes.filter((n) => n.isOnline);
        toast({
            title: "Bulk reboot initiated",
            description: `Sending reboot command to ${onlineNodes.length} nodes...`,
        });
    };

    const handleBulkShutdown = () => {
        const onlineNodes = selectedNodes.filter((n) => n.isOnline);
        toast({
            title: "Bulk shutdown initiated",
            description: `Sending shutdown command to ${onlineNodes.length} nodes...`,
            variant: "destructive",
        });
    };

    const handleBulkRefresh = () => {
        toast({
            title: "Refreshing stats",
            description: `Fetching latest stats from ${selectedNodes.length} nodes...`,
        });
    };

    const handleBulkExport = () => {
        const exportData = selectedNodes.map((node) => ({
            name: node.name,
            ip: node.ip,
            status: node.isOnline ? "online" : "offline",
            ...node.stats,
        }));
        console.log("Export data:", exportData);
        toast({
            title: "Stats exported",
            description: `Exported stats for ${selectedNodes.length} nodes to console`,
        });
    };

    return (
        <div className="container mx-auto px-4 py-6 pb-12 space-y-6">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">
                        Nodes
                    </h1>
                    <p className="text-muted-foreground">
                        Monitor and manage your connected tunnel nodes
                    </p>
                </div>
                <Button variant="glow" onClick={() => setAddServerOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Server
                </Button>
            </div>

            {/* Alerts */}
            <MonitoringAlerts nodes={nodes} />

            {/* Stats */}
            <DashboardStats nodes={nodes} />

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search by name, IP, or tag..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-secondary border border-border rounded-lg pl-10 pr-4 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant={selectionMode ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                            setSelectionMode(!selectionMode);
                            if (selectionMode) setSelectedNodes([]);
                        }}
                    >
                        <CheckSquare className="w-4 h-4" />
                        Select
                    </Button>
                    <Button variant="outline" size="sm">
                        <Filter className="w-4 h-4" />
                        Filter
                    </Button>
                    <div className="flex border border-border rounded-lg overflow-hidden">
                        <button
                            className={cn(
                                "p-2 transition-colors",
                                viewMode === "grid"
                                    ? "bg-secondary text-foreground"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                            onClick={() => setViewMode("grid")}
                        >
                            <Grid className="w-4 h-4" />
                        </button>
                        <button
                            className={cn(
                                "p-2 transition-colors",
                                viewMode === "list"
                                    ? "bg-secondary text-foreground"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                            onClick={() => setViewMode("list")}
                        >
                            <List className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Node Grid */}
            <div
                className={cn(
                    "grid gap-4",
                    viewMode === "grid"
                        ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                        : "grid-cols-1"
                )}
            >
                {filteredNodes.map((node) => (
                    <NodeCard
                        key={node.id}
                        node={node}
                        onCreateTunnel={handleCreateTunnel}
                        onOpenFiles={handleOpenFiles}
                        onReboot={handleReboot}
                        onShutdown={handleShutdown}
                        onRefreshStats={handleRefreshStats}
                        onConfigure={handleConfigure}
                        onShare={handleShare}
                        showSelection={selectionMode}
                        isSelected={selectedNodes.some((n) => n.id === node.id)}
                        onSelect={handleNodeSelect}
                    />
                ))}
            </div>

            {filteredNodes.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                    No nodes found matching your search.
                </div>
            )}

            {/* Shared Nodes Section */}
            {mockSharedNodes.length > 0 && (
                <div className="mt-8 pt-8 border-t border-border">
                    <div className="flex items-center gap-2 mb-4">
                        <Users className="w-5 h-5 text-accent" />
                        <h2 className="text-xl font-semibold text-foreground">
                            Shared with me
                        </h2>
                        <span className="text-sm text-muted-foreground">
                            ({mockSharedNodes.length})
                        </span>
                    </div>
                    <div
                        className={cn(
                            "grid gap-4",
                            viewMode === "grid"
                                ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                                : "grid-cols-1"
                        )}
                    >
                        {mockSharedNodes.map((sharedNode) => (
                            <NodeCard
                                key={sharedNode.node.id}
                                node={sharedNode.node}
                                onCreateTunnel={handleCreateTunnel}
                                onOpenFiles={handleOpenFiles}
                                onReboot={handleReboot}
                                onShutdown={handleShutdown}
                                onRefreshStats={handleRefreshStats}
                                onConfigure={handleConfigure}
                                isShared
                                sharedBy={sharedNode.sharedBy}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Bulk Actions Bar */}
            <BulkActionsBar
                selectedNodes={selectedNodes}
                onClearSelection={handleClearSelection}
                onBulkTerminal={handleBulkTerminal}
                onBulkFileTransfer={handleBulkFileTransfer}
                onBulkReboot={handleBulkReboot}
                onBulkShutdown={handleBulkShutdown}
                onBulkRefresh={handleBulkRefresh}
                onBulkExport={handleBulkExport}
            />

            {/* File Panel */}
            <FilePanel
                isOpen={filePanelOpen}
                onClose={() => setFilePanelOpen(false)}
                nodes={nodes}
                selectedNode={selectedFileNode}
                onSelectNode={setSelectedFileNode}
            />

            {/* Add Server Dialog */}
            <AddServerDialog
                open={addServerOpen}
                onOpenChange={setAddServerOpen}
            />

            {/* Share Node Dialog */}
            <ShareNodeDialog
                open={shareDialogOpen}
                onOpenChange={setShareDialogOpen}
                node={nodeToShare}
                onManageShares={handleManageShares}
            />

            {/* Share Management Dialog */}
            <ShareManagementDialog
                open={shareManagementOpen}
                onOpenChange={setShareManagementOpen}
                node={nodeToShare}
            />

            {/* Overlay */}
            {filePanelOpen && (
                <div
                    className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40"
                    onClick={() => setFilePanelOpen(false)}
                />
            )}
        </div>
    );
}
