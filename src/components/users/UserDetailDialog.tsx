'use client';

import { Fingerprint, KeyRound, Network, ShieldAlert, ShieldCheck } from 'lucide-react';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/rbac';
import { cn } from '@/lib/utils';
import { AUTH_PROVIDER_LABELS, type WorkspaceUser } from '@/types/user';

import { USER_STATUS_STYLES, displayName, formatDate, formatRelativeTime, initials } from './user-display';

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-baseline justify-between gap-4 border-b border-border/40 py-1.5 last:border-0">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
            <span className="min-w-0 truncate text-right font-mono text-sm text-foreground">{value}</span>
        </div>
    );
}

interface UserDetailDialogProps {
    user: WorkspaceUser | null;
    onClose: () => void;
}

export function UserDetailDialog({ user, onClose }: UserDetailDialogProps) {
    if (!user) return null;

    const statusStyle = USER_STATUS_STYLES[user.status];
    const ProviderIcon = user.provider === 'password' ? KeyRound : Fingerprint;

    return (
        <Dialog open={!!user} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-3">
                        <span
                            aria-hidden
                            className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-xs font-semibold"
                        >
                            {initials(user)}
                        </span>
                        {displayName(user)}
                        <span className={cn('text-sm font-medium', statusStyle.text)}>{statusStyle.label}</span>
                    </DialogTitle>
                    <DialogDescription>{user.email}</DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 md:grid-cols-2">
                    <div>
                        <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Account</p>
                        <div className="rounded-lg border border-border bg-card/60 px-3 py-1">
                            <Row label="Username" value={user.username} />
                            <Row label="Role" value={ROLE_LABELS[user.role]} />
                            <Row label="Joined" value={formatDate(user.created_at)} />
                            <Row
                                label={user.status === 'invited' ? 'Invited' : 'Last seen'}
                                value={user.status === 'invited'
                                    ? formatRelativeTime(user.invited_at)
                                    : formatRelativeTime(user.last_seen_at)}
                            />
                        </div>
                    </div>

                    <div>
                        <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                            Authentication
                        </p>
                        <div className="rounded-lg border border-border bg-card/60 px-3 py-1">
                            <Row label="Provider" value={AUTH_PROVIDER_LABELS[user.provider]} />
                            <Row label="MFA" value={user.mfa_enabled ? 'Enabled' : 'Not enabled'} />
                            <Row label="Nodes" value={String(user.nodes_count)} />
                            <Row label="Tokens" value={String(user.tokens_count)} />
                        </div>
                    </div>
                </div>

                <div className="flex items-start gap-3 rounded-lg border border-border bg-card/60 px-4 py-3 text-sm">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    <p className="text-muted-foreground">
                        <span className="font-medium text-foreground">{ROLE_LABELS[user.role]}</span> —{' '}
                        {ROLE_DESCRIPTIONS[user.role]}
                    </p>
                </div>

                {/* Removing an account is not free: what it owns has to go somewhere,
                    which is the whole reason these counts are on the row. */}
                {user.nodes_count > 0 || user.tokens_count > 0 ? (
                    <p className="flex items-start gap-3 rounded-lg border border-warning/35 bg-warning/10 px-4 py-3 text-sm text-warning">
                        <Network className="mt-0.5 h-4 w-4 shrink-0" />
                        Holds {user.nodes_count} node{user.nodes_count === 1 ? '' : 's'} and{' '}
                        {user.tokens_count} token{user.tokens_count === 1 ? '' : 's'}. Removing this account
                        has to reassign or revoke them.
                    </p>
                ) : null}

                {!user.mfa_enabled && user.status === 'active' ? (
                    <p className="flex items-start gap-3 rounded-lg border border-destructive/35 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                        No second factor. Accounts that can reach a node should not rely on a password alone.
                    </p>
                ) : (
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                        <ProviderIcon className="h-3.5 w-3.5" />
                        Signs in with {AUTH_PROVIDER_LABELS[user.provider]}.
                    </p>
                )}
            </DialogContent>
        </Dialog>
    );
}
