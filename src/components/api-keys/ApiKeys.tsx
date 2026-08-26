import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Key,
  Plus,
  Copy,
  Trash2,
  Eye,
  EyeOff,
  Clock,
  Shield,
  AlertTriangle
} from 'lucide-react';
import { mockApiKeys, generateApiKey } from '@/data/mockApiKeys';
import { ApiKey, ApiKeyScope } from '@/types/api-key';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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

const AVAILABLE_SCOPES: { value: ApiKeyScope; label: string; description: string }[] = [
  { value: 'tunnels:read', label: 'Tunnels (Read)', description: 'View tunnel information' },
  { value: 'tunnels:write', label: 'Tunnels (Write)', description: 'Create and manage tunnels' },
  { value: 'nodes:read', label: 'Nodes (Read)', description: 'View node information' },
  { value: 'nodes:write', label: 'Nodes (Write)', description: 'Manage nodes' },
  { value: 'logs:read', label: 'Logs (Read)', description: 'View request logs' },
  { value: 'api:full', label: 'Full Access', description: 'Full API access (all permissions)' },
];

const ApiKeys = () => {
  const [keys, setKeys] = useState<ApiKey[]>(mockApiKeys);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScopes, setNewKeyScopes] = useState<ApiKeyScope[]>([]);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [keyToRevoke, setKeyToRevoke] = useState<ApiKey | null>(null);

  const toggleKeyVisibility = (keyId: string) => {
    setVisibleKeys(prev => {
    const next = new Set(prev);
    if (next.has(keyId)) {
        next.delete(keyId);
    } else {
        next.add(keyId);
    }
    return next;
    });
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key).then(() => {
        toast.success('API key copied to clipboard');
    });
  };

  const handleCreateKey = () => {
    if (!newKeyName.trim()) {
        toast.error('Please enter a name for the API key');
        return;
    }

    if (newKeyScopes.length === 0) {
        toast.error('Please select at least one scope');
        return;
    }

    const newKey = generateApiKey();
    const prefix = 'pp_live_';
    const fullKey = prefix + newKey;

    const apiKey: ApiKey = {
        id: `key-${Date.now()}`,
        name: newKeyName,
        key: fullKey,
        prefix,
        createdAt: new Date(),
        scopes: newKeyScopes,
        status: 'active',
    };

    setKeys(prev => [apiKey, ...prev]);
    setCreatedKey(fullKey);
    setNewKeyName('');
    setNewKeyScopes([]);
  };

  const handleRevokeKey = (key: ApiKey) => {
    setKeys(prev => prev.map(k =>
        k.id === key.id ? { ...k, status: 'revoked' as const } : k
    ));

    setKeyToRevoke(null);

    toast.success('API key revoked');
  };

  const handleDeleteKey = (keyId: string) => {
    setKeys(prev => prev.filter(k => k.id !== keyId));
    toast.success('API key deleted');
  };

  const toggleScope = (scope: ApiKeyScope) => {
    setNewKeyScopes(prev => {
    if (scope === 'api:full') {
        return prev.includes(scope) ? [] : ['api:full'];
    }
    if (prev.includes('api:full')) {
        return [scope];
    }
    return prev.includes(scope)
        ? prev.filter(s => s !== scope)
        : [...prev, scope];
    });
  };

  const activeKeys = keys.filter(k => k.status === 'active');

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
            <h1 className="text-2xl font-bold text-foreground">API Keys</h1>
            <p className="text-muted-foreground">Manage programmatic access to your account</p>
        </div>

        <Dialog open={showCreateDialog} onOpenChange={(open) => {
            setShowCreateDialog(open);
            if (!open) {
            setCreatedKey(null);
            setNewKeyName('');
            setNewKeyScopes([]);
            }
        }}>
            <DialogTrigger asChild>
            <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Create API Key
            </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
            {createdKey ? (
                <>
                <DialogHeader>
                    <DialogTitle>API Key Created</DialogTitle>
                    <DialogDescription>
                    Make sure to copy your API key now. You won't be able to see it again!
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                    <div className="p-4 bg-muted rounded-lg">
                    <div className="flex items-center gap-2">
                        <code className="flex-1 text-sm font-mono text-foreground break-all">
                        {createdKey}
                        </code>
                        <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => copyKey(createdKey)}
                        >
                        <Copy className="h-4 w-4" />
                        </Button>
                    </div>
                    </div>
                    <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                    <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5" />
                    <p className="text-sm text-yellow-500">
                        Store this key securely. It will only be shown once.
                    </p>
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={() => setShowCreateDialog(false)}>Done</Button>
                </DialogFooter>
                </>
            ) : (
                <>
                <DialogHeader>
                    <DialogTitle>Create API Key</DialogTitle>
                    <DialogDescription>
                    Create a new API key for programmatic access
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                    <div className="space-y-2">
                    <Label htmlFor="key-name">Name</Label>
                    <Input
                        id="key-name"
                        placeholder="e.g., Production CI/CD"
                        value={newKeyName}
                        onChange={(e) => setNewKeyName(e.target.value)}
                    />
                    </div>
                    <div className="space-y-3">
                    <Label>Scopes</Label>
                    {AVAILABLE_SCOPES.map((scope) => (
                        <div key={scope.value} className="flex items-start space-x-3">
                        <Checkbox
                            id={scope.value}
                            checked={newKeyScopes.includes(scope.value)}
                            onCheckedChange={() => toggleScope(scope.value)}
                        />
                        <div className="grid gap-0.5 leading-none">
                            <label
                            htmlFor={scope.value}
                            className="text-sm font-medium text-foreground cursor-pointer"
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
                <DialogFooter>
                    <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                    Cancel
                    </Button>
                    <Button onClick={handleCreateKey}>Create Key</Button>
                </DialogFooter>
                </>
            )}
            </DialogContent>
        </Dialog>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
        <div className="p-4 bg-card border border-hairline rounded-lg">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Key className="h-4 w-4" />
            Active Keys
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">{activeKeys.length}</p>
        </div>
        <div className="p-4 bg-card border border-hairline rounded-lg">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Shield className="h-4 w-4" />
            Revoked Keys
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">{keys.length - activeKeys.length}</p>
        </div>
        </div>

        {/* API Keys List */}
        <div className="space-y-4">
        {keys.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
            <Key className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No API keys yet</p>
            <p className="text-sm mt-1">Create your first API key to get started</p>
            </div>
        ) : (
            keys.map((key) => (
            <Card key={key.id} className={key.status === 'revoked' ? 'opacity-60' : ''}>
                <CardContent className="p-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <Key className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium text-foreground">{key.name}</span>
                        <Badge variant={key.status === 'active' ? 'default' : 'secondary'}>
                        {key.status}
                        </Badge>
                    </div>

                    <div className="flex items-center gap-2">
                        <code className="text-sm font-mono text-muted-foreground">
                        {visibleKeys.has(key.id) ? key.key : `${key.prefix}${'•'.repeat(24)}`}
                        </code>
                        <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => toggleKeyVisibility(key.id)}
                        >
                        {visibleKeys.has(key.id) ? (
                            <EyeOff className="h-3 w-3" />
                        ) : (
                            <Eye className="h-3 w-3" />
                        )}
                        </Button>
                        <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => copyKey(key.key)}
                        >
                        <Copy className="h-3 w-3" />
                        </Button>
                    </div>

                    <div className="flex flex-wrap gap-1">
                        {key.scopes.map((scope) => (
                        <Badge key={scope} variant="outline" className="text-xs">
                            {scope}
                        </Badge>
                        ))}
                    </div>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Created {formatDistanceToNow(key.createdAt, { addSuffix: true })}
                        </span>
                        {key.lastUsedAt && (
                        <span>
                            Last used {formatDistanceToNow(key.lastUsedAt, { addSuffix: true })}
                        </span>
                        )}
                    </div>
                    </div>

                    <div className="flex items-center gap-2">
                    {key.status === 'active' ? (
                        <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive border-destructive hover:bg-destructive/10"
                        onClick={() => setKeyToRevoke(key)}
                        >
                        Revoke
                        </Button>
                    ) : (
                        <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => handleDeleteKey(key.id)}
                        >
                        <Trash2 className="h-4 w-4" />
                        </Button>
                    )}
                    </div>
                </div>
                </CardContent>
            </Card>
            ))
        )}
        </div>

    {/* Revoke Confirmation */}
    <AlertDialog open={!!keyToRevoke} onOpenChange={() => setKeyToRevoke(null)}>
        <AlertDialogContent>
        <AlertDialogHeader>
            <AlertDialogTitle>Revoke API Key</AlertDialogTitle>
            <AlertDialogDescription>
            Are you sure you want to revoke "{keyToRevoke?.name}"? This action cannot be undone.
            Any applications using this key will immediately lose access.
            </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => keyToRevoke && handleRevokeKey(keyToRevoke)}
            >
            Revoke Key
            </AlertDialogAction>
        </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
    </div>
  );
};

export default ApiKeys;
