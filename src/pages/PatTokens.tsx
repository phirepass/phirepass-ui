import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
    KeyRound,
    Plus,
    Copy,
    Trash2,
    Eye,
    EyeOff,
    Clock,
    Shield,
    AlertTriangle,
    Calendar,
    CheckCircle2,
    Server
} from 'lucide-react';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

type PatTokenScope = 'read' | 'write' | 'admin';

interface PatToken {
    id: string;
    token_id: string;
    name: string;
    scopes: PatTokenScope[];
    created_at: string;
    expires_at?: string;
    node_count: number;
    status: 'active' | 'expired' | 'revoked';
}

const AVAILABLE_SCOPES: { value: PatTokenScope; label: string; description: string }[] = [
    { value: 'read', label: 'Read', description: 'Read-only access to resources' },
    { value: 'write', label: 'Write', description: 'Create and modify resources' },
    { value: 'admin', label: 'Admin', description: 'Full administrative access' },
];

const EXPIRY_OPTIONS = [
    { label: 'Never', value: 'never' },
    { label: '7 days', value: '7' },
    { label: '30 days', value: '30' },
    { label: '90 days', value: '90' },
    { label: '1 year', value: '365' },
];

const PatTokens = () => {
    const [tokens, setTokens] = useState<PatToken[]>([]);
    const [loading, setLoading] = useState(false);
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [newTokenName, setNewTokenName] = useState('');
    const [newTokenScopes, setNewTokenScopes] = useState<PatTokenScope[]>(['read', 'write']);
    const [newTokenExpiry, setNewTokenExpiry] = useState<string>('never');
    const [createdToken, setCreatedToken] = useState<string | null>(null);
    const [visibleTokens, setVisibleTokens] = useState<Set<string>>(new Set());
    const [tokenToRevoke, setTokenToRevoke] = useState<PatToken | null>(null);

    // Fetch existing tokens
    useEffect(() => {
        fetchTokens();
    }, []);

    const fetchTokens = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/pat/list', { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                setTokens(data.tokens || []);
            } else {
                toast.error('Failed to fetch tokens');
            }
        } catch (err) {
            console.error('Failed to fetch tokens:', err);
            toast.error('Failed to fetch tokens');
        } finally {
            setLoading(false);
        }
    };

    const toggleTokenVisibility = (tokenId: string) => {
        setVisibleTokens(prev => {
            const next = new Set(prev);
            if (next.has(tokenId)) {
                next.delete(tokenId);
            } else {
                next.add(tokenId);
            }
            return next;
        });
    };

    const copyToken = (token: string) => {
        navigator.clipboard.writeText(token);
        toast.success('Token copied to clipboard');
    };

    const handleCreateToken = async () => {
        if (!newTokenName.trim()) {
            toast.error('Please enter a name for the token');
            return;
        }
        if (newTokenScopes.length === 0) {
            toast.error('Please select at least one scope');
            return;
        }

        setLoading(true);
        try {
            const expiresAt = newTokenExpiry === 'never'
                ? null
                : new Date(Date.now() + parseInt(newTokenExpiry) * 24 * 60 * 60 * 1000).toISOString();

            const res = await fetch('/api/pat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    name: newTokenName,
                    scopes: newTokenScopes,
                    expires_at: expiresAt,
                }),
            });

            if (res.ok) {
                const data = await res.json();
                setCreatedToken(data.token);
                toast.success('Token created successfully');
                await fetchTokens();
            } else {
                const err = await res.json().catch(() => ({ error: 'Failed to create token' }));
                toast.error(err.error || 'Failed to create token');
            }
        } catch (err) {
            console.error('Failed to create token:', err);
            toast.error('Failed to create token');
        } finally {
            setLoading(false);
        }
    };

    const handleRevokeToken = async (token: PatToken) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/pat/${token.token_id}`, {
                method: 'DELETE',
                credentials: 'include',
            });

            if (res.ok) {
                toast.success('Token revoked successfully');
                await fetchTokens();
            } else {
                toast.error('Failed to revoke token');
            }
        } catch (err) {
            console.error('Failed to revoke token:', err);
            toast.error('Failed to revoke token');
        } finally {
            setLoading(false);
            setTokenToRevoke(null);
        }
    };

    const resetCreateDialog = () => {
        setShowCreateDialog(false);
        setNewTokenName('');
        setNewTokenScopes(['read', 'write']);
        setNewTokenExpiry('never');
        setCreatedToken(null);
    };

    const activeTokens = tokens.filter(t => t.status === 'active');
    const revokedTokens = tokens.filter(t => t.status === 'revoked');
    const expiredTokens = tokens.filter(t => t.status === 'expired');

    const renderTokenValue = (token: PatToken, fullToken?: string) => {
        const isVisible = visibleTokens.has(token.id);
        const displayValue = fullToken || `pat_${token.token_id}.${'•'.repeat(40)}`;

        if (isVisible || fullToken) {
            return (
                <span className="font-mono text-sm break-all">
                    {displayValue}
                </span>
            );
        }

        return (
            <span className="font-mono text-sm">
                pat_{token.token_id}.{'•'.repeat(40)}
            </span>
        );
    };

    return (
        <div className="container mx-auto px-4 py-6 space-y-6">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Personal Access Tokens</h1>
                    <p className="text-muted-foreground">Create and manage tokens for API authentication</p>
                </div>
                <Button size="sm" onClick={() => setShowCreateDialog(true)} className="gap-2 w-fit">
                    <Plus className="h-4 w-4" />
                    Create Token
                </Button>
            </div>

            {/* Create Token Dialog */}
            <Dialog open={showCreateDialog} onOpenChange={(open) => !open && resetCreateDialog()}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Create Personal Access Token</DialogTitle>
                        <DialogDescription>
                            Create a new token to authenticate with the Phirepass API
                        </DialogDescription>
                    </DialogHeader>

                    {createdToken ? (
                        <div className="space-y-4">
                            <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                                <div className="flex items-start gap-3 mb-3">
                                    <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5" />
                                    <div>
                                        <h4 className="font-medium text-green-500">Token Created Successfully</h4>
                                        <p className="text-sm text-muted-foreground mt-1">
                                            Make sure to copy your token now. You won't be able to see it again!
                                        </p>
                                    </div>
                                </div>
                                <div className="bg-background rounded-md p-3 mt-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <code className="text-sm font-mono break-all flex-1">{createdToken}</code>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => copyToken(createdToken)}
                                            className="shrink-0"
                                        >
                                            <Copy className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button onClick={resetCreateDialog}>Done</Button>
                            </DialogFooter>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-4">
                                <div>
                                    <Label htmlFor="token-name">Token Name</Label>
                                    <Input
                                        id="token-name"
                                        placeholder="e.g., Production API Token"
                                        value={newTokenName}
                                        onChange={(e) => setNewTokenName(e.target.value)}
                                        className="mt-1.5"
                                    />
                                    <p className="text-xs text-muted-foreground mt-1">
                                        A descriptive name to identify this token
                                    </p>
                                </div>

                                <div>
                                    <Label>Expiration</Label>
                                    <Select value={newTokenExpiry} onValueChange={setNewTokenExpiry}>
                                        <SelectTrigger className="mt-1.5">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {EXPIRY_OPTIONS.map(option => (
                                                <SelectItem key={option.value} value={option.value}>
                                                    {option.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        When should this token expire?
                                    </p>
                                </div>

                                <div>
                                    <Label className="mb-3 block">Scopes</Label>
                                    <div className="space-y-3">
                                        {AVAILABLE_SCOPES.map((scope) => (
                                            <div key={scope.value} className="flex items-start gap-3">
                                                <Checkbox
                                                    id={`scope-${scope.value}`}
                                                    checked={newTokenScopes.includes(scope.value)}
                                                    onCheckedChange={(checked) => {
                                                        if (checked) {
                                                            setNewTokenScopes([...newTokenScopes, scope.value]);
                                                        } else {
                                                            setNewTokenScopes(newTokenScopes.filter(s => s !== scope.value));
                                                        }
                                                    }}
                                                />
                                                <div className="flex-1">
                                                    <label
                                                        htmlFor={`scope-${scope.value}`}
                                                        className="text-sm font-medium cursor-pointer"
                                                    >
                                                        {scope.label}
                                                    </label>
                                                    <p className="text-xs text-muted-foreground">
                                                        {scope.description}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={resetCreateDialog}>
                                    Cancel
                                </Button>
                                <Button onClick={handleCreateToken} disabled={loading}>
                                    {loading ? 'Creating...' : 'Create Token'}
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* Revoke Confirmation Dialog */}
            <AlertDialog open={!!tokenToRevoke} onOpenChange={(open) => !open && setTokenToRevoke(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Revoke Token</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to revoke "{tokenToRevoke?.name}"? This action cannot be undone,
                            and any applications using this token will lose access.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => tokenToRevoke && handleRevokeToken(tokenToRevoke)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete Token
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Stats Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <CardContent className="p-6">
                        <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                            <KeyRound className="h-4 w-4" />
                            Active Tokens
                        </div>
                        <p className="text-3xl font-bold">{activeTokens.length}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-6">
                        <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                            <Clock className="h-4 w-4" />
                            Expired
                        </div>
                        <p className="text-3xl font-bold">{expiredTokens.length}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-6">
                        <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                            <AlertTriangle className="h-4 w-4" />
                            Revoked
                        </div>
                        <p className="text-3xl font-bold">{revokedTokens.length}</p>
                    </CardContent>
                </Card>
            </div>

            {/* Active Tokens */}
            {loading && tokens.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                    <p>Loading tokens...</p>
                </div>
            ) : activeTokens.length === 0 && !loading ? (
                <Card>
                    <CardContent className="p-12 text-center">
                        <h3 className="text-lg font-medium mb-2">No active tokens</h3>
                        <p className="text-muted-foreground mb-4">
                            Create your first token to get started with the API
                        </p>
                        <Button size="sm" onClick={() => setShowCreateDialog(true)}>
                            <Plus className="w-4 h-4 mr-2" />
                            Create Token
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-3">
                    {activeTokens.map((token) => (
                        <Card key={token.id}>
                            <CardContent className="p-6">
                                <div className="flex items-start justify-between gap-4 overflow-hidden">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-2">
                                            <h3 className="font-medium text-lg">{token.name}</h3>
                                            <Badge variant="outline" className="text-green-500 border-green-500/30">
                                                Active
                                            </Badge>
                                        </div>

                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2 text-sm">
                                                <span className="text-muted-foreground">Token:</span>
                                                {renderTokenValue(token)}
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7"
                                                    onClick={() => copyToken(`pat_${token.token_id}`)}
                                                >
                                                    <Copy className="w-3.5 h-3.5" />
                                                </Button>
                                            </div>

                                            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                                                <div className="flex items-center gap-1.5">
                                                    <Shield className="w-4 h-4" />
                                                    <span>Scopes: {token.scopes.join(', ')}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <Server className="w-4 h-4" />
                                                    <span>Used with {token.node_count} {token.node_count === 1 ? 'node' : 'nodes'}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <Calendar className="w-4 h-4" />
                                                    <span>Created {formatDistanceToNow(new Date(token.created_at), { addSuffix: true })}</span>
                                                </div>
                                                {token.expires_at && (
                                                    <div className="flex items-center gap-1.5">
                                                        <Clock className="w-4 h-4" />
                                                        <span>Expires {format(new Date(token.expires_at), 'MMM d, yyyy')}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setTokenToRevoke(token)}
                                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Expired/Revoked Tokens */}
            {(expiredTokens.length > 0 || revokedTokens.length > 0) && (
                <div>
                    <h2 className="text-lg font-semibold mb-4\">Inactive Tokens</h2>
                    <div className="space-y-3">
                        {[...expiredTokens, ...revokedTokens].map((token) => (
                            <Card key={token.id} className="opacity-60">
                                <CardContent className="p-6">
                                    <div className="flex items-start justify-between gap-4 overflow-hidden">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-2">
                                                <h3 className="font-medium">{token.name}</h3>
                                                <Badge
                                                    variant="outline"
                                                    className={token.status === 'expired'
                                                        ? 'text-orange-500 border-orange-500/30'
                                                        : 'text-red-500 border-red-500/30'
                                                    }
                                                >
                                                    {token.status === 'expired' ? 'Expired' : 'Revoked'}
                                                </Badge>
                                            </div>

                                            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                                                <div className="flex items-center gap-1.5">
                                                    <Calendar className="w-4 h-4" />
                                                    <span>Created {formatDistanceToNow(new Date(token.created_at), { addSuffix: true })}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default PatTokens;
