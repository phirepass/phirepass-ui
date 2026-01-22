"use client";

import { useEffect, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Check, Copy, Terminal, Download, Server, ArrowRight, ArrowLeft, KeyRound, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface AddNodeDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const steps = [
    {
        title: 'Download Agent',
        description: 'Download and install the tunnel agent on your server',
    },
    {
        title: 'Configure',
        description: 'Set up your server connection settings',
    },
    {
        title: 'Connect',
        description: 'Verify connection and start monitoring',
    },
];

export function AddNodeDialog({ open, onOpenChange }: AddNodeDialogProps) {
    const [currentStep, setCurrentStep] = useState(0);
    const [copied, setCopied] = useState(false);
    const [patKey, setPatKey] = useState<string | null>(null);
    const [patLoading, setPatLoading] = useState<boolean>(false);
    const [patError, setPatError] = useState<string | null>(null);
    const { toast } = useToast();

    // const installCommand = 'curl -fsSL https://your-domain.com/install.sh | sudo bash -s -- --token YOUR_TOKEN';
    const installCommand = '# curl something something';

    const configCommand = `tunnel-agent configure --server your-server.com --port 443${patKey ? ` --token ${patKey}` : ''}`;

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleNext = () => {
        if (currentStep < steps.length - 1) {
            setCurrentStep(currentStep + 1);
        }
    };

    const handleBack = () => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1);
        }
    };

    const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen) {
            setCurrentStep(0);
        }
        onOpenChange(nextOpen);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Server className="w-5 h-5 text-primary" />
                        Add New Node
                    </DialogTitle>
                </DialogHeader>

                {/* Progress Steps */}
                <div className="flex items-center justify-between mb-6">
                    {steps.map((step, index) => (
                        <div key={index} className="flex items-center">
                            <div className="flex flex-col items-center">
                                <div
                                    className={cn(
                                        'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                                        index <= currentStep
                                            ? 'bg-primary text-primary-foreground'
                                            : 'bg-secondary text-muted-foreground'
                                    )}
                                >
                                    {index < currentStep ? <Check className="w-4 h-4" /> : index + 1}
                                </div>
                                <span className="text-xs mt-1 text-muted-foreground hidden sm:block">
                                    {step.title}
                                </span>
                            </div>
                            {index < steps.length - 1 && (
                                <div
                                    className={cn(
                                        'w-12 sm:w-20 h-0.5 mx-2',
                                        index < currentStep ? 'bg-primary' : 'bg-border'
                                    )}
                                />
                            )}
                        </div>
                    ))}
                </div>

                {/* Step Content */}
                <div className="min-h-[200px]">
                    {currentStep === 0 && (
                        <div className="space-y-4">
                            <p className="text-sm text-muted-foreground">
                                {/* Install the tunnel agent on your server using one of the following methods:*/ }
                                Install...
                            </p>

                            <div className="space-y-3">
                                <div className="bg-secondary rounded-lg p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                                            <Terminal className="w-3 h-3" /> Quick Install (Linux/macOS)
                                        </span>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 px-2"
                                            onClick={() => handleCopy(installCommand)}
                                        >
                                            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                        </Button>
                                    </div>
                                    <code className="text-xs font-mono text-foreground break-all">
                                        {installCommand}
                                    </code>
                                </div>

                                <Button disabled variant="outline" className="w-full">
                                    <Download className="w-4 h-4 mr-2" />
                                    Download for Windows
                                </Button>
                            </div>

                            <div className="border border-accent/30 bg-accent/5 rounded-lg p-4 mt-4">
                                <p className="text-sm text-muted-foreground">
                                    After installation ... {/* the agent will open a browser window for you to authorize the device.
                                    Visit <code className="text-primary">https://phirepass.io/device-auth</code> to complete the setup. */ }
                                </p>
                            </div>
                        </div>
                    )}

                    {currentStep === 1 && (
                        <div className="space-y-4">
                            <p className="text-sm text-muted-foreground">
                                Configure the agent with your server settings:
                            </p>

                            {/* PAT Generation */}
                            <div className="rounded-lg border border-border bg-background/50 p-4 space-y-3">
                                <h4 className="text-sm font-medium flex items-center gap-2">
                                    <KeyRound className="h-4 w-4" /> Personal Access Token (PAT)
                                </h4>
                                <p className="text-xs text-muted-foreground">
                                    Generate a new PAT to authenticate the agent.
                                </p>
                                <div className="space-y-2">
                                    <Label className="text-xs">Generate new</Label>
                                    <Button
                                        variant="outline"
                                        className="w-full h-9 justify-start gap-2"
                                        disabled={patLoading}
                                        onClick={async () => {
                                            try {
                                                setPatLoading(true);
                                                setPatError(null);
                                                const res = await fetch('/api/pat', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({
                                                        name: `Node Token ${new Date().toLocaleString()}`,
                                                        scopes: ['nodes:read', 'nodes:write', 'tunnels:write'],
                                                    }),
                                                });
                                                if (!res.ok) {
                                                    const err = await res.json().catch(() => ({ error: 'Failed to create token' }));
                                                    throw new Error(err.error || 'Failed to create token');
                                                }
                                                const data = await res.json();
                                                setPatKey(data.key as string);
                                                toast({ title: 'PAT created', description: 'Token generated successfully.' });
                                            } catch (e) {
                                                const msg = e instanceof Error ? e.message : 'Unexpected error';
                                                setPatError(msg);
                                                toast({ title: 'PAT creation failed', description: msg });
                                            } finally {
                                                setPatLoading(false);
                                            }
                                        }}
                                    >
                                        <Plus className="h-4 w-4" /> {patLoading ? 'Generating…' : 'Generate PAT'}
                                    </Button>
                                </div>

                                {patError && (
                                    <p className="text-xs text-destructive">{patError}</p>
                                )}

                                {patKey && (
                                    <div className="space-y-2">
                                        <Label className="text-xs">Generated token</Label>
                                        <div className="flex items-center gap-2">
                                            <Input readOnly value={patKey} className="flex-1 h-9 font-mono" />
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-9"
                                                onClick={() => handleCopy(patKey)}
                                            >
                                                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/*

                            <div className="bg-secondary rounded-lg p-4">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                                        <Terminal className="w-3 h-3" /> Configuration Command
                                    </span>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 px-2"
                                        onClick={() => handleCopy(configCommand)}
                                    >
                                        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                    </Button>
                                </div>
                                <code className="text-xs font-mono text-foreground break-all">
                                    {configCommand}
                                </code>
                            </div>

                            <div className="bg-secondary/50 rounded-lg p-4 space-y-2">
                                <h4 className="text-sm font-medium">Configuration Options:</h4>
                                <ul className="text-xs text-muted-foreground space-y-1">
                                    <li>• <code className="text-primary">--name</code> - Custom server name</li>
                                    <li>• <code className="text-primary">--tags</code> - Comma-separated tags</li>
                                    <li>• <code className="text-primary">--auto-start</code> - Start on boot</li>
                                </ul>
                            </div>

                            */}

                        </div>
                    )}

                    {currentStep === 2 && (
                        <div className="space-y-4">
                            <p className="text-sm text-muted-foreground">
                                Start the agent and verify the connection:
                            </p>

                            <div className="bg-secondary rounded-lg p-4">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                                        <Terminal className="w-3 h-3" /> Start Agent
                                    </span>
                                </div>
                                <code className="text-xs font-mono text-foreground">
                                    sudo systemctl start tunnel-agent
                                </code>
                            </div>

                            <div className="border border-primary/30 bg-primary/5 rounded-lg p-4 flex items-start gap-3">
                                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                                    <Check className="w-4 h-4 text-primary" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-medium text-foreground">Ready to Connect</h4>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Once started, your server will appear in the dashboard within a few seconds.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Navigation */}
                <div className="flex justify-between pt-4 border-t border-border">
                    <Button
                        variant="outline"
                        onClick={handleBack}
                        disabled={currentStep === 0}
                    >
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back
                    </Button>
                    {currentStep === steps.length - 1 ? (
                        <Button variant="glow" onClick={() => handleOpenChange(false)}>
                            Done
                        </Button>
                    ) : (
                        <Button onClick={handleNext} disabled={currentStep === 1 && !patKey}>
                            Next
                            <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
