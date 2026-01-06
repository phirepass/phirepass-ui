import { TunnelNode } from '@/types/node';
import { Button } from './ui/button';
import {
  Terminal,
  FolderOpen,
  Power,
  RefreshCw,
  X,
  Copy,
  Download,
  Trash2
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface BulkActionsBarProps {
  selectedNodes: TunnelNode[];
  onClearSelection: () => void;
  onBulkTerminal: () => void;
  onBulkFileTransfer: () => void;
  onBulkReboot: () => void;
  onBulkShutdown: () => void;
  onBulkRefresh: () => void;
  onBulkExport: () => void;
}

export function BulkActionsBar({
  selectedNodes,
  onClearSelection,
  onBulkTerminal,
  onBulkFileTransfer,
  onBulkReboot,
  onBulkShutdown,
  onBulkRefresh,
  onBulkExport,
}: BulkActionsBarProps) {
  const onlineCount = selectedNodes.filter(n => n.isOnline).length;

  if (selectedNodes.length === 0) return null;

  return (
    <div className={cn(
    "fixed bottom-6 left-1/2 -translate-x-1/2 z-30",
    "bg-card border border-border rounded-xl shadow-xl",
    "px-4 py-3 flex items-center gap-4",
    "animate-fade-in"
    )}>
    <div className="flex items-center gap-2 pr-4 border-r border-border">
        <span className="text-sm font-medium text-foreground">
        {selectedNodes.length} selected
        </span>
        {onlineCount < selectedNodes.length && (
        <span className="text-xs text-muted-foreground">
            ({onlineCount} online)
        </span>
        )}
        <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={onClearSelection}
        >
        <X className="w-4 h-4" />
        </Button>
    </div>

    <div className="flex items-center gap-2">
        <Button
        variant="outline"
        size="sm"
        onClick={onBulkTerminal}
        disabled={onlineCount === 0}
        className="gap-2"
        >
        <Terminal className="w-4 h-4" />
        <span className="hidden sm:inline">Open Terminals</span>
        </Button>

        <Button
        variant="outline"
        size="sm"
        onClick={onBulkFileTransfer}
        disabled={selectedNodes.length < 2 || onlineCount < 2}
        className="gap-2"
        >
        <Copy className="w-4 h-4" />
        <span className="hidden sm:inline">Transfer Files</span>
        </Button>

        <Button
        variant="outline"
        size="sm"
        onClick={onBulkRefresh}
        className="gap-2"
        >
        <RefreshCw className="w-4 h-4" />
        <span className="hidden sm:inline">Refresh</span>
        </Button>

        <Button
        variant="outline"
        size="sm"
        onClick={onBulkExport}
        className="gap-2"
        >
        <Download className="w-4 h-4" />
        <span className="hidden sm:inline">Export Stats</span>
        </Button>

        <div className="w-px h-6 bg-border mx-1" />

        <Button
        variant="outline"
        size="sm"
        onClick={onBulkReboot}
        disabled={onlineCount === 0}
        className="gap-2"
        >
        <RefreshCw className="w-4 h-4" />
        <span className="hidden sm:inline">Reboot All</span>
        </Button>

        <Button
        variant="outline"
        size="sm"
        onClick={onBulkShutdown}
        disabled={onlineCount === 0}
        className="gap-2 text-destructive hover:text-destructive"
        >
        <Power className="w-4 h-4" />
        <span className="hidden sm:inline">Shutdown All</span>
        </Button>
    </div>
    </div>
  );
}
