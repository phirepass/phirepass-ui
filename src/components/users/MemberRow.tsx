'use client';

import {
    Ban,
    KeyRound,
    Mail,
    MoreHorizontal,
    Network,
    RotateCcw,
    ShieldAlert,
    Trash2,
    UserCog,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ROLE_LABELS } from '@/lib/rbac';
import { cn } from '@/lib/utils';
import type { OrgMember } from '@/types/org';

import {
    ROLE_STYLES,
    STATUS_STYLES,
    displayName,
    initials,
    isUnhardenedPrivilege,
    subtitle,
} from './member-display';

interface MemberRowProps {
    member: OrgMember;
    /** True when this row is the signed-in account. */
    isSelf: boolean;
    /** Whether the viewer may change roles, suspend and remove at all. */
    canManage: boolean;
    /** Whether the viewer may invite, which also gates revoking an invitation. */
    canInvite: boolean;
    /**
     * Whether the viewer outranks *this* member. False for an owner seen by an
     * admin, and false for the viewer's own row.
     */
    canActOnThis: boolean;
    /** True when this is the last owner, who cannot be demoted or removed. */
    isLastOwner: boolean;
    busy: boolean;
    onOpen: (member: OrgMember) => void;
    onChangeRole: (member: OrgMember) => void;
    onToggleSuspend: (member: OrgMember) => void;
    onRevokeInvitation: (member: OrgMember) => void;
    onRemove: (member: OrgMember) => void;
}

/**
 * One line in an inset list, not a card.
 *
 * The container owns the border and the dividers (see `MembersPage`), so a row
 * is a row — no second frame around every person, and no grid of boxes where a
 * list is what the eye wants. The menu button appears on hover and on keyboard
 * focus; it is always in the tab order, only not always painted.
 */
export function MemberRow({
    member,
    isSelf,
    canManage,
    canInvite,
    canActOnThis,
    isLastOwner,
    busy,
    onOpen,
    onChangeRole,
    onToggleSuspend,
    onRevokeInvitation,
    onRemove,
}: MemberRowProps) {
    const status = STATUS_STYLES[member.status];
    const isInvitation = member.kind === 'invitation';
    const unhardened = isUnhardenedPrivilege(member);

    // The last owner keeps a way back in, so nothing that could orphan the
    // workspace is offered — not even to another owner.
    const mutable = canManage && canActOnThis && !isLastOwner;

    const holdings = member.nodes_count + member.tokens_count;

    return (
        <div
            className={cn(
                'group/row flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.025]',
                member.status === 'suspended' && 'opacity-60',
                busy && 'pointer-events-none opacity-50',
            )}
        >
            <span
                aria-hidden
                className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                    isInvitation
                        ? 'border border-dashed border-hairline text-muted-foreground/70'
                        : 'bg-secondary text-foreground',
                )}
            >
                {isInvitation ? <Mail className="h-3.5 w-3.5" /> : initials(member)}
            </span>

            <button
                type="button"
                onClick={() => onOpen(member)}
                className="min-w-0 flex-1 rounded text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/45"
            >
                <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[13.5px] font-medium text-foreground">
                        {isInvitation ? member.email : displayName(member)}
                    </span>
                    {isSelf ? (
                        <span className="shrink-0 text-[11px] text-muted-foreground/70">you</span>
                    ) : null}
                    {unhardened ? (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span className="shrink-0 text-warning">
                                    <ShieldAlert className="h-3.5 w-3.5" />
                                    <span className="sr-only">No second factor</span>
                                </span>
                            </TooltipTrigger>
                            <TooltipContent>
                                Reaches every node in this workspace with no second factor.
                            </TooltipContent>
                        </Tooltip>
                    ) : null}
                </span>
                <span className="mt-0.5 block truncate text-[11.5px] text-muted-foreground/70">
                    {isInvitation ? subtitle(member) : `${member.email} · ${subtitle(member)}`}
                </span>
            </button>

            {/* What they hold, so the cost of removing them is on the row rather
                than a surprise in the confirmation. Hidden below `sm`, where the
                name and the role are all that fit. */}
            {holdings > 0 ? (
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span className="hidden shrink-0 items-center gap-1 text-[11.5px] tabular-nums text-muted-foreground/60 sm:flex">
                            <Network className="h-3 w-3" />
                            {member.nodes_count}
                            <KeyRound className="ml-1.5 h-3 w-3" />
                            {member.tokens_count}
                        </span>
                    </TooltipTrigger>
                    <TooltipContent>
                        Holds {member.nodes_count} node{member.nodes_count === 1 ? '' : 's'} and{' '}
                        {member.tokens_count} token{member.tokens_count === 1 ? '' : 's'}
                    </TooltipContent>
                </Tooltip>
            ) : null}

            {member.status === 'suspended' ? (
                <span className={cn('shrink-0 text-[11.5px] font-medium', status.text)}>{status.label}</span>
            ) : null}

            <span className={cn('w-16 shrink-0 text-right text-[11.5px] font-medium', ROLE_STYLES[member.role])}>
                {ROLE_LABELS[member.role]}
            </span>

            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-secondary/60 hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-100 data-[state=open]:opacity-100"
                        aria-label={`Actions for ${isInvitation ? member.email : displayName(member)}`}
                    >
                        <MoreHorizontal className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    align="end"
                    className="w-56 rounded-xl border-hairline bg-popover/95 p-1.5 shadow-xl backdrop-blur"
                >
                    <DropdownMenuItem onClick={() => onOpen(member)}>Details</DropdownMenuItem>

                    {isInvitation ? (
                        canInvite ? (
                            <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    onClick={() => onRevokeInvitation(member)}
                                    className="text-destructive focus:text-destructive"
                                >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Withdraw invitation
                                </DropdownMenuItem>
                            </>
                        ) : null
                    ) : mutable ? (
                        <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => onChangeRole(member)}>
                                <UserCog className="mr-2 h-4 w-4" />
                                Change role
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onToggleSuspend(member)}>
                                {member.status === 'suspended' ? (
                                    <RotateCcw className="mr-2 h-4 w-4" />
                                ) : (
                                    <Ban className="mr-2 h-4 w-4" />
                                )}
                                {member.status === 'suspended' ? 'Reinstate' : 'Suspend'}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                onClick={() => onRemove(member)}
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
