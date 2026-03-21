import { useState, useEffect } from 'react';
import { TunnelCard } from '@/components/TunnelCard';
import { TcpTunnelCard } from '@/components/TcpTunnelCard';
import { SshTunnelCard } from '@/components/SshTunnelCard';
import { TerminalPanel } from '@/components/TerminalPanel';
import { SftpPanel } from '@/components/SftpPanel';
import { CreateTunnelPanel } from '@/components/CreateTunnelPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
    Globe,
    Search,
    Terminal,
    ArrowDownToLine,
    ArrowUpFromLine,
    Database,
    Users,
    Plus,
    Server
} from 'lucide-react';
import { mockTunnels } from '@/data/mockTunnels';
import { mockTcpTunnels } from '@/data/mockTcpTunnels';
import { mockSshTunnels } from '@/data/mockSshTunnels';
import { Tunnel } from '@/types/tunnel';
import { TcpTunnel } from '@/types/tcp-tunnel';
import { SshTunnel } from '@/types/ssh-tunnel';
import { TerminalTab, TunnelNode } from '@/types/node';
import { toast } from 'sonner';

const Tunnels = () => {
    const [initialDialog, setInitialDialog] = useState<string | null>(null);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            setInitialDialog(params.get('create'));
        }
    }, []);

    const [httpTunnels, setHttpTunnels] = useState<Tunnel[]>(mockTunnels);
    const [tcpTunnels, setTcpTunnels] = useState<TcpTunnel[]>(mockTcpTunnels);
    const [sshTunnels, setSshTunnels] = useState<SshTunnel[]>(mockSshTunnels);
    const [httpFilter, setHttpFilter] = useState<'all' | 'active' | 'inactive'>('all');
    const [tcpFilter, setTcpFilter] = useState<'all' | 'tcp' | 'udp'>('all');
    const [sshFilter, setSshFilter] = useState<'all' | 'active' | 'inactive'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<'http' | 'tcp' | 'ssh'>('http');
    const [showCreateDialog, setShowCreateDialog] = useState(initialDialog === 'true');

    // Terminal state
    const [terminalOpen, setTerminalOpen] = useState(false);
    const [terminalTabs, setTerminalTabs] = useState<TerminalTab[]>([]);
    const [activeTerminalTab, setActiveTerminalTab] = useState<string | null>(null);

    // SFTP state
    const [sftpOpen, setSftpOpen] = useState(false);
    const [sftpInitialTunnel, setSftpInitialTunnel] = useState<SshTunnel | null>(null);

    // Convert SSH tunnels to TunnelNode format for terminal panel
    const sshTunnelsAsNodes: TunnelNode[] = [];
    /*
    sshTunnels
    .filter(t => t.status === 'active')
    .map(t => ({
        id: t.id,
        name: t.nodeName,
        hostname: t.nodeName,
        ip: t.nodeIp,
        isOnline: t.status === 'active',
        lastSeen: t.lastConnected,
        os: 'Linux',
        tags: [],
        stats: {
            cpu: 0, memory: 0, disk: 0, uptime: '', ping: 0,
            networkIn: 0, networkOut: 0, processes: 0,
            loadAvg: [0, 0, 0] as [number, number, number],
            swapUsed: 0, openConnections: t.sessions
        }
    }))*/
    ;

    // Get connected tunnel IDs
    const connectedTunnelIds = terminalTabs.map(tab => tab.nodeId);

    const filteredHttpTunnels = httpTunnels.filter(tunnel => {
        const matchesFilter = httpFilter === 'all' || tunnel.status === httpFilter;
        const matchesSearch = tunnel.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            tunnel.publicUrl.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesFilter && matchesSearch;
    });

    const filteredTcpTunnels = tcpTunnels.filter(tunnel => {
        const matchesFilter = tcpFilter === 'all' || tunnel.protocol === tcpFilter;
        const matchesSearch = tunnel.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            tunnel.publicEndpoint.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesFilter && matchesSearch;
    });

    const filteredSshTunnels = sshTunnels.filter(tunnel => {
        const matchesFilter = sshFilter === 'all' || tunnel.status === sshFilter;
        const matchesSearch = tunnel.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            tunnel.nodeName.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesFilter && matchesSearch;
    });

    const handleDeleteHttp = (id: string) => {
        setHttpTunnels(prev => prev.filter(t => t.id !== id));
        toast.success('Tunnel deleted');
    };

    const handleDeleteTcp = (id: string) => {
        setTcpTunnels(prev => prev.filter(t => t.id !== id));
        toast.success('Tunnel deleted');
    };

    const handleDeleteSsh = (id: string) => {
        setSshTunnels(prev => prev.filter(t => t.id !== id));
        toast.success('Tunnel deleted');
    };

    const handleOpenTerminal = (tunnel: SshTunnel) => {
        const existingTab = terminalTabs.find((t) => t.nodeId === tunnel.id);
        if (existingTab) {
            setActiveTerminalTab(existingTab.id);
        } else {
            const newTab: TerminalTab = {
                id: `tab-${Date.now()}`,
                nodeId: tunnel.id,
                nodeName: tunnel.nodeName,
                isConnected: true,
                history: [],
            };
            setTerminalTabs((prev) => [...prev, newTab]);
            setActiveTerminalTab(newTab.id);
        }
        setTerminalOpen(true);
    };

    const handleOpenSftp = (tunnel: SshTunnel) => {
        setSftpInitialTunnel(tunnel);
        setSftpOpen(true);
    };

    const handleCloseTerminalTab = (tabId: string) => {
        setTerminalTabs((prev) => prev.filter((t) => t.id !== tabId));
        if (activeTerminalTab === tabId) {
            const remaining = terminalTabs.filter((t) => t.id !== tabId);
            setActiveTerminalTab(remaining.length > 0 ? remaining[remaining.length - 1].id : null);
        }
    };

    const handleAddTerminalTab = (node: TunnelNode) => {
        const tunnel = sshTunnels.find(t => t.id === node.id);
        if (tunnel) {
            handleOpenTerminal(tunnel);
        }
    };

    // HTTP Stats
    const activeHttpTunnels = httpTunnels.filter(t => t.status === 'active').length;
    const totalHttpRequests = httpTunnels.reduce((acc, t) => acc + t.requestCount, 0);
    const totalHttpBytesIn = httpTunnels.reduce((acc, t) => acc + t.bytesIn, 0);
    const totalHttpBytesOut = httpTunnels.reduce((acc, t) => acc + t.bytesOut, 0);

    // TCP Stats
    const activeTcpTunnels = tcpTunnels.filter(t => t.status === 'active').length;
    const totalConnections = tcpTunnels.reduce((acc, t) => acc + t.connections, 0);
    const totalTcpBytesIn = tcpTunnels.reduce((acc, t) => acc + t.bytesIn, 0);
    const totalTcpBytesOut = tcpTunnels.reduce((acc, t) => acc + t.bytesOut, 0);

    // SSH Stats
    const activeSshTunnels = sshTunnels.filter(t => t.status === 'active').length;
    const totalSessions = sshTunnels.reduce((acc, t) => acc + t.sessions, 0);
    const totalSshBytesIn = sshTunnels.reduce((acc, t) => acc + t.bytesIn, 0);
    const totalSshBytesOut = sshTunnels.reduce((acc, t) => acc + t.bytesOut, 0);

    const formatBytes = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
        return `${(bytes / 1073741824).toFixed(1)} GB`;
    };

    return (
        <div className="container mx-auto px-4 py-6 space-y-6">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Tunnels</h1>
                    <p className="text-muted-foreground">Expose your local services to the internet</p>
                </div>

                <Button className="gap-2" onClick={() => setShowCreateDialog(true)}>
                    <Plus className="h-4 w-4" />
                    Connect
                </Button>
            </div>

            {/* Main Tabs */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'http' | 'tcp' | 'ssh')}>
                <TabsList className="mb-4">
                    <TabsTrigger value="http" className="gap-2">
                        <Globe className="h-4 w-4" />
                        HTTP ({httpTunnels.length})
                    </TabsTrigger>
                    <TabsTrigger value="tcp" className="gap-2">
                        <Database className="h-4 w-4" />
                        TCP/UDP ({tcpTunnels.length})
                    </TabsTrigger>
                    <TabsTrigger value="ssh" className="gap-2">
                        <Terminal className="h-4 w-4" />
                        SSH ({sshTunnels.length})
                    </TabsTrigger>
                </TabsList>

                {/* HTTP Tab */}
                <TabsContent value="http" className="space-y-6">
                    {/* Stats Overview */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="p-4 bg-card border border-border rounded-lg">
                            <div className="flex items-center gap-2 text-muted-foreground text-sm">
                                <Globe className="h-4 w-4" />
                                Active Tunnels
                            </div>
                            <p className="text-2xl font-bold text-foreground mt-1">{activeHttpTunnels}</p>
                        </div>
                        <div className="p-4 bg-card border border-border rounded-lg">
                            <div className="flex items-center gap-2 text-muted-foreground text-sm">
                                <Terminal className="h-4 w-4" />
                                Total Requests
                            </div>
                            <p className="text-2xl font-bold text-foreground mt-1">{totalHttpRequests.toLocaleString()}</p>
                        </div>
                        <div className="p-4 bg-card border border-border rounded-lg">
                            <div className="flex items-center gap-2 text-muted-foreground text-sm">
                                <ArrowDownToLine className="h-4 w-4" />
                                Data In
                            </div>
                            <p className="text-2xl font-bold text-foreground mt-1">{formatBytes(totalHttpBytesIn)}</p>
                        </div>
                        <div className="p-4 bg-card border border-border rounded-lg">
                            <div className="flex items-center gap-2 text-muted-foreground text-sm">
                                <ArrowUpFromLine className="h-4 w-4" />
                                Data Out
                            </div>
                            <p className="text-2xl font-bold text-foreground mt-1">{formatBytes(totalHttpBytesOut)}</p>
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="flex flex-col sm:flex-row gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search tunnels..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        <Tabs value={httpFilter} onValueChange={(v) => setHttpFilter(v as typeof httpFilter)}>
                            <TabsList>
                                <TabsTrigger value="all">All ({httpTunnels.length})</TabsTrigger>
                                <TabsTrigger value="active">Active ({httpTunnels.filter(t => t.status === 'active').length})</TabsTrigger>
                                <TabsTrigger value="inactive">Inactive ({httpTunnels.filter(t => t.status === 'inactive').length})</TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </div>

                    {/* Tunnel List */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filteredHttpTunnels.length === 0 ? (
                            <div className="text-center py-12 text-muted-foreground">
                                <Globe className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                <p>No tunnels found</p>
                                <p className="text-sm mt-1">Start a new tunnel using the CLI</p>
                            </div>
                        ) : (
                            filteredHttpTunnels.map(tunnel => (
                                <TunnelCard
                                    key={tunnel.id}
                                    tunnel={tunnel}
                                    onDelete={handleDeleteHttp}
                                />
                            ))
                        )}
                    </div>
                </TabsContent>

                {/* TCP/UDP Tab */}
                <TabsContent value="tcp" className="space-y-6">
                    {/* Stats Overview */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="p-4 bg-card border border-border rounded-lg">
                            <div className="flex items-center gap-2 text-muted-foreground text-sm">
                                <Database className="h-4 w-4" />
                                Active Tunnels
                            </div>
                            <p className="text-2xl font-bold text-foreground mt-1">{activeTcpTunnels}</p>
                        </div>
                        <div className="p-4 bg-card border border-border rounded-lg">
                            <div className="flex items-center gap-2 text-muted-foreground text-sm">
                                <Users className="h-4 w-4" />
                                Active Connections
                            </div>
                            <p className="text-2xl font-bold text-foreground mt-1">{totalConnections}</p>
                        </div>
                        <div className="p-4 bg-card border border-border rounded-lg">
                            <div className="flex items-center gap-2 text-muted-foreground text-sm">
                                <ArrowDownToLine className="h-4 w-4" />
                                Data In
                            </div>
                            <p className="text-2xl font-bold text-foreground mt-1">{formatBytes(totalTcpBytesIn)}</p>
                        </div>
                        <div className="p-4 bg-card border border-border rounded-lg">
                            <div className="flex items-center gap-2 text-muted-foreground text-sm">
                                <ArrowUpFromLine className="h-4 w-4" />
                                Data Out
                            </div>
                            <p className="text-2xl font-bold text-foreground mt-1">{formatBytes(totalTcpBytesOut)}</p>
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="flex flex-col sm:flex-row gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search tunnels..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        <Tabs value={tcpFilter} onValueChange={(v) => setTcpFilter(v as typeof tcpFilter)}>
                            <TabsList>
                                <TabsTrigger value="all">All ({tcpTunnels.length})</TabsTrigger>
                                <TabsTrigger value="tcp">TCP ({tcpTunnels.filter(t => t.protocol === 'tcp').length})</TabsTrigger>
                                <TabsTrigger value="udp">UDP ({tcpTunnels.filter(t => t.protocol === 'udp').length})</TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </div>

                    {/* Tunnel List */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filteredTcpTunnels.length === 0 ? (
                            <div className="text-center py-12 text-muted-foreground">
                                <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                <p>No tunnels found</p>
                                <p className="text-sm mt-1">Start a new tunnel using the CLI</p>
                            </div>
                        ) : (
                            filteredTcpTunnels.map(tunnel => (
                                <TcpTunnelCard
                                    key={tunnel.id}
                                    tunnel={tunnel}
                                    onDelete={handleDeleteTcp}
                                />
                            ))
                        )}
                    </div>
                </TabsContent>

                {/* SSH Tab */}
                <TabsContent value="ssh" className="space-y-6">
                    {/* Stats Overview */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="p-4 bg-card border border-border rounded-lg">
                            <div className="flex items-center gap-2 text-muted-foreground text-sm">
                                <Terminal className="h-4 w-4" />
                                Active Tunnels
                            </div>
                            <p className="text-2xl font-bold text-foreground mt-1">{activeSshTunnels}</p>
                        </div>
                        <div className="p-4 bg-card border border-border rounded-lg">
                            <div className="flex items-center gap-2 text-muted-foreground text-sm">
                                <Users className="h-4 w-4" />
                                Active Sessions
                            </div>
                            <p className="text-2xl font-bold text-foreground mt-1">{totalSessions}</p>
                        </div>
                        <div className="p-4 bg-card border border-border rounded-lg">
                            <div className="flex items-center gap-2 text-muted-foreground text-sm">
                                <ArrowDownToLine className="h-4 w-4" />
                                Data In
                            </div>
                            <p className="text-2xl font-bold text-foreground mt-1">{formatBytes(totalSshBytesIn)}</p>
                        </div>
                        <div className="p-4 bg-card border border-border rounded-lg">
                            <div className="flex items-center gap-2 text-muted-foreground text-sm">
                                <ArrowUpFromLine className="h-4 w-4" />
                                Data Out
                            </div>
                            <p className="text-2xl font-bold text-foreground mt-1">{formatBytes(totalSshBytesOut)}</p>
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="flex flex-col sm:flex-row gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search tunnels..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        <Tabs value={sshFilter} onValueChange={(v) => setSshFilter(v as typeof sshFilter)}>
                            <TabsList>
                                <TabsTrigger value="all">All ({sshTunnels.length})</TabsTrigger>
                                <TabsTrigger value="active">Active ({sshTunnels.filter(t => t.status === 'active').length})</TabsTrigger>
                                <TabsTrigger value="inactive">Inactive ({sshTunnels.filter(t => t.status === 'inactive').length})</TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </div>

                    {/* Tunnel List */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filteredSshTunnels.length === 0 ? (
                            <div className="text-center py-12 text-muted-foreground">
                                <Terminal className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                <p>No SSH tunnels found</p>
                                <p className="text-sm mt-1">Start a new SSH tunnel using the CLI</p>
                            </div>
                        ) : (
                            filteredSshTunnels.map(tunnel => (
                                <SshTunnelCard
                                    key={tunnel.id}
                                    tunnel={tunnel}
                                    onDelete={handleDeleteSsh}
                                    onOpenTerminal={handleOpenTerminal}
                                    onOpenSftp={handleOpenSftp}
                                    isConnected={connectedTunnelIds.includes(tunnel.id)}
                                />
                            ))
                        )}
                    </div>
                </TabsContent>
            </Tabs>

            {/* Create Tunnel Panel */}
            <CreateTunnelPanel isOpen={showCreateDialog} onClose={() => setShowCreateDialog(false)} nodeId={null} />

            {/* Terminal Panel */}
            <TerminalPanel
                isOpen={terminalOpen}
                onClose={() => setTerminalOpen(false)}
                tabs={terminalTabs}
                onCloseTab={handleCloseTerminalTab}
                activeTabId={activeTerminalTab}
                onSelectTab={setActiveTerminalTab}
                nodes={sshTunnelsAsNodes}
                onAddTab={handleAddTerminalTab}
            />

            {/* SFTP Panel */}
            <SftpPanel
                isOpen={sftpOpen}
                onClose={() => setSftpOpen(false)}
                tunnels={sshTunnels}
                initialTunnel={sftpInitialTunnel}
            />

            {/* Overlay */}
            {(terminalOpen || sftpOpen) && (
                <div
                    className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40"
                    onClick={() => {
                        setTerminalOpen(false);
                        setSftpOpen(false);
                    }}
                />
            )}
        </div>
    );
};

export default Tunnels;
