import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from './ui/button';
import { Check, Copy, Terminal, Download, Server, ArrowRight, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AddServerDialogProps {
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

export function AddServerDialog({ open, onOpenChange }: AddServerDialogProps) {
    const [currentStep, setCurrentStep] = useState(0);
    const [copied, setCopied] = useState(false);

    const installCommand = 'curl -fsSL https://your-domain.com/install.sh | sudo bash -s -- --token YOUR_TOKEN';
    const configCommand = 'tunnel-agent configure --server your-server.com --port 443';

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

    const handleClose = () => {
        setCurrentStep(0);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Server className="w-5 h-5 text-primary" />
                        Add New Server
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
                                Install the tunnel agent on your server using one of the following methods:
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

                                <Button variant="outline" className="w-full">
                                    <Download className="w-4 h-4 mr-2" />
                                    Download for Windows
                                </Button>
                            </div>

                            <div className="border border-accent/30 bg-accent/5 rounded-lg p-4 mt-4">
                                <p className="text-sm text-muted-foreground">
                                    After installation, the agent will open a browser window for you to authorize the device.
                                    Visit <code className="text-primary">https://phirepass.io/device-auth</code> to complete the setup.
                                </p>
                            </div>
                        </div>
                    )}

                    {currentStep === 1 && (
                        <div className="space-y-4">
                            <p className="text-sm text-muted-foreground">
                                Configure the agent with your server settings:
                            </p>

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
                        <Button variant="glow" onClick={handleClose}>
                            Done
                        </Button>
                    ) : (
                        <Button onClick={handleNext}>
                            Next
                            <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
