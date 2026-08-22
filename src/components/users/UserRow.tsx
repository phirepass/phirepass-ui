'use client';

import {
    Ban,
    Fingerprint,
    KeyRound,
    Mail,
    MoreVertical,
    Network,
    RotateCcw,
    ShieldCheck,
    Trash2,
    UserCog,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ROLE_LABELS, type Role } from '@/lib/rbac';
import { cn } from '@/lib/utils';
import { AUTH_PROVIDER_LABELS, type WorkspaceUser } from '@/types/user';

import { USER_STATUS_STYLES, displayName, formatRelativeTime, initials, isDormant } from './user-display';

const ROLE_STYLES: Record<Role, string> = {
    owner: 'border-violet/40 bg-violet/10 text-violet',
    admin: 'border-accent/40 bg-accent/10 text-accent',
    member: 'border-hairline bg-secondary text-muted-foreground',
};

interface UserRowProps {
    user: WorkspaceUser;
    canManage: boolean;
    canInvite: boolean;
    /** True when this row is the signed-in account, which cannot act on itself. */
    isSelf: boolean;
    /** True when this is the last owner, who cannot be demoted or removed. */
    isLastOwner: boolean;
    onOpen: (user: WorkspaceUser) => void;
    onChangeRole: (user: WorkspaceUser) => void;
    onToggleSuspend: (user: WorkspaceUser) => void;
    onResendInvite: (user: WorkspaceUser) => void;
    onRemove: (user: WorkspaceUser) => void;
}

export function UserRow({
    user,
    canManage,
    canInvite,
    isSelf,
    isLastOwner,
    onOpen,
    onChangeRole,
    onToggleSuspend,
    onResendInvite,
    onRemove,
}: UserRowProps) {
    const statusStyle = USER_STATUS_STYLES[user.status];
    const dormant = isDormant(user);
    // Lucide carries no brand marks, so the provider is named in text and the
    // icon only says "this is how they authenticate".
    const ProviderIcon = user.provider === 'password' ? KeyRound : Fingerprint;

    // The owner of last resort must keep a way back in, so nothing that could
    // orphan the workspace is offered — not even to another owner.
    const protectedAccount = isLastOwner || isSelf;

    return (
        <div
            className={cn(
                'grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl border border-hairline bg-card p-4',
                'transition-colors hover:border-primary/40 md:grid-cols-[auto_2fr_1fr_1fr_1fr_auto]',
                user.status === 'suspended' && 'opacity-70'
            )}
        >
            {/* Identity */}
            <span
                aria-hidden
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-foreground"
            >
                {initials(user)}
            </span>

            <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                    <button
                        type="button"
                        onClick={() => onOpen(user)}
                        className="min-w-0 truncate rounded text-left font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/45"
                    >
                        {displayName(user)}
                    </button>
                    {isSelf ? (
                        <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            you
                        </span>
                    ) : null}
                </div>
                <p className="truncate font-mono text-xs text-muted-foreground">{user.email}</p>
            </div>

            {/* Role */}
            <div className="hidden md:block">
                <span className={cn('inline-flex rounded border px-2 py-0.5 text-xs font-medium', ROLE_STYLES[user.role])}>
                    {ROLE_LABELS[user.role]}
                </span>
            </div>

            {/* Status */}
            <div className="hidden md:flex md:items-center md:gap-2">
                <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-full', statusStyle.dot)} />
                <span className={cn('text-xs font-medium', statusStyle.text)}>{statusStyle.label}</span>
            </div>

            {/* Activity + what they hold */}
            <div className="hidden min-w-0 md:block">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <p className={cn('truncate text-xs', dormant ? 'text-warning' : 'text-muted-foreground')}>
                            {user.status === 'invited'
                                ? `Invited ${formatRelativeTime(user.invited_at)}`
                                : `Seen ${formatRelativeTime(user.last_seen_at)}`}
                        </p>
                    </TooltipTrigger>
                    <TooltipContent>
                        <span className="flex items-center gap-1.5">
                            <Network className="h-3 w-3" /> {user.nodes_count} nodes
                        </span>
                        <span className="flex items-center gap-1.5">
                            <KeyRound className="h-3 w-3" /> {user.tokens_count} tokens
                        </span>
                        <span className="flex items-center gap-1.5">
                            <ProviderIcon className="h-3 w-3" /> {AUTH_PROVIDER_LABELS[user.provider]}
                            {user.mfa_enabled ? ' · MFA on' : ' · no MFA'}
                        </span>
                        {dormant ? <span className="text-warning">Dormant for 90+ days</span> : null}
                    </TooltipContent>
                </Tooltip>
            </div>

            {/* Actions */}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 rounded-full border border-transparent text-muted-foreground transition-colors hover:border-hairline hover:bg-secondary/60 hover:text-foreground"
                        aria-label={`Open actions for ${displayName(user)}`}
                    >
                        <MoreVertical className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    align="end"
                    className="w-56 rounded-xl border-hairline bg-popover/95 p-2 shadow-xl backdrop-blur"
                >
                    <DropdownMenuLabel className="px-2 py-1">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-medium text-muted-foreground">Account</span>
                            <span className={cn('text-[11px] font-medium', statusStyle.text)}>
                                {statusStyle.label}
                            </span>
                        </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />

                    <DropdownMenuItem onClick={() => onOpen(user)}>
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        Account details
                    </DropdownMenuItem>

                    {user.status === 'invited' && canInvite ? (
                        <DropdownMenuItem onClick={() => onResendInvite(user)}>
                            <Mail className="mr-2 h-4 w-4" />
                            Resend invitation
                        </DropdownMenuItem>
                    ) : null}

                    {/* Everything below requires `users:manage`; see src/lib/rbac.ts. */}
                    {canManage ? (
                        <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => onChangeRole(user)} disabled={protectedAccount}>
                                <UserCog className="mr-2 h-4 w-4" />
                                Change role
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => onToggleSuspend(user)}
                                disabled={protectedAccount || user.status === 'invited'}
                            >
                                {user.status === 'suspended' ? (
                                    <RotateCcw className="mr-2 h-4 w-4" />
                                ) : (
                                    <Ban className="mr-2 h-4 w-4" />
                                )}
                                {user.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                onClick={() => onRemove(user)}
                                disabled={protectedAccount}
                                className="text-destructive focus:text-destructive"
                            >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Remove from workspace
                            </DropdownMenuItem>
                        </>
                    ) : null}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
