import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TunnelNode } from '@/types/node';
import { useState } from 'react';
import { Copy, Mail, Link, Clock, Check, Users, Settings } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface ShareNodeDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    node: TunnelNode | null;
    onManageShares?: () => void;
}

export function ShareNodeDialog({ open, onOpenChange, node, onManageShares }: ShareNodeDialogProps) {
    const { toast } = useToast();
    const [email, setEmail] = useState('');
    const [expiration, setExpiration] = useState('24h');
    const [permission, setPermission] = useState('view');
    const [generatedLink, setGeneratedLink] = useState('');
    const [isCopied, setIsCopied] = useState(false);

    const handleGenerateLink = () => {
        const token = Math.random().toString(36).substring(2, 15);
        const link = `${window.location.origin}/shared/${node?.id}?token=${token}`;
        setGeneratedLink(link);
    };

    const handleCopyLink = () => {
        navigator.clipboard.writeText(generatedLink);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
        toast({
            title: "Link copied",
            description: "Share link copied to clipboard",
        });
    };

    const handleSendEmail = () => {
        if (!email) {
            toast({
                title: "Email required",
                description: "Please enter an email address",
                variant: "destructive",
            });
            return;
        }

        toast({
            title: "Invite sent",
            description: `Share invitation sent to ${email}`,
        });
        setEmail('');
        onOpenChange(false);
    };

    const handleClose = () => {
        setEmail('');
        setGeneratedLink('');
        setIsCopied(false);
        onOpenChange(false);
    };

    const handleManageShares = () => {
        handleClose();
        onManageShares?.();
    };

    if (!node) return null;

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Mail className="h-5 w-5 text-primary" />
                        Share Node
                    </DialogTitle>
                    <DialogDescription>
                        Share access to <span className="font-medium text-foreground">{node.stats.host_name}</span> with another user via a one-time link.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Manage Existing Shares Button */}
                    {onManageShares && (
                        <Button
                            variant="outline"
                            className="w-full justify-start h-12 text-base"
                            onClick={handleManageShares}
                        >
                            <Users className="w-5 h-5 mr-3" />
                            Manage Existing Shares
                            <Settings className="w-4 h-4 ml-auto opacity-50" />
                        </Button>
                    )}

                    {/* Email Input */}
                    <div className="space-y-2">
                        <Label htmlFor="email">Recipient Email</Label>
                        <Input
                            id="email"
                            type="email"
                            placeholder="colleague@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="h-12"
                        />
                    </div>

                    {/* Permission Level */}
                    <div className="space-y-2">
                        <Label>Permission Level</Label>
                        <Select value={permission} onValueChange={setPermission}>
                            <SelectTrigger className="h-12">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="view" className="h-11">View only</SelectItem>
                                <SelectItem value="edit" className="h-11">Can edit</SelectItem>
                                <SelectItem value="admin" className="h-11">Full access</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Expiration */}
                    <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            Link Expiration
                        </Label>
                        <Select value={expiration} onValueChange={setExpiration}>
                            <SelectTrigger className="h-12">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="1h" className="h-11">1 hour</SelectItem>
                                <SelectItem value="24h" className="h-11">24 hours</SelectItem>
                                <SelectItem value="7d" className="h-11">7 days</SelectItem>
                                <SelectItem value="30d" className="h-11">30 days</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Generate Link Section */}
                    <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                            <Link className="h-4 w-4" />
                            One-Time Share Link
                        </Label>
                        {!generatedLink ? (
                            <Button
                                variant="outline"
                                className="w-full h-12"
                                onClick={handleGenerateLink}
                            >
                                Generate Share Link
                            </Button>
                        ) : (
                            <div className="flex gap-2">
                                <Input
                                    value={generatedLink}
                                    readOnly
                                    className="font-mono text-xs h-12"
                                />
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={handleCopyLink}
                                    className="shrink-0 h-12 w-12"
                                >
                                    {isCopied ? (
                                        <Check className="h-5 w-5 text-green-500" />
                                    ) : (
                                        <Copy className="h-5 w-5" />
                                    )}
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Node Info Preview */}
                    <div className="rounded-lg border border-border bg-secondary/50 p-3 space-y-1">
                        <p className="text-sm font-medium">{node.stats.host_name}</p>
                        <p className="text-xs text-muted-foreground">{node.ip} • {node.stats.host_os_info}</p>
                        <div className="flex flex-wrap gap-1 mt-2">
                            {/*node.tags.map((tag) => (
                                <span
                                    key={tag}
                                    className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs"
                                >
                                    {tag}
                                </span>
                            ))*/}
                        </div>
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={handleClose} className="h-12">
                        Cancel
                    </Button>
                    <Button onClick={handleSendEmail} disabled={!email} className="h-12">
                        <Mail className="h-4 w-4 mr-2" />
                        Send Invite
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
