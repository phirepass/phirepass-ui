import { useState } from 'react';
import { WebhookInspector } from '@/components/WebhookInspector';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Search,
  Webhook,
  Filter,
  RotateCcw,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle
} from 'lucide-react';
import { mockWebhookRequests } from '@/data/mockWebhooks';
import { WebhookRequest, ReplayResult } from '@/types/webhook';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';

const getMethodColor = (method: string) => {
  switch (method) {
    case 'GET': return 'bg-green-500/10 text-green-500 hover:bg-green-500/20';
    case 'POST': return 'bg-blue-500/10 text-blue-500 hover:bg-blue-500/20';
    case 'PUT': return 'bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20';
    case 'DELETE': return 'bg-red-500/10 text-red-500 hover:bg-red-500/20';
    case 'PATCH': return 'bg-purple-500/10 text-purple-500 hover:bg-purple-500/20';
    default: return 'bg-muted text-muted-foreground';
  }
};

const getStatusIcon = (status: number) => {
  if (status >= 200 && status < 300) return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  if (status >= 400 && status < 500) return <AlertCircle className="h-4 w-4 text-yellow-500" />;
  if (status >= 500) return <XCircle className="h-4 w-4 text-red-500" />;
  return <CheckCircle2 className="h-4 w-4 text-blue-500" />;
};

const Webhooks = () => {
  const [requests] = useState<WebhookRequest[]>(mockWebhookRequests);
  const [selectedRequest, setSelectedRequest] = useState<WebhookRequest | null>(null);
  const [filter, setFilter] = useState<'all' | 'success' | 'error'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredRequests = requests.filter(req => {
    const matchesSearch = req.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
    req.tunnelName.toLowerCase().includes(searchQuery.toLowerCase());

    if (filter === 'success') return matchesSearch && req.statusCode >= 200 && req.statusCode < 400;
    if (filter === 'error') return matchesSearch && req.statusCode >= 400;
    return matchesSearch;
  });

  const handleReplay = async (request: WebhookRequest): Promise<ReplayResult> => {
    // Simulate replay
    await new Promise(resolve => setTimeout(resolve, 1000));
    return {
    success: true,
    statusCode: 200,
    duration: Math.floor(Math.random() * 200) + 50,
    responseBody: JSON.stringify({ received: true, replayed: true, timestamp: new Date().toISOString() }, null, 2),
    };
  };

  const successCount = requests.filter(r => r.statusCode >= 200 && r.statusCode < 400).length;
  const errorCount = requests.filter(r => r.statusCode >= 400).length;

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
            <h1 className="text-2xl font-bold text-foreground">Webhook Inspector</h1>
            <p className="text-muted-foreground">Inspect and replay incoming webhook requests</p>
        </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-3 gap-4">
        <div className="p-4 bg-card border border-border rounded-lg">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Webhook className="h-4 w-4" />
            Total Requests
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">{requests.length}</p>
        </div>
        <div className="p-4 bg-card border border-border rounded-lg">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            Successful
            </div>
            <p className="text-2xl font-bold text-green-500 mt-1">{successCount}</p>
        </div>
        <div className="p-4 bg-card border border-border rounded-lg">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <XCircle className="h-4 w-4 text-red-500" />
            Errors
            </div>
            <p className="text-2xl font-bold text-red-500 mt-1">{errorCount}</p>
        </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
            placeholder="Search by path or tunnel..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            />
        </div>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="success">Success</TabsTrigger>
            <TabsTrigger value="error">Errors</TabsTrigger>
            </TabsList>
        </Tabs>
        </div>

        {/* Request List */}
        <div className="border border-border rounded-lg overflow-hidden">
        <ScrollArea className="h-[600px]">
            <Table>
            <TableHeader>
                <TableRow className="hover:bg-transparent">
                <TableHead className="w-[80px]">Status</TableHead>
                <TableHead className="w-[80px]">Method</TableHead>
                <TableHead>Path</TableHead>
                <TableHead className="w-[120px]">Tunnel</TableHead>
                <TableHead className="w-[80px]">Duration</TableHead>
                <TableHead className="w-[140px]">Time</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {filteredRequests.map((request) => (
                <TableRow
                    key={request.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedRequest(request)}
                >
                    <TableCell>
                    <div className="flex items-center gap-2">
                        {getStatusIcon(request.statusCode)}
                        <span className="text-sm font-mono">{request.statusCode}</span>
                    </div>
                    </TableCell>
                    <TableCell>
                    <Badge variant="secondary" className={`${getMethodColor(request.method)} font-mono text-xs`}>
                        {request.method}
                    </Badge>
                    </TableCell>
                    <TableCell>
                    <div className="flex items-center gap-2">
                        <code className="text-sm font-mono text-foreground truncate max-w-[200px]">
                        {request.path}
                        </code>
                        {request.isReplayed && (
                        <Badge variant="outline" className="text-xs">
                            <RotateCcw className="h-3 w-3 mr-1" />
                            Replayed
                        </Badge>
                        )}
                    </div>
                    </TableCell>
                    <TableCell>
                    <span className="text-sm text-muted-foreground">{request.tunnelName}</span>
                    </TableCell>
                    <TableCell>
                    <span className="text-sm text-muted-foreground">{request.duration}ms</span>
                    </TableCell>
                    <TableCell>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(request.timestamp, { addSuffix: true })}
                    </div>
                    </TableCell>
                    <TableCell>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                        e.stopPropagation();
                        setSelectedRequest(request);
                        }}
                    >
                        Inspect
                    </Button>
                    </TableCell>
                </TableRow>
                ))}
            </TableBody>
            </Table>
        </ScrollArea>
        </div>

    {/* Inspector Panel */}
    {selectedRequest && (
        <>
        <div
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
            onClick={() => setSelectedRequest(null)}
        />
        <WebhookInspector
            request={selectedRequest}
            onClose={() => setSelectedRequest(null)}
            onReplay={handleReplay}
        />
        </>
    )}
    </div>
  );
};

export default Webhooks;
