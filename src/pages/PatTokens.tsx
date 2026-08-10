'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    CheckCircle2,
    KeyRound,
    Plus,
    ShieldOff,
} from 'lucide-react';
import { toast } from 'sonner';

import { AlertStrip, type AlertEntry } from '@/components/AlertStrip';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { Pager } from '@/components/Pager';
import { FilterChips, SearchBar } from '@/components/SearchBar';
import { StatTiles } from '@/components/StatTiles';
import { TokenCard } from '@/components/TokenCard';
import { TokenDetailsDialog } from '@/components/TokenDetailsDialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { TOKEN_EXPIRY_WARNING_DAYS, daysUntil } from '@/lib/token-display';
import { AVAILABLE_SCOPES, EXPIRY_OPTIONS, type PatToken, type PatTokenScope } from '@/types/pat-token';

const TOKENS_PER_PAGE = 9;

type TokenFilter = 'all' | 'active' | 'expiring' | 'inactive';

const PatTokens = () => {
    const [tokens, setTokens] = useState<PatToken[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [revoking, setRevoking] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [newTokenName, setNewTokenName] = useState('');
    const [newTokenScopes] = useState<PatTokenScope[]>(['server:register']);
    const [newTokenExpiry, setNewTokenExpiry] = useState<string>('never');
    const [createdToken, setCreatedToken] = useState<string | null>(null);
    const [createdTokenId, setCreatedTokenId] = useState<string | null>(null);

    const [tokenToRevoke, setTokenToRevoke] = useState<PatToken | null>(null);
    const [detailsTokenId, setDetailsTokenId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filter, setFilter] = useState<TokenFilter>('all');
    const [page, setPage] = useState(1);

    const fetchTokens = useCallback(async () => {
        try {
            const res = await fetch('/api/pat/list', { credentials: 'include' });
            if (!res.ok) {
                throw new Error(`Failed to fetch tokens (${res.status})`);
            }
            const data = await res.json() as { tokens?: PatToken[] };
            setTokens(data.tokens ?? []);
            setError(null);
        } catch (err) {
            console.error('Failed to fetch tokens:', err);
            setError('Failed to fetch tokens');
            toast.error('Failed to fetch tokens');
        } finally {
            setLoading(false);
        }
    }, []);

    // `loading` starts true, so nothing is set synchronously here; every
    // setState inside fetchTokens runs in an async continuation, which the lint
    // rule cannot see through.
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void fetchTokens();
    }, [fetchTokens]);

    const detailsToken = detailsTokenId
        ? tokens.find((token) => token.id === detailsTokenId) ?? null
        : null;

    const activeTokens = useMemo(() => tokens.filter((t) => t.status === 'active'), [tokens]);
    const expiredTokens = useMemo(() => tokens.filter((t) => t.status === 'expired'), [tokens]);
    const revokedTokens = useMemo(() => tokens.filter((t) => t.status === 'revoked'), [tokens]);
    const expiringTokens = useMemo(
        () => activeTokens.filter((token) => {
            const days = daysUntil(token.expires_at);
            return days !== null && days >= 0 && days <= TOKEN_EXPIRY_WARNING_DAYS;
        }),
        [activeTokens]
    );

    const alerts = useMemo<AlertEntry[]>(() => {
        const entries: AlertEntry[] = [];

        for (const token of expiringTokens) {
            const days = daysUntil(token.expires_at) ?? 0;
            entries.push({
                id: `expiring-${token.id}`,
                level: days <= 3 ? 'error' : 'warning',
                title: days === 0 ? 'Token expires today' : `Token expires in ${days} day${days === 1 ? '' : 's'}`,
                message: 'Agents authenticating with this token will stop enrolling once it lapses. Issue a replacement before then.',
                tag: token.name,
            });
        }

        return entries;
    }, [expiringTokens]);

    const filteredTokens = useMemo(() => {
        const needle = searchQuery.trim().toLowerCase();
        const expiringIds = new Set(expiringTokens.map((token) => token.id));

        return tokens
            .filter((token) => {
                if (filter === 'active') return token.status === 'active';
                if (filter === 'inactive') return token.status !== 'active';
                if (filter === 'expiring') return expiringIds.has(token.id);
                return true;
            })
            .filter((token) => {
                if (!needle) return true;
                return (
                    token.name.toLowerCase().includes(needle)
                    || token.token_id.toLowerCase().includes(needle)
                    || token.scopes.some((scope) => scope.toLowerCase().includes(needle))
                );
            })
            .sort((a, b) => {
                // Active first, then most recently created — the same "healthy things
                // first" ordering the node list uses.
                if ((a.status === 'active') !== (b.status === 'active')) {
                    return a.status === 'active' ? -1 : 1;
                }
                return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            });
    }, [tokens, filter, searchQuery, expiringTokens]);

    const pageCount = Math.max(1, Math.ceil(filteredTokens.length / TOKENS_PER_PAGE));
    const clampedPage = Math.min(page, pageCount);
    const pagedTokens = filteredTokens.slice((clampedPage - 1) * TOKENS_PER_PAGE, clampedPage * TOKENS_PER_PAGE);

    const handleCreateToken = async () => {
        if (!newTokenName.trim()) {
            toast.error('Please enter a name for the token');
            return;
        }

        setCreating(true);
        try {
            const expiresAt = newTokenExpiry === 'never'
                ? null
                : new Date(Date.now() + parseInt(newTokenExpiry, 10) * 24 * 60 * 60 * 1000).toISOString();

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

            if (!res.ok) {
                const payload = await res.json().catch(() => ({ error: 'Failed to create token' }));
                throw new Error(payload.error ?? 'Failed to create token');
            }

            const data = await res.json() as { token: string; token_id?: string };
            setCreatedToken(data.token);
            // The secret is `pat_<token_id>.<secret>`; derive the id when the API
            // does not return it separately, so the new card can be highlighted.
            setCreatedTokenId(data.token_id ?? data.token.split('.')[0]?.replace(/^pat_/, '') ?? null);
            toast.success('Token created');
            await fetchTokens();
        } catch (err) {
            console.error('Failed to create token:', err);
            toast.error(err instanceof Error ? err.message : 'Failed to create token');
        } finally {
            setCreating(false);
        }
    };

    const handleRevokeToken = async (token: PatToken) => {
        setRevoking(true);
        try {
            const res = await fetch(`/api/pat/${token.token_id}`, {
                method: 'DELETE',
                credentials: 'include',
            });

            if (!res.ok) {
                throw new Error('Failed to revoke token');
            }

            toast.success('Token revoked');
            await fetchTokens();
        } catch (err) {
            console.error('Failed to revoke token:', err);
            toast.error('Failed to revoke token');
        } finally {
            setRevoking(false);
            setTokenToRevoke(null);
        }
    };

    const resetCreateDialog = () => {
        setShowCreateDialog(false);
        setNewTokenName('');
        setNewTokenExpiry('never');
        setCreatedToken(null);
        // `createdTokenId` deliberately survives the dialog closing: it keeps the
        // freshly-issued card revealing its secret for the rest of the session,
        // which is the only window in which the secret exists client-side.
    };

    const createButton = (
        <Button size="sm" onClick={() => setShowCreateDialog(true)} className="gap-2 w-fit">
            <Plus className="h-4 w-4" />
            Create Token
        </Button>
    );

    return (
        <div className="container mx-auto px-4 py-6 space-y-6">
            <PageHeader
                title="Personal Access Tokens"
                description="Bootstrap credentials that let an agent enrol a node with a server"
                actions={createButton}
            />

            <StatTiles
                tiles={[
                    { label: 'Total Tokens', value: tokens.length, icon: KeyRound, tone: 'accent' },
                    { label: 'Active', value: activeTokens.length, icon: CheckCircle2, tone: 'success' },
                    {
                        label: 'Expiring Soon',
                        value: expiringTokens.length,
                        icon: AlertTriangle,
                        tone: 'warning',
                        hint: `within ${TOKEN_EXPIRY_WARNING_DAYS} days`,
                    },
                    {
                        label: 'Inactive',
                        value: expiredTokens.length + revokedTokens.length,
                        icon: ShieldOff,
                        tone: 'danger',
                        hint: `${expiredTokens.length} expired · ${revokedTokens.length} revoked`,
                    },
                ]}
            />

            {loading ? (
                <div className="text-center py-12 text-muted-foreground">
                    <p>Loading tokens...</p>
                </div>
            ) : error ? (
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-destructive">
                    <p>Error: {error}</p>
                </div>
            ) : (
                <>
                    <AlertStrip alerts={alerts} />

                    <SearchBar
                        value={searchQuery}
                        onChange={(value) => {
                            setSearchQuery(value);
                            setPage(1);
                        }}
                        placeholder="Search tokens..."
                        aria-label="Search tokens by name, ID, or scope"
                    >
                        <FilterChips<TokenFilter>
                            label="Filter tokens by status"
                            value={filter}
                            onChange={(value) => {
                                setFilter(value);
                                setPage(1);
                            }}
                            options={[
                                { value: 'all', label: 'All', count: tokens.length },
                                { value: 'active', label: 'Active', count: activeTokens.length },
                                { value: 'expiring', label: 'Expiring', count: expiringTokens.length },
                                {
                                    value: 'inactive',
                                    label: 'Inactive',
                                    count: expiredTokens.length + revokedTokens.length,
                                },
                            ]}
                        />
                    </SearchBar>

                    {filteredTokens.length === 0 ? (
                        <EmptyState
                            icon={KeyRound}
                            title={tokens.length === 0 ? 'No tokens yet' : 'No tokens match this view'}
                            description={
                                tokens.length === 0
                                    ? 'Create a token to let an agent enrol its first node.'
                                    : 'Try a different search term or clear the status filter.'
                            }
                            action={tokens.length === 0 ? createButton : null}
                        />
                    ) : (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {pagedTokens.map((token) => (
                                    <TokenCard
                                        key={token.id}
                                        token={token}
                                        onRevoke={setTokenToRevoke}
                                        onViewDetails={(target) => setDetailsTokenId(target.id)}
                                        revealedSecret={
                                            createdTokenId && token.token_id === createdTokenId && createdToken
                                                ? createdToken
                                                : undefined
                                        }
                                    />
                                ))}
                            </div>

                            <Pager page={clampedPage} pageCount={pageCount} onPageChange={setPage} />
                        </>
                    )}
                </>
            )}

            {detailsToken ? (
                <TokenDetailsDialog
                    key={detailsToken.id}
                    token={detailsToken}
                    onClose={() => setDetailsTokenId(null)}
                />
            ) : null}

            {/* Create Token Dialog */}
            <Dialog open={showCreateDialog} onOpenChange={(open) => !open && resetCreateDialog()}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Create Personal Access Token</DialogTitle>
                        <DialogDescription>
                            Issue a token an agent can use to register itself with a server
                        </DialogDescription>
                    </DialogHeader>

                    {createdToken ? (
                        <div className="space-y-4">
                            <div className="p-4 bg-success/10 border border-success/30 rounded-lg">
                                <div className="flex items-start gap-3 mb-3">
                                    <CheckCircle2 className="w-5 h-5 text-success mt-0.5 shrink-0" />
                                    <div>
                                        <h4 className="font-medium text-success">Token created</h4>
                                        <p className="text-sm text-muted-foreground mt-1">
                                            Record it now — this is the only time the secret is shown.
                                        </p>
                                    </div>
                                </div>
                                <div className="mt-3">
                                    <Input
                                        value={createdToken}
                                        readOnly
                                        className="font-mono text-sm"
                                        aria-label="New personal access token"
                                    />
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
                                    <Label htmlFor="token-name">Token name</Label>
                                    <Input
                                        id="token-name"
                                        placeholder="e.g. Home lab enrolment"
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
                                            {EXPIRY_OPTIONS.map((option) => (
                                                <SelectItem key={option.value} value={option.value}>
                                                    {option.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Shorter lifetimes limit the blast radius if a token leaks
                                    </p>
                                </div>

                                <div>
                                    <Label className="mb-3 block">Scopes</Label>
                                    <div className="space-y-3">
                                        {AVAILABLE_SCOPES.map((scope) => (
                                            <div
                                                key={scope.value}
                                                className="flex items-start gap-3 rounded-lg border border-accent/35 bg-accent/10 p-3"
                                            >
                                                <Checkbox
                                                    id={`scope-${scope.value}`}
                                                    checked={newTokenScopes.includes(scope.value)}
                                                    disabled
                                                    className="mt-0.5"
                                                />
                                                <div className="flex-1">
                                                    <label
                                                        htmlFor={`scope-${scope.value}`}
                                                        className="text-sm font-medium"
                                                    >
                                                        {scope.label}
                                                    </label>
                                                    <p className="text-xs text-muted-foreground">
                                                        {scope.description}
                                                    </p>
                                                </div>
                                                <span className="font-mono text-[11px] text-muted-foreground/70">
                                                    {scope.value}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-2">
                                        Only one scope exists today, so it is granted automatically.
                                    </p>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={resetCreateDialog}>
                                    Cancel
                                </Button>
                                <Button onClick={() => void handleCreateToken()} disabled={creating}>
                                    {creating ? 'Creating...' : 'Create Token'}
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* Revoke Confirmation */}
            <AlertDialog open={!!tokenToRevoke} onOpenChange={(open) => !open && setTokenToRevoke(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Revoke token</AlertDialogTitle>
                        <AlertDialogDescription>
                            Revoke &ldquo;{tokenToRevoke?.name}&rdquo;? This cannot be undone, and any agent still
                            using it will fail to enrol.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={revoking}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(event) => {
                                event.preventDefault();
                                if (tokenToRevoke) void handleRevokeToken(tokenToRevoke);
                            }}
                            disabled={revoking}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {revoking ? 'Revoking...' : 'Revoke token'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

        </div>
    );
};

export default PatTokens;
