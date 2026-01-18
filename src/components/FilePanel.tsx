import { useState } from 'react';
import { X, Folder, File, ArrowRight, Upload, Download, RefreshCw, ChevronRight } from 'lucide-react';
import { Button } from './ui/button';
import { TunnelNode, FileItem } from '@/types/node';
import { cn } from '@/lib/utils';

interface FilePanelProps {
    isOpen: boolean;
    onClose: () => void;
    nodes: TunnelNode[];
    selectedNode: TunnelNode | null;
    onSelectNode: (node: TunnelNode | null) => void;
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

export function FilePanel({ isOpen, onClose, nodes, selectedNode, onSelectNode }: FilePanelProps) {
    const [sourceNode, setSourceNode] = useState<TunnelNode | null>(null);
    const [destNode, setDestNode] = useState<TunnelNode | null>(null);
    const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
    const [currentPath, setCurrentPath] = useState('/');

    const onlineNodes = nodes/*.filter((n) => n.isOnline);*/;

    const toggleFile = (name: string) => {
        const newSelected = new Set(selectedFiles);
        if (newSelected.has(name)) {
            newSelected.delete(name);
        } else {
            newSelected.add(name);
        }
        setSelectedFiles(newSelected);
    };

    const formatSize = (bytes?: number) => {
        if (!bytes) return '-';
        if (bytes < 1024) return `${bytes}B`;
        if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}K`;
        return `${(bytes / 1048576).toFixed(1)}M`;
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-y-0 right-0 w-full md:w-[700px] lg:w-[900px] bg-card border-l border-border shadow-2xl z-50 animate-slide-in-right flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/50">
                <div className="flex items-center gap-2">
                    <Folder className="w-5 h-5 text-primary" />
                    <span className="text-sm font-medium">File Manager</span>
                </div>
                <Button variant="ghost" size="icon" onClick={onClose}>
                    <X className="w-4 h-4" />
                </Button>
            </div>

            {/* Node Selectors */}
            <div className="flex items-center gap-4 p-4 border-b border-border">
                <div className="flex-1">
                    <label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">
                        Source Node
                    </label>
                    <select
                        className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        value={sourceNode?.id || ''}
                        onChange={(e) => setSourceNode(nodes.find((n) => n.id === e.target.value) || null)}
                    >
                        <option value="">Select node...</option>
                        {onlineNodes.map((node) => (
                            <option key={node.id} value={node.id}>
                                {node.stats.host_name}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex items-center justify-center pt-6">
                    <ArrowRight className="w-5 h-5 text-primary" />
                </div>

                <div className="flex-1">
                    <label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">
                        Destination Node
                    </label>
                    <select
                        className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        value={destNode?.id || ''}
                        onChange={(e) => setDestNode(nodes.find((n) => n.id === e.target.value) || null)}
                    >
                        <option value="">Select node...</option>
                        {onlineNodes
                            .filter((n) => n.id !== sourceNode?.id)
                            .map((node) => (
                                <option key={node.id} value={node.id}>
                                    {node.stats.host_name}
                                </option>
                            ))}
                    </select>
                </div>
            </div>

            {/* Path bar */}
            {sourceNode && (
                <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-background">
                    <span className="text-xs text-muted-foreground">Path:</span>
                    <div className="flex items-center gap-1 font-mono text-sm">
                        {currentPath.split('/').filter(Boolean).map((part, i, arr) => (
                            <span key={i} className="flex items-center">
                                {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground mx-1" />}
                                <button className="hover:text-primary transition-colors">{part || 'root'}</button>
                            </span>
                        ))}
                        {currentPath === '/' && <span className="text-primary">/</span>}
                    </div>
                    <Button variant="ghost" size="icon" className="ml-auto h-7 w-7">
                        <RefreshCw className="w-4 h-4" />
                    </Button>
                </div>
            )}

            {/* File List */}
            <div className="flex-1 overflow-auto">
                {sourceNode ? (
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-secondary/80 backdrop-blur-sm">
                            <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider">
                                <th className="px-4 py-2 w-8"></th>
                                <th className="px-4 py-2">Name</th>
                                <th className="px-4 py-2 w-24">Size</th>
                                <th className="px-4 py-2 w-32">Modified</th>
                                <th className="px-4 py-2 w-28">Permissions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {mockFiles.map((file) => (
                                <tr
                                    key={file.name}
                                    className={cn(
                                        'border-b border-border/50 hover:bg-secondary/50 cursor-pointer transition-colors',
                                        selectedFiles.has(file.name) && 'bg-primary/10'
                                    )}
                                    onClick={() => file.name !== '..' && toggleFile(file.name)}
                                >
                                    <td className="px-4 py-2">
                                        {file.name !== '..' && (
                                            <input
                                                type="checkbox"
                                                checked={selectedFiles.has(file.name)}
                                                onChange={() => toggleFile(file.name)}
                                                className="rounded border-border"
                                            />
                                        )}
                                    </td>
                                    <td className="px-4 py-2">
                                        <div className="flex items-center gap-2">
                                            {file.type === 'directory' ? (
                                                <Folder className="w-4 h-4 text-primary" />
                                            ) : (
                                                <File className="w-4 h-4 text-muted-foreground" />
                                            )}
                                            <span className={cn(file.type === 'directory' && 'text-primary')}>
                                                {file.name}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-2 font-mono text-muted-foreground">
                                        {formatSize(file.size)}
                                    </td>
                                    <td className="px-4 py-2 text-muted-foreground">{file.modified}</td>
                                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                                        {file.permissions}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                        Select a source node to browse files
                    </div>
                )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between gap-4 p-4 border-t border-border bg-secondary/50">
                <div className="text-sm text-muted-foreground">
                    {selectedFiles.size > 0 && `${selectedFiles.size} item(s) selected`}
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={!sourceNode}>
                        <Download className="w-4 h-4" />
                        Download
                    </Button>
                    <Button
                        variant="glow"
                        size="sm"
                        disabled={!sourceNode || !destNode || selectedFiles.size === 0}
                    >
                        <Upload className="w-4 h-4" />
                        Transfer to {destNode?.stats.host_name || 'destination'}
                    </Button>
                </div>
            </div>
        </div>
    );
}
