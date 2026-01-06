import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Globe,
  Copy,
  ExternalLink,
  Trash2,
  ChevronDown,
  ChevronUp,
  Clock,
  ArrowDownToLine,
  ArrowUpFromLine,
  Activity,
  MapPin
} from 'lucide-react';
import { Tunnel } from '@/types/tunnel';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { RequestLogsTable } from './RequestLogsTable';

interface TunnelCardProps {
  tunnel: Tunnel;
  onDelete: (id: string) => void;
}

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(1)} GB`;
};

export const TunnelCard = ({ tunnel, onDelete }: TunnelCardProps) => {
  const [showLogs, setShowLogs] = useState(false);

  const copyUrl = () => {
    navigator.clipboard.writeText(tunnel.publicUrl);
    toast.success('URL copied to clipboard');
  };

  const openUrl = () => {
    window.open(tunnel.publicUrl, '_blank');
  };

  return (
    <div className={`bg-card border border-border rounded-lg p-5 hover:border-primary/50 transition-colors h-full flex flex-col ${tunnel.status === 'inactive' ? 'opacity-60' : ''}`}>
    {/* Header */}
    <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${tunnel.status === 'active' ? 'bg-green-500/10' : 'bg-muted'}`}>
            <Globe className={`h-5 w-5 ${tunnel.status === 'active' ? 'text-green-500' : 'text-muted-foreground'}`} />
        </div>
        <div>
            <div className="flex items-center gap-2">
            <h3 className="font-semibold text-foreground">{tunnel.name}</h3>
            <Badge variant={tunnel.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                {tunnel.status}
            </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
            {tunnel.localHost}:{tunnel.localPort}
            </p>
        </div>
        </div>

        {tunnel.status === 'inactive' && (
        <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => onDelete(tunnel.id)}
        >
            <Trash2 className="h-4 w-4" />
        </Button>
        )}
    </div>

    {/* Public URL */}
    <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg mb-4">
        <code className="flex-1 text-sm text-primary font-mono truncate">
        {tunnel.publicUrl}
        </code>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={copyUrl}>
        <Copy className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={openUrl}>
        <ExternalLink className="h-4 w-4" />
        </Button>
    </div>

    {/* Stats Grid */}
    <div className="grid grid-cols-2 gap-3 mb-4 flex-1">
        <div className="flex items-center gap-2 text-sm">
        <Activity className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-muted-foreground">Requests:</span>
        <span className="font-medium text-foreground">{tunnel.requestCount.toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
        <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-muted-foreground">Region:</span>
        <span className="font-medium text-foreground">{tunnel.region}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
        <ArrowDownToLine className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-muted-foreground">In:</span>
        <span className="font-medium text-foreground">{formatBytes(tunnel.bytesIn)}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
        <ArrowUpFromLine className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-muted-foreground">Out:</span>
        <span className="font-medium text-foreground">{formatBytes(tunnel.bytesOut)}</span>
        </div>
    </div>

    {/* Timestamps */}
    <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
        <div className="flex items-center gap-1">
        <Clock className="h-3 w-3" />
        Created {formatDistanceToNow(tunnel.createdAt, { addSuffix: true })}
        </div>
    </div>

    {/* Request Logs Toggle */}
    <Button
        variant="ghost"
        className="w-full justify-between mt-auto"
        onClick={() => setShowLogs(!showLogs)}
    >
        <span className="text-sm">Request Logs ({tunnel.requestLogs.length})</span>
        {showLogs ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
    </Button>

    {showLogs && (
        <div className="mt-4">
        <RequestLogsTable logs={tunnel.requestLogs} />
        </div>
    )}
    </div>
  );
};
