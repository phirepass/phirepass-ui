import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { TunnelNode } from '@/types/node';
import { useState } from 'react';
import {
  Users,
  Trash2,
  Clock,
  Link,
  Mail,
  Shield,
  Eye,
  Edit,
  MoreVertical,
  Copy,
  RefreshCw,
  AlertCircle,
  ChevronDown
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Share {
  id: string;
  email: string;
  permission: 'view' | 'edit' | 'admin';
  status: 'active' | 'pending' | 'expired';
  sharedAt: string;
  expiresAt: string;
  lastAccessed?: string;
}

interface ShareLink {
  id: string;
  token: string;
  url: string;
  status: 'active' | 'used' | 'expired';
  createdAt: string;
  expiresAt: string;
  usedBy?: string;
  usedAt?: string;
}

interface ShareManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  node: TunnelNode | null;
}

// Mock data for shares
const mockShares: Share[] = [
  {
    id: '1',
    email: 'alice@example.com',
    permission: 'view',
    status: 'active',
    sharedAt: '2024-01-15',
    expiresAt: '2024-02-15',
    lastAccessed: '2 hours ago',
  },
  {
    id: '2',
    email: 'bob@company.com',
    permission: 'edit',
    status: 'active',
    sharedAt: '2024-01-10',
    expiresAt: '2024-01-20',
    lastAccessed: '1 day ago',
  },
  {
    id: '3',
    email: 'charlie@domain.com',
    permission: 'view',
    status: 'pending',
    sharedAt: '2024-01-18',
    expiresAt: '2024-01-25',
  },
  {
    id: '4',
    email: 'david@test.com',
    permission: 'admin',
    status: 'expired',
    sharedAt: '2023-12-01',
    expiresAt: '2024-01-01',
    lastAccessed: '1 month ago',
  },
];

const mockLinks: ShareLink[] = [
  {
    id: '1',
    token: 'abc123xyz',
    url: 'https://app.example.com/shared/node1?token=abc123xyz',
    status: 'active',
    createdAt: '2024-01-18',
    expiresAt: '2024-01-19',
  },
  {
    id: '2',
    token: 'def456uvw',
    url: 'https://app.example.com/shared/node1?token=def456uvw',
    status: 'used',
    createdAt: '2024-01-15',
    expiresAt: '2024-01-16',
    usedBy: 'eve@example.com',
    usedAt: '2024-01-15',
  },
  {
    id: '3',
    token: 'ghi789rst',
    url: 'https://app.example.com/shared/node1?token=ghi789rst',
    status: 'expired',
    createdAt: '2024-01-10',
    expiresAt: '2024-01-11',
  },
];

export function ShareManagementDialog({ open, onOpenChange, node }: ShareManagementDialogProps) {
  const { toast } = useToast();
  const [shares, setShares] = useState<Share[]>(mockShares);
  const [links, setLinks] = useState<ShareLink[]>(mockLinks);

  const handleRevokeShare = (shareId: string) => {
    setShares(shares.filter(s => s.id !== shareId));
    toast({
    title: "Access revoked",
    description: "User access has been removed",
    });
  };

  const handleRevokeLink = (linkId: string) => {
    setLinks(links.filter(l => l.id !== linkId));
    toast({
    title: "Link revoked",
    description: "Share link has been invalidated",
    });
  };

  const handleResendInvite = (email: string) => {
    toast({
    title: "Invite resent",
    description: `Invitation resent to ${email}`,
    });
  };

  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    toast({
    title: "Link copied",
    description: "Share link copied to clipboard",
    });
  };

  const handleChangePermission = (shareId: string, newPermission: 'view' | 'edit' | 'admin') => {
    setShares(shares.map(s =>
    s.id === shareId ? { ...s, permission: newPermission } : s
    ));
    const permissionLabels = { view: 'View only', edit: 'Can edit', admin: 'Full access' };
    toast({
    title: "Permission updated",
    description: `Changed to "${permissionLabels[newPermission]}"`,
    });
  };

  const handleExtendExpiration = (shareId: string) => {
    toast({
    title: "Expiration extended",
    description: "Share expiration extended by 30 days",
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
    case 'active':
        return <Badge className="bg-success/20 text-success border-success/30">Active</Badge>;
    case 'pending':
        return <Badge className="bg-warning/20 text-warning border-warning/30">Pending</Badge>;
    case 'expired':
        return <Badge className="bg-destructive/20 text-destructive border-destructive/30">Expired</Badge>;
    case 'used':
        return <Badge className="bg-muted text-muted-foreground border-border">Used</Badge>;
    default:
        return null;
    }
  };

  const getPermissionBadge = (permission: string) => {
    switch (permission) {
    case 'view':
        return (
        <Badge variant="outline" className="gap-1 text-muted-foreground">
            <Eye className="w-3 h-3" />
            View
        </Badge>
        );
    case 'edit':
        return (
        <Badge variant="outline" className="gap-1 text-primary border-primary/30">
            <Edit className="w-3 h-3" />
            Edit
        </Badge>
        );
    case 'admin':
        return (
        <Badge variant="outline" className="gap-1 text-accent border-accent/30">
            <Shield className="w-3 h-3" />
            Admin
        </Badge>
        );
    default:
        return null;
    }
  };


  const getPermissionIcon = (permission: string) => {
    switch (permission) {
    case 'view':
        return <Eye className="w-3 h-3" />;
    case 'edit':
        return <Edit className="w-3 h-3" />;
    case 'admin':
        return <Shield className="w-3 h-3" />;
    default:
        return null;
    }
  };

  if (!node) return null;

  const activeShares = shares.filter(s => s.status === 'active').length;
  const pendingShares = shares.filter(s => s.status === 'pending').length;
  const activeLinks = links.filter(l => l.status === 'active').length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Manage Shares
        </DialogTitle>
        <DialogDescription>
            Manage who has access to <span className="font-medium text-foreground">{node.name}</span>
        </DialogDescription>
        </DialogHeader>

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-3 py-2">
        <div className="bg-secondary/50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-foreground">{activeShares}</p>
            <p className="text-xs text-muted-foreground">Active Users</p>
        </div>
        <div className="bg-secondary/50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-warning">{pendingShares}</p>
            <p className="text-xs text-muted-foreground">Pending</p>
        </div>
        <div className="bg-secondary/50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-primary">{activeLinks}</p>
            <p className="text-xs text-muted-foreground">Active Links</p>
        </div>
        </div>

        <Tabs defaultValue="users" className="flex-1 overflow-hidden flex flex-col">
        <TabsList className="w-full justify-start">
            <TabsTrigger value="users" className="flex items-center gap-2">
            <Mail className="w-4 h-4" />
            Shared Users
            </TabsTrigger>
            <TabsTrigger value="links" className="flex items-center gap-2">
            <Link className="w-4 h-4" />
            Share Links
            </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="flex-1 overflow-auto mt-4">
            {shares.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No users have access to this node</p>
            </div>
            ) : (
            <div className="space-y-2">
                {shares.map((share) => (
                <div
                    key={share.id}
                    className={cn(
                    "flex items-center justify-between p-4 rounded-lg border border-border bg-card",
                    share.status === 'expired' && "opacity-60"
                    )}
                >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-primary-foreground">
                        {share.email.charAt(0).toUpperCase()}
                        </span>
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-foreground truncate">{share.email}</p>
                        {getStatusBadge(share.status)}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Expires {share.expiresAt}
                        </span>
                        {share.lastAccessed && (
                            <>
                            <span className="hidden sm:inline">•</span>
                            <span className="hidden sm:inline">Last seen {share.lastAccessed}</span>
                            </>
                        )}
                        </div>
                    </div>
                    </div>

                    {/* Permission Select */}
                    <div className="flex items-center gap-2 shrink-0">
                    <Select
                        value={share.permission}
                        onValueChange={(value: 'view' | 'edit' | 'admin') => handleChangePermission(share.id, value)}
                        disabled={share.status === 'expired'}
                    >
                        <SelectTrigger className="w-[130px] h-10">
                        <SelectValue>
                            <div className="flex items-center gap-2">
                            {getPermissionIcon(share.permission)}
                            <span className="capitalize">{share.permission === 'view' ? 'View' : share.permission === 'edit' ? 'Edit' : 'Admin'}</span>
                            </div>
                        </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                        <SelectItem value="view" className="h-11">
                            <div className="flex items-center gap-2">
                            <Eye className="w-4 h-4" />
                            View only
                            </div>
                        </SelectItem>
                        <SelectItem value="edit" className="h-11">
                            <div className="flex items-center gap-2">
                            <Edit className="w-4 h-4" />
                            Can edit
                            </div>
                        </SelectItem>
                        <SelectItem value="admin" className="h-11">
                            <div className="flex items-center gap-2">
                            <Shield className="w-4 h-4" />
                            Full access
                            </div>
                        </SelectItem>
                        </SelectContent>
                    </Select>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0">
                            <MoreVertical className="w-4 h-4" />
                        </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                        {share.status === 'pending' && (
                            <DropdownMenuItem onClick={() => handleResendInvite(share.email)} className="h-11">
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Resend Invite
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => handleExtendExpiration(share.id)} className="h-11">
                            <Clock className="w-4 h-4 mr-2" />
                            Extend Expiration
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onClick={() => handleRevokeShare(share.id)}
                            className="text-destructive focus:text-destructive h-11"
                        >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Revoke Access
                        </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    </div>
                </div>
                ))}
            </div>
            )}
        </TabsContent>

        <TabsContent value="links" className="flex-1 overflow-auto mt-4">
            {links.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
                <Link className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No share links have been created</p>
            </div>
            ) : (
            <div className="space-y-2">
                {links.map((link) => (
                <div
                    key={link.id}
                    className={cn(
                    "flex items-center justify-between p-4 rounded-lg border border-border bg-card",
                    (link.status === 'expired' || link.status === 'used') && "opacity-60"
                    )}
                >
                    <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                        <code className="text-xs bg-secondary px-2 py-1 rounded font-mono">
                        ...{link.token.slice(-8)}
                        </code>
                        {getStatusBadge(link.status)}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>Created {link.createdAt}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {link.status === 'expired' ? 'Expired' : `Expires ${link.expiresAt}`}
                        </span>
                        {link.usedBy && (
                        <>
                            <span className="hidden sm:inline">•</span>
                            <span className="hidden sm:inline">Used by {link.usedBy}</span>
                        </>
                        )}
                    </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                    {link.status === 'active' && (
                        <Button
                        variant="outline"
                        size="icon"
                        className="h-10 w-10"
                        onClick={() => handleCopyLink(link.url)}
                        >
                        <Copy className="w-4 h-4" />
                        </Button>
                    )}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-10 w-10">
                            <MoreVertical className="w-4 h-4" />
                        </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                        {link.status === 'active' && (
                            <>
                            <DropdownMenuItem onClick={() => handleCopyLink(link.url)} className="h-11">
                                <Copy className="w-4 h-4 mr-2" />
                                Copy Link
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            </>
                        )}
                        <DropdownMenuItem
                            onClick={() => handleRevokeLink(link.id)}
                            className="text-destructive focus:text-destructive h-11"
                        >
                            <Trash2 className="w-4 h-4 mr-2" />
                            {link.status === 'active' ? 'Revoke Link' : 'Delete'}
                        </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    </div>
                </div>
                ))}
            </div>
            )}
        </TabsContent>
        </Tabs>

        {/* Warning for expired items */}
        {(shares.some(s => s.status === 'expired') || links.some(l => l.status === 'expired')) && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 rounded-lg p-3 mt-2">
            <AlertCircle className="w-4 h-4" />
            <span>Expired shares are shown for reference and can be deleted.</span>
        </div>
        )}
    </DialogContent>
    </Dialog>
  );
}
