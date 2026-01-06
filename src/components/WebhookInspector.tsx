import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  X,
  Copy,
  RotateCcw,
  Clock,
  Globe,
  FileJson,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Loader2
} from 'lucide-react';
import { WebhookRequest, ReplayResult } from '@/types/webhook';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface WebhookInspectorProps {
  request: WebhookRequest;
  onClose: () => void;
  onReplay: (request: WebhookRequest) => Promise<ReplayResult>;
}

const getMethodColor = (method: string) => {
  switch (method) {
    case 'GET': return 'bg-green-500/10 text-green-500';
    case 'POST': return 'bg-blue-500/10 text-blue-500';
    case 'PUT': return 'bg-yellow-500/10 text-yellow-500';
    case 'DELETE': return 'bg-red-500/10 text-red-500';
    case 'PATCH': return 'bg-purple-500/10 text-purple-500';
    default: return 'bg-muted text-muted-foreground';
  }
};

const getStatusColor = (status: number) => {
  if (status >= 200 && status < 300) return 'text-green-500';
  if (status >= 300 && status < 400) return 'text-blue-500';
  if (status >= 400 && status < 500) return 'text-yellow-500';
  if (status >= 500) return 'text-red-500';
  return 'text-muted-foreground';
};

export const WebhookInspector = ({ request, onClose, onReplay }: WebhookInspectorProps) => {
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayResult, setReplayResult] = useState<ReplayResult | null>(null);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const handleReplay = async () => {
    setIsReplaying(true);
    setReplayResult(null);
    try {
    const result = await onReplay(request);
    setReplayResult(result);
    toast.success('Request replayed successfully');
    } catch (error) {
    toast.error('Failed to replay request');
    } finally {
    setIsReplaying(false);
    }
  };

  const formatJson = (str: string | undefined) => {
    if (!str) return '';
    try {
    return JSON.stringify(JSON.parse(str), null, 2);
    } catch {
    return str;
    }
  };

  return (
    <Card className="fixed inset-4 md:inset-auto md:fixed md:right-4 md:top-20 md:bottom-4 md:w-[600px] z-50 flex flex-col shadow-2xl border-border">
    <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4 border-b border-border shrink-0">
        <div className="space-y-2">
        <div className="flex items-center gap-2">
            <Badge className={`${getMethodColor(request.method)} font-mono`}>
            {request.method}
            </Badge>
            <code className="text-sm font-mono text-foreground">{request.path}</code>
            {request.isReplayed && (
            <Badge variant="outline" className="text-xs">Replayed</Badge>
            )}
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {format(request.timestamp, 'MMM d, HH:mm:ss')}
            </span>
            <span className={`font-medium ${getStatusColor(request.statusCode)}`}>
            {request.statusCode}
            </span>
            <span>{request.duration}ms</span>
        </div>
        </div>
        <div className="flex items-center gap-2">
        <Button
            variant="outline"
            size="sm"
            onClick={handleReplay}
            disabled={isReplaying}
            className="gap-2"
        >
            {isReplaying ? (
            <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
            <RotateCcw className="h-4 w-4" />
            )}
            Replay
        </Button>
        <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
        </Button>
        </div>
    </CardHeader>

    <CardContent className="flex-1 overflow-hidden p-0">
        <Tabs defaultValue="request" className="h-full flex flex-col">
        <TabsList className="w-full justify-start rounded-none border-b border-border px-4">
            <TabsTrigger value="request">Request</TabsTrigger>
            <TabsTrigger value="response">Response</TabsTrigger>
            <TabsTrigger value="headers">Headers</TabsTrigger>
            {replayResult && <TabsTrigger value="replay">Replay Result</TabsTrigger>}
        </TabsList>

        <ScrollArea className="flex-1">
            <TabsContent value="request" className="m-0 p-4 space-y-4">
            <div>
                <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-foreground">URL</h4>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(request.fullUrl, 'URL')}
                >
                    <Copy className="h-3 w-3" />
                </Button>
                </div>
                <code className="block p-3 bg-muted rounded-lg text-xs font-mono break-all text-foreground">
                {request.fullUrl}
                </code>
            </div>

            {request.requestBody && (
                <div>
                <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-foreground">Body</h4>
                    <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(request.requestBody!, 'Body')}
                    >
                    <Copy className="h-3 w-3" />
                    </Button>
                </div>
                <pre className="p-3 bg-muted rounded-lg text-xs font-mono overflow-auto max-h-[300px] text-foreground">
                    {formatJson(request.requestBody)}
                </pre>
                </div>
            )}

            <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                <span className="text-muted-foreground">Client IP:</span>
                <p className="font-mono text-foreground">{request.clientIp}</p>
                </div>
                <div>
                <span className="text-muted-foreground">Content Length:</span>
                <p className="font-mono text-foreground">{request.contentLength} bytes</p>
                </div>
            </div>
            </TabsContent>

            <TabsContent value="response" className="m-0 p-4 space-y-4">
            <div className="flex items-center gap-4">
                <Badge variant="outline" className={getStatusColor(request.statusCode)}>
                {request.statusCode}
                </Badge>
                <span className="text-sm text-muted-foreground">{request.duration}ms</span>
            </div>

            {request.responseBody && (
                <div>
                <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-foreground">Body</h4>
                    <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(request.responseBody!, 'Response')}
                    >
                    <Copy className="h-3 w-3" />
                    </Button>
                </div>
                <pre className="p-3 bg-muted rounded-lg text-xs font-mono overflow-auto max-h-[300px] text-foreground">
                    {formatJson(request.responseBody)}
                </pre>
                </div>
            )}
            </TabsContent>

            <TabsContent value="headers" className="m-0 p-4 space-y-4">
            <div>
                <h4 className="text-sm font-medium text-foreground mb-2">Request Headers</h4>
                <div className="space-y-1">
                {Object.entries(request.requestHeaders).map(([key, value]) => (
                    <div key={key} className="flex text-xs font-mono p-2 bg-muted rounded">
                    <span className="text-primary shrink-0">{key}:</span>
                    <span className="ml-2 text-foreground break-all">{value}</span>
                    </div>
                ))}
                </div>
            </div>

            <div>
                <h4 className="text-sm font-medium text-foreground mb-2">Response Headers</h4>
                <div className="space-y-1">
                {Object.entries(request.responseHeaders).map(([key, value]) => (
                    <div key={key} className="flex text-xs font-mono p-2 bg-muted rounded">
                    <span className="text-primary shrink-0">{key}:</span>
                    <span className="ml-2 text-foreground break-all">{value}</span>
                    </div>
                ))}
                </div>
            </div>
            </TabsContent>

            {replayResult && (
            <TabsContent value="replay" className="m-0 p-4 space-y-4">
                <div className="flex items-center gap-3">
                {replayResult.success ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                    <XCircle className="h-5 w-5 text-red-500" />
                )}
                <div>
                    <p className="font-medium text-foreground">
                    {replayResult.success ? 'Replay Successful' : 'Replay Failed'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                    Status: {replayResult.statusCode} • {replayResult.duration}ms
                    </p>
                </div>
                </div>

                {replayResult.responseBody && (
                <div>
                    <h4 className="text-sm font-medium text-foreground mb-2">Response</h4>
                    <pre className="p-3 bg-muted rounded-lg text-xs font-mono overflow-auto max-h-[300px] text-foreground">
                    {formatJson(replayResult.responseBody)}
                    </pre>
                </div>
                )}

                {replayResult.error && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                    <p className="text-sm text-destructive">{replayResult.error}</p>
                </div>
                )}
            </TabsContent>
            )}
        </ScrollArea>
        </Tabs>
    </CardContent>
    </Card>
  );
};
