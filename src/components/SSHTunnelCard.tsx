import { SshTunnel } from '@/types/ssh-tunnel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Terminal,
  Copy,
  Trash2,
  Clock,
  ArrowDownToLine,
  ArrowUpFromLine,
  Server,
  Users,
  FolderOpen
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface SshTunnelCardProps {
  tunnel: SshTunnel;
  onDelete: (id: string) => void;
  onOpenTerminal: (tunnel: SshTunnel) => void;
  onOpenSftp: (tunnel: SshTunnel) => void;
  isConnected?: boolean;
}

export function SshTunnelCard({ tunnel, onDelete, onOpenTerminal, onOpenSftp, isConnected }: SshTunnelCardProps) {
  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${(bytes / 1073741824).toFixed(1)} GB`;
  };

  const copyCommand = () => {
    const command = `ssh -p ${tunnel.remotePort} user@tunnel.phirepass.io`;
    navigator.clipboard.writeText(command);
    toast.success('SSH command copied to clipboard');
  };

  return (
    <div className={`bg-card border border-hairline rounded-lg p-5 hover:border-primary/50 transition-colors h-full flex flex-col ${tunnel.status === 'inactive' ? 'opacity-60' : ''}`}>
    {/* Header */}
    <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${tunnel.status === 'active' ? 'bg-primary/10' : 'bg-muted'}`}>
            <Terminal className={`h-5 w-5 ${tunnel.status === 'active' ? 'text-primary' : 'text-muted-foreground'}`} />
        </div>
        <div>
            <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-foreground">{tunnel.name}</h3>
            <Badge variant={tunnel.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                {tunnel.status}
            </Badge>
            {isConnected && (
                <Badge variant="outline" className="text-primary border-primary text-xs">
                Terminal Open
                </Badge>
            )}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Server className="h-3 w-3" />
            <span>{tunnel.nodeName}</span>
            <span className="text-xs font-mono">({tunnel.nodeIp})</span>
            </div>
        </div>
        </div>

        <div className="flex items-center gap-2">
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
    </div>

    {/* SSH Command */}
    <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg mb-4">
        <code className="flex-1 text-sm text-primary font-mono truncate">
        ssh -p {tunnel.remotePort} user@tunnel.phirepass.io
        </code>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={copyCommand}>
        <Copy className="h-4 w-4" />
        </Button>
    </div>

    {/* Stats Grid */}
    <div className="grid grid-cols-2 gap-3 mb-4 flex-1">
        <div className="flex items-center gap-2 text-sm">
        <Users className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-muted-foreground">Sessions:</span>
        <span className="font-medium text-foreground">{tunnel.sessions}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
        <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-muted-foreground">Last:</span>
        <span className="font-medium text-foreground truncate">{formatDistanceToNow(new Date(tunnel.lastConnected), { addSuffix: true })}</span>
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

    {/* Action Buttons */}
    <div className="flex gap-2 mt-auto">
        <Button
        variant="outline"
        className="flex-1 gap-2"
        onClick={() => onOpenSftp(tunnel)}
        disabled={tunnel.status === 'inactive'}
        >
        <FolderOpen className="h-4 w-4" />
        SFTP
        </Button>
        <Button
        variant="default"
        className="flex-1 gap-2"
        onClick={() => onOpenTerminal(tunnel)}
        disabled={tunnel.status === 'inactive'}
        >
        <Terminal className="h-4 w-4" />
        Terminal
        </Button>
    </div>
    </div>
  );
}
