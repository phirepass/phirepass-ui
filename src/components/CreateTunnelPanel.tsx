import { X, Terminal, Copy, Server } from 'lucide-react';
import { Button } from './ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { toast } from 'sonner';

interface CreateTunnelPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

export function CreateTunnelPanel({ isOpen, onClose }: CreateTunnelPanelProps) {
    const copyCommand = (command: string) => {
        navigator.clipboard.writeText(command);
        toast.success('Command copied to clipboard');
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-y-0 right-0 w-full md:w-[700px] lg:w-[900px] bg-card border-l border-border shadow-2xl z-50 animate-slide-in-right flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/50 shrink-0">
                <div className="flex items-center gap-2">
                    <Terminal className="w-5 h-5 text-primary" />
                    <div>
                        <span className="text-sm font-medium">Connect</span>
                        <p className="text-xs text-muted-foreground">Run the Phirepass CLI to expose your local service</p>
                    </div>
                </div>
                <Button variant="ghost" size="icon" onClick={onClose}>
                    <X className="w-4 h-4" />
                </Button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                <Tabs defaultValue="http" className="w-full">
                    <div className="border-b border-border px-4 pt-4">
                        <TabsList className="w-full">
                            <TabsTrigger value="http" className="flex-1">HTTP</TabsTrigger>
                            <TabsTrigger value="tcp" className="flex-1">TCP/UDP</TabsTrigger>
                            <TabsTrigger value="ssh" className="flex-1">SSH</TabsTrigger>
                        </TabsList>
                    </div>

                    <div className="p-4">
                        <TabsContent value="http" className="space-y-4">
                            <div className="space-y-2">
                                <h4 className="text-sm font-medium text-foreground">1. Install the CLI</h4>
                                <div className="flex items-center gap-2 p-3 bg-muted rounded-lg font-mono text-sm">
                                    <Terminal className="h-4 w-4 text-muted-foreground shrink-0" />
                                    <code className="flex-1 text-foreground">npm install -g phirepass</code>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 shrink-0"
                                        onClick={() => copyCommand('npm install -g phirepass')}
                                    >
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <h4 className="text-sm font-medium text-foreground">2. Authenticate</h4>
                                <div className="flex items-center gap-2 p-3 bg-muted rounded-lg font-mono text-sm">
                                    <Terminal className="h-4 w-4 text-muted-foreground shrink-0" />
                                    <code className="flex-1 text-foreground">phirepass auth login</code>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 shrink-0"
                                        onClick={() => copyCommand('phirepass auth login')}
                                    >
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <h4 className="text-sm font-medium text-foreground">3. Start the tunnel</h4>
                                <div className="flex items-center gap-2 p-3 bg-muted rounded-lg font-mono text-sm">
                                    <Terminal className="h-4 w-4 text-muted-foreground shrink-0" />
                                    <code className="flex-1 text-foreground">phirepass http 3000</code>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 shrink-0"
                                        onClick={() => copyCommand('phirepass http 3000')}
                                    >
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Replace 3000 with your local port number
                                </p>
                            </div>

                            <div className="pt-2 border-t border-border">
                                <h4 className="text-sm font-medium text-foreground mb-2">Additional Options</h4>
                                <div className="space-y-2 text-xs text-muted-foreground font-mono">
                                    <p><span className="text-foreground">--name</span> Custom tunnel name</p>
                                    <p><span className="text-foreground">--region</span> Server region (us-east-1, eu-west-1, ap-southeast-1)</p>
                                    <p><span className="text-foreground">--subdomain</span> Custom subdomain</p>
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="tcp" className="space-y-4">
                            <div className="space-y-2">
                                <h4 className="text-sm font-medium text-foreground">TCP Tunnel (e.g., MySQL)</h4>
                                <div className="flex items-center gap-2 p-3 bg-muted rounded-lg font-mono text-sm">
                                    <Terminal className="h-4 w-4 text-muted-foreground shrink-0" />
                                    <code className="flex-1 text-foreground">phirepass tcp 3306</code>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 shrink-0"
                                        onClick={() => copyCommand('phirepass tcp 3306')}
                                    >
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <h4 className="text-sm font-medium text-foreground">UDP Tunnel (e.g., Game Server)</h4>
                                <div className="flex items-center gap-2 p-3 bg-muted rounded-lg font-mono text-sm">
                                    <Terminal className="h-4 w-4 text-muted-foreground shrink-0" />
                                    <code className="flex-1 text-foreground">phirepass udp 27015</code>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 shrink-0"
                                        onClick={() => copyCommand('phirepass udp 27015')}
                                    >
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <h4 className="text-sm font-medium text-foreground">With Custom Remote Port</h4>
                                <div className="flex items-center gap-2 p-3 bg-muted rounded-lg font-mono text-sm">
                                    <Terminal className="h-4 w-4 text-muted-foreground shrink-0" />
                                    <code className="flex-1 text-foreground">phirepass tcp 5432 --remote-port 45432</code>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 shrink-0"
                                        onClick={() => copyCommand('phirepass tcp 5432 --remote-port 45432')}
                                    >
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            <div className="pt-2 border-t border-border">
                                <h4 className="text-sm font-medium text-foreground mb-2">Common Use Cases</h4>
                                <div className="space-y-1 text-xs text-muted-foreground">
                                    <p><span className="text-foreground font-medium">MySQL:</span> phirepass tcp 3306</p>
                                    <p><span className="text-foreground font-medium">PostgreSQL:</span> phirepass tcp 5432</p>
                                    <p><span className="text-foreground font-medium">Redis:</span> phirepass tcp 6379</p>
                                    <p><span className="text-foreground font-medium">MongoDB:</span> phirepass tcp 27017</p>
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="ssh" className="space-y-4">
                            <div className="space-y-2">
                                <h4 className="text-sm font-medium text-foreground">SSH Tunnel (Reverse SSH)</h4>
                                <div className="flex items-center gap-2 p-3 bg-muted rounded-lg font-mono text-sm">
                                    <Terminal className="h-4 w-4 text-muted-foreground shrink-0" />
                                    <code className="flex-1 text-foreground">phirepass ssh 22</code>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 shrink-0"
                                        onClick={() => copyCommand('phirepass ssh 22')}
                                    >
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <h4 className="text-sm font-medium text-foreground">With Custom Remote Port</h4>
                                <div className="flex items-center gap-2 p-3 bg-muted rounded-lg font-mono text-sm">
                                    <Terminal className="h-4 w-4 text-muted-foreground shrink-0" />
                                    <code className="flex-1 text-foreground">phirepass ssh 22 --remote-port 2222</code>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 shrink-0"
                                        onClick={() => copyCommand('phirepass ssh 22 --remote-port 2222')}
                                    >
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <h4 className="text-sm font-medium text-foreground">Named Tunnel</h4>
                                <div className="flex items-center gap-2 p-3 bg-muted rounded-lg font-mono text-sm">
                                    <Terminal className="h-4 w-4 text-muted-foreground shrink-0" />
                                    <code className="flex-1 text-foreground">phirepass ssh 22 --name "production-server"</code>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 shrink-0"
                                        onClick={() => copyCommand('phirepass ssh 22 --name "production-server"')}
                                    >
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            <div className="pt-2 border-t border-border">
                                <h4 className="text-sm font-medium text-foreground mb-2">Connect to Your Server</h4>
                                <p className="text-xs text-muted-foreground mb-2">
                                    Once the tunnel is active, connect using:
                                </p>
                                <div className="flex items-center gap-2 p-3 bg-muted rounded-lg font-mono text-sm">
                                    <Server className="h-4 w-4 text-muted-foreground shrink-0" />
                                    <code className="flex-1 text-foreground">ssh -p 2222 user@tunnel.phirepass.io</code>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 shrink-0"
                                        onClick={() => copyCommand('ssh -p 2222 user@tunnel.phirepass.io')}
                                    >
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </TabsContent>
                    </div>
                </Tabs>
            </div>
        </div>
    );
}
