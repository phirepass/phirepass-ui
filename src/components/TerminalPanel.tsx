import { useState, useRef, useEffect } from 'react';
import { X, Plus, Circle } from 'lucide-react';
import { Button } from './ui/button';
import { TerminalTab, TunnelNode } from '@/types/node';
import { cn } from '@/lib/utils';

interface TerminalPanelProps {
  isOpen: boolean;
  onClose: () => void;
  tabs: TerminalTab[];
  onCloseTab: (tabId: string) => void;
  activeTabId: string | null;
  onSelectTab: (tabId: string) => void;
  nodes: TunnelNode[];
  onAddTab: (node: TunnelNode) => void;
}

export function TerminalPanel({
  isOpen,
  onClose,
  tabs,
  onCloseTab,
  activeTabId,
  onSelectTab,
  nodes,
  onAddTab,
}: TerminalPanelProps) {
  const [input, setInput] = useState('');
  const [outputs, setOutputs] = useState<Record<string, string[]>>({});
  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const onlineNodes = nodes.filter((n) => n.isOnline && !tabs.some((t) => t.nodeId === n.id));

  useEffect(() => {
    if (isOpen && inputRef.current) {
    inputRef.current.focus();
    }
  }, [isOpen, activeTabId]);

  useEffect(() => {
    if (terminalRef.current) {
    terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [outputs, activeTabId]);

  const handleCommand = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && input.trim() && activeTab) {
    const newOutput = [...(outputs[activeTab.id] || []), `$ ${input}`, simulateOutput(input)];
    setOutputs((prev) => ({ ...prev, [activeTab.id]: newOutput }));
    setInput('');
    }
  };

  const simulateOutput = (cmd: string): string => {
    const commands: Record<string, string> = {
    ls: 'bin  boot  dev  etc  home  lib  media  mnt  opt  proc  root  run  sbin  srv  sys  tmp  usr  var',
    pwd: '/home/user',
    whoami: 'root',
    uptime: ' 14:32:01 up 45 days, 12:34,  1 user,  load average: 0.45, 0.32, 0.28',
    'uname -a': 'Linux prod-web-01 5.15.0-91-generic #101-Ubuntu SMP x86_64 GNU/Linux',
    df: 'Filesystem     1K-blocks    Used Available Use% Mounted on\n/dev/sda1      102400000 34816000  67584000  34% /',
    free: '              total        used        free      shared  buff/cache   available\nMem:        16384000    10092544     2457600      524288     3833856     5242880',
    };
    return commands[cmd] || `Command not found: ${cmd}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-full md:w-[600px] lg:w-[800px] bg-card border-l border-border shadow-2xl z-50 animate-slide-in-right flex flex-col">
    {/* Header */}
    <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/50">
        <div className="flex items-center gap-2">
        <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-destructive" />
            <div className="w-3 h-3 rounded-full bg-warning" />
            <div className="w-3 h-3 rounded-full bg-success" />
        </div>
        <span className="text-sm font-medium ml-2">Terminal</span>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
        <X className="w-4 h-4" />
        </Button>
    </div>

    {/* Tabs */}
    <div className="flex items-center gap-1 px-2 py-2 border-b border-border bg-background overflow-x-auto">
        {tabs.map((tab) => (
        <div
            key={tab.id}
            className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm cursor-pointer transition-colors group',
            activeTabId === tab.id
                ? 'bg-secondary text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
            )}
            onClick={() => onSelectTab(tab.id)}
        >
            <Circle
            className={cn(
                'w-2 h-2',
                tab.isConnected ? 'fill-success text-success' : 'fill-muted text-muted'
            )}
            />
            <span className="font-mono text-xs">{tab.nodeName}</span>
            <button
            className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive"
            onClick={(e) => {
                e.stopPropagation();
                onCloseTab(tab.id);
            }}
            >
            <X className="w-3 h-3" />
            </button>
        </div>
        ))}
        {onlineNodes.length > 0 && (
        <div className="relative group">
            <Button variant="ghost" size="icon" className="h-7 w-7">
            <Plus className="w-4 h-4" />
            </Button>
            <div className="absolute top-full left-0 mt-1 bg-popover border border-border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 min-w-[160px]">
            {onlineNodes.map((node) => (
                <button
                key={node.id}
                className="w-full px-3 py-2 text-left text-sm hover:bg-secondary transition-colors first:rounded-t-lg last:rounded-b-lg"
                onClick={() => onAddTab(node)}
                >
                {node.name}
                </button>
            ))}
            </div>
        </div>
        )}
    </div>

    {/* Terminal Content */}
    <div
        ref={terminalRef}
        className="flex-1 p-4 font-mono text-sm overflow-auto bg-background"
        onClick={() => inputRef.current?.focus()}
    >
        {activeTab ? (
        <>
            <div className="text-success mb-2">
            Connected to {activeTab.nodeName}
            </div>
            {(outputs[activeTab.id] || []).map((line, i) => (
            <div
                key={i}
                className={cn(
                'whitespace-pre-wrap',
                line.startsWith('$') ? 'text-primary' : 'text-muted-foreground'
                )}
            >
                {line}
            </div>
            ))}
            <div className="flex items-center text-primary mt-2">
            <span className="mr-2">$</span>
            <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleCommand}
                className="flex-1 bg-transparent outline-none text-foreground"
                spellCheck={false}
            />
            <span className="w-2 h-4 bg-primary animate-terminal-blink" />
            </div>
        </>
        ) : (
        <div className="text-muted-foreground">
            No terminal sessions. Click "Terminal" on a node to connect.
        </div>
        )}
    </div>
    </div>
  );
}
