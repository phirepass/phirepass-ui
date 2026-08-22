import { useState } from 'react';
import { X, Folder, File, ArrowRight, Upload, Download, RefreshCw, ChevronRight, FolderUp, Home, HardDrive } from 'lucide-react';
import { Button } from './ui/button';
import { SshTunnel } from '@/types/ssh-tunnel';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

interface SftpPanelProps {
  isOpen: boolean;
  onClose: () => void;
  tunnels: SshTunnel[];
  initialTunnel?: SshTunnel | null;
}

interface FileItem {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  modified: string;
  permissions: string;
}

const mockFiles: FileItem[] = [
  { name: '..', type: 'directory', modified: '', permissions: 'drwxr-xr-x' },
  { name: 'etc', type: 'directory', modified: 'Oct 15 14:30', permissions: 'drwxr-xr-x' },
  { name: 'home', type: 'directory', modified: 'Nov 20 09:15', permissions: 'drwxr-xr-x' },
  { name: 'var', type: 'directory', modified: 'Dec 01 16:45', permissions: 'drwxr-xr-x' },
  { name: 'config.yaml', type: 'file', size: 2048, modified: 'Dec 10 11:20', permissions: '-rw-r--r--' },
  { name: 'deploy.sh', type: 'file', size: 4096, modified: 'Dec 08 08:30', permissions: '-rwxr-xr-x' },
  { name: 'app.log', type: 'file', size: 1048576, modified: 'Dec 13 10:00', permissions: '-rw-r--r--' },
];

function formatSize(bytes?: number) {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / 1048576).toFixed(1)}M`;
}

interface FileTableProps {
  path: string;
  tunnel: SshTunnel | null;
  selectable?: boolean;
  selectedFiles: Set<string>;
  onToggleFile: (name: string) => void;
  onNavigate: (path: string) => void;
}

function FileTable({ path, tunnel, selectable = true, selectedFiles, onToggleFile, onNavigate }: FileTableProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0">
    {/* Path bar */}
    {tunnel && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-hairline bg-background shrink-0">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onNavigate('/')}>
            <Home className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7">
            <FolderUp className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-1 font-mono text-sm flex-1 truncate">
            {path.split('/').filter(Boolean).map((part, i) => (
            <span key={i} className="flex items-center">
                {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground mx-1" />}
                <button className="hover:text-primary transition-colors">{part}</button>
            </span>
            ))}
            {path === '/' && <span className="text-primary">/</span>}
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7">
            <RefreshCw className="w-4 h-4" />
        </Button>
        </div>
    )}

    {/* File List */}
    <div className="flex-1 overflow-auto">
        {tunnel ? (
        <table className="w-full text-sm">
            <thead className="sticky top-0 bg-secondary/80 backdrop-blur-sm">
            <tr className="text-left text-[11px] font-medium text-muted-foreground">
                {selectable && <th className="px-3 py-2 w-8"></th>}
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2 w-20">Size</th>
                <th className="px-3 py-2 w-28">Modified</th>
                <th className="px-3 py-2 w-24">Permissions</th>
            </tr>
            </thead>
            <tbody>
            {mockFiles.map((file) => (
                <tr
                key={file.name}
                className={cn(
                    'border-b border-hairline hover:bg-secondary/50 cursor-pointer transition-colors',
                    selectable && selectedFiles.has(file.name) && 'bg-primary/10'
                )}
                onClick={() => selectable && file.name !== '..' && onToggleFile(file.name)}
                onDoubleClick={() => file.type === 'directory' && file.name !== '..' && onNavigate(`${path}${file.name}/`)}
                >
                {selectable && (
                    <td className="px-3 py-2">
                    {file.name !== '..' && (
                        <input
                        type="checkbox"
                        checked={selectedFiles.has(file.name)}
                        onChange={() => onToggleFile(file.name)}
                        className="rounded border-hairline"
                        />
                    )}
                    </td>
                )}
                <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                    {file.type === 'directory' ? (
                        <Folder className="w-4 h-4 text-primary shrink-0" />
                    ) : (
                        <File className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                    <span className={cn('truncate', file.type === 'directory' && 'text-primary')}>
                        {file.name}
                    </span>
                    </div>
                </td>
                <td className="px-3 py-2 font-mono text-muted-foreground">
                    {formatSize(file.size)}
                </td>
                <td className="px-3 py-2 text-muted-foreground text-xs">{file.modified}</td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {file.permissions}
                </td>
                </tr>
            ))}
            </tbody>
        </table>
        ) : (
        <div className="flex items-center justify-center h-full text-muted-foreground">
            Select a tunnel to browse files
        </div>
        )}
    </div>
    </div>
  );
}

export function SftpPanel({ isOpen, onClose, tunnels, initialTunnel }: SftpPanelProps) {
  const [mode, setMode] = useState<'browse' | 'transfer'>('browse');
  const [sourceTunnel, setSourceTunnel] = useState<SshTunnel | null>(initialTunnel || null);
  const [destTunnel, setDestTunnel] = useState<SshTunnel | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [sourcePath, setSourcePath] = useState('/');
  const [destPath, setDestPath] = useState('/');

  const activeTunnels = tunnels.filter((t) => t.status === 'active');

  const toggleFile = (name: string) => {
    const newSelected = new Set(selectedFiles);
    if (newSelected.has(name)) {
    newSelected.delete(name);
    } else {
    newSelected.add(name);
    }
    setSelectedFiles(newSelected);
  };

  const handleDownload = () => {
    toast.success(`Downloading ${selectedFiles.size} file(s) from ${sourceTunnel?.nodeName}`);
    setSelectedFiles(new Set());
  };

  const handleUpload = () => {
    toast.success(`Upload dialog would open for ${sourceTunnel?.nodeName}`);
  };

  const handleTransfer = () => {
    toast.success(`Transferring ${selectedFiles.size} file(s) from ${sourceTunnel?.nodeName} to ${destTunnel?.nodeName}`);
    setSelectedFiles(new Set());
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-full md:w-[800px] lg:w-[1100px] bg-card border-l border-hairline shadow-2xl z-50 animate-slide-in-right flex flex-col">
    {/* Header */}
    <div className="flex items-center justify-between px-4 py-3 border-b border-hairline bg-secondary/50 shrink-0">
        <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
            <HardDrive className="w-5 h-5 text-primary" />
        </div>
        <div>
            <span className="text-sm font-medium">SFTP File Manager</span>
            {sourceTunnel && (
            <span className="text-xs text-muted-foreground ml-2">
                Connected to {sourceTunnel.nodeName}
            </span>
            )}
        </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
        <X className="w-4 h-4" />
        </Button>
    </div>

    {/* Mode Tabs */}
    <Tabs value={mode} onValueChange={(v) => setMode(v as 'browse' | 'transfer')} className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-full justify-start rounded-none border-b border-hairline bg-background px-4 shrink-0">
        <TabsTrigger value="browse" className="gap-2">
            <Folder className="w-4 h-4" />
            Browse & Download
        </TabsTrigger>
        <TabsTrigger value="transfer" className="gap-2">
            <ArrowRight className="w-4 h-4" />
            Transfer Between Nodes
        </TabsTrigger>
        </TabsList>

        {/* Browse Mode */}
        <TabsContent value="browse" className="flex-1 flex flex-col m-0 min-h-0">
        {/* Tunnel Selector */}
        <div className="flex items-center gap-4 p-4 border-b border-hairline shrink-0">
            <div className="flex-1">
            <label className="text-[11px] font-medium text-muted-foreground mb-2 block">
                Select Tunnel
            </label>
            <select
                className="w-full bg-secondary border border-hairline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={sourceTunnel?.id || ''}
                onChange={(e) => {
                setSourceTunnel(tunnels.find((t) => t.id === e.target.value) || null);
                setSelectedFiles(new Set());
                }}
            >
                <option value="">Select tunnel...</option>
                {activeTunnels.map((tunnel) => (
                <option key={tunnel.id} value={tunnel.id}>
                    {tunnel.name} ({tunnel.nodeName})
                </option>
                ))}
            </select>
            </div>
        </div>

        <FileTable
            path={sourcePath}
            tunnel={sourceTunnel}
            selectedFiles={selectedFiles}
            onToggleFile={toggleFile}
            onNavigate={setSourcePath}
        />

        {/* Actions */}
        <div className="flex items-center justify-between gap-4 p-4 border-t border-hairline bg-secondary/50 shrink-0">
            <div className="text-sm text-muted-foreground">
            {selectedFiles.size > 0 && `${selectedFiles.size} item(s) selected`}
            </div>
            <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleUpload} disabled={!sourceTunnel}>
                <Upload className="w-4 h-4" />
                Upload
            </Button>
            <Button variant="default" size="sm" onClick={handleDownload} disabled={!sourceTunnel || selectedFiles.size === 0}>
                <Download className="w-4 h-4" />
                Download
            </Button>
            </div>
        </div>
        </TabsContent>

        {/* Transfer Mode */}
        <TabsContent value="transfer" className="flex-1 flex flex-col m-0 min-h-0">
        {/* Tunnel Selectors */}
        <div className="flex items-center gap-4 p-4 border-b border-hairline shrink-0">
            <div className="flex-1">
            <label className="text-[11px] font-medium text-muted-foreground mb-2 block">
                Source Tunnel
            </label>
            <select
                className="w-full bg-secondary border border-hairline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={sourceTunnel?.id || ''}
                onChange={(e) => {
                setSourceTunnel(tunnels.find((t) => t.id === e.target.value) || null);
                setSelectedFiles(new Set());
                }}
            >
                <option value="">Select source...</option>
                {activeTunnels.map((tunnel) => (
                <option key={tunnel.id} value={tunnel.id}>
                    {tunnel.name} ({tunnel.nodeName})
                </option>
                ))}
            </select>
            </div>

            <div className="flex items-center justify-center pt-6">
            <ArrowRight className="w-5 h-5 text-primary" />
            </div>

            <div className="flex-1">
            <label className="text-[11px] font-medium text-muted-foreground mb-2 block">
                Destination Tunnel
            </label>
            <select
                className="w-full bg-secondary border border-hairline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={destTunnel?.id || ''}
                onChange={(e) => setDestTunnel(tunnels.find((t) => t.id === e.target.value) || null)}
            >
                <option value="">Select destination...</option>
                {activeTunnels
                .filter((t) => t.id !== sourceTunnel?.id)
                .map((tunnel) => (
                    <option key={tunnel.id} value={tunnel.id}>
                    {tunnel.name} ({tunnel.nodeName})
                    </option>
                ))}
            </select>
            </div>
        </div>

        {/* Dual Pane File Browser */}
        <div className="flex-1 flex min-h-0">
            {/* Source Pane */}
            <div className="flex-1 flex flex-col border-r border-hairline min-h-0">
            <div className="px-3 py-2 bg-muted/50 border-b border-hairline text-xs font-medium text-muted-foreground shrink-0">
                Source: {sourceTunnel?.nodeName || 'Not selected'}
            </div>
            <FileTable
                path={sourcePath}
                tunnel={sourceTunnel}
                selectable={true}
                selectedFiles={selectedFiles}
                onToggleFile={toggleFile}
                onNavigate={setSourcePath}
            />
            </div>

            {/* Destination Pane */}
            <div className="flex-1 flex flex-col min-h-0">
            <div className="px-3 py-2 bg-muted/50 border-b border-hairline text-xs font-medium text-muted-foreground shrink-0">
                Destination: {destTunnel?.nodeName || 'Not selected'}
            </div>
            <FileTable
                path={destPath}
                tunnel={destTunnel}
                selectable={false}
                selectedFiles={selectedFiles}
                onToggleFile={toggleFile}
                onNavigate={setDestPath}
            />
            </div>
        </div>

        {/* Transfer Actions */}
        <div className="flex items-center justify-between gap-4 p-4 border-t border-hairline bg-secondary/50 shrink-0">
            <div className="text-sm text-muted-foreground">
            {selectedFiles.size > 0 && `${selectedFiles.size} item(s) selected for transfer`}
            </div>
            <Button
            variant="glow"
            size="sm"
            onClick={handleTransfer}
            disabled={!sourceTunnel || !destTunnel || selectedFiles.size === 0}
            >
            <ArrowRight className="w-4 h-4" />
            Transfer to {destTunnel?.nodeName || 'destination'}
            </Button>
        </div>
        </TabsContent>
    </Tabs>
    </div>
  );
}
