import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Database,
  Copy,
  Trash2,
  Clock,
  ArrowDownToLine,
  ArrowUpFromLine,
  MapPin,
  Users,
  Network
} from 'lucide-react';
import { TcpTunnel } from '@/types/tcp-tunnel';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface TcpTunnelCardProps {
  tunnel: TcpTunnel;
  onDelete: (id: string) => void;
}

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(1)} GB`;
};

export const TcpTunnelCard = ({ tunnel, onDelete }: TcpTunnelCardProps) => {
  const copyEndpoint = () => {
    navigator.clipboard.writeText(tunnel.publicEndpoint);
    toast.success('Endpoint copied to clipboard');
  };

  return (
    <div className={`bg-card border border-hairline rounded-lg p-5 hover:border-primary/50 transition-colors h-full flex flex-col ${tunnel.status === 'inactive' ? 'opacity-60' : ''}`}>
    {/* Header */}
    <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${tunnel.status === 'active' ? 'bg-blue-500/10' : 'bg-muted'}`}>
            <Database className={`h-5 w-5 ${tunnel.status === 'active' ? 'text-blue-500' : 'text-muted-foreground'}`} />
        </div>
        <div>
            <div className="flex items-center gap-2">
            <h3 className="font-semibold text-foreground">{tunnel.name}</h3>
            <Badge variant={tunnel.protocol === 'tcp' ? 'default' : 'secondary'} className="text-xs uppercase">
                {tunnel.protocol}
            </Badge>
            <Badge variant={tunnel.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                {tunnel.status}
            </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
            {tunnel.localHost}:{tunnel.localPort} → :{tunnel.remotePort}
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

    {/* Public Endpoint */}
    <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg mb-4">
        <Network className="h-4 w-4 text-muted-foreground shrink-0" />
        <code className="flex-1 text-sm text-primary font-mono truncate">
        {tunnel.publicEndpoint}
        </code>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={copyEndpoint}>
        <Copy className="h-4 w-4" />
        </Button>
    </div>

    {/* Stats Grid */}
    <div className="grid grid-cols-2 gap-3 mb-4 flex-1">
        <div className="flex items-center gap-2 text-sm">
        <Users className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-muted-foreground">Connections:</span>
        <span className="font-medium text-foreground">{tunnel.connections}</span>
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
    <div className="flex items-center gap-4 text-xs text-muted-foreground mt-auto">
        <div className="flex items-center gap-1">
        <Clock className="h-3 w-3" />
        Created {formatDistanceToNow(tunnel.createdAt, { addSuffix: true })}
        </div>
    </div>
    </div>
  );
};
