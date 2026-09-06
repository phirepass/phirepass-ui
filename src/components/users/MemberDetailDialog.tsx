'use client';

import { Mail, Network, ShieldAlert, ShieldCheck } from 'lucide-react';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/rbac';
import { cn } from '@/lib/utils';
import type { OrgMember } from '@/types/org';

import {
    STATUS_STYLES,
    displayName,
    formatDate,
    formatRelativeTime,
    initials,
    providerLabel,
} from './member-display';

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-baseline justify-between gap-4 border-b border-hairline py-2 last:border-0">
            <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
            <span className="min-w-0 truncate text-right text-[13px] text-foreground">{value}</span>
        </div>
    );
}

interface MemberDetailDialogProps {
    member: OrgMember | null;
    onClose: () => void;
}

export function MemberDetailDialog({ member, onClose }: MemberDetailDialogProps) {
    if (!member) return null;

    const status = STATUS_STYLES[member.status];
    const isInvitation = member.kind === 'invitation';

    return (
        <Dialog open={!!member} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-3">
                        <span
                            aria-hidden
                            className={cn(
                                'flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold',
                                isInvitation
                                    ? 'border border-dashed border-hairline text-muted-foreground/70'
                                    : 'bg-secondary',
                            )}
                        >
                            {isInvitation ? <Mail className="h-4 w-4" /> : initials(member)}
                        </span>
                        <span className="min-w-0 truncate">
                            {isInvitation ? member.email : displayName(member)}
                        </span>
                        <span className={cn('shrink-0 text-sm font-medium', status.text)}>{status.label}</span>
                    </DialogTitle>
                    <DialogDescription>
                        {isInvitation
                            ? 'Nobody has signed in with this address yet.'
                            : member.email}
                    </DialogDescription>
                </DialogHeader>

                <div className="rounded-xl border border-hairline bg-card/60 px-3">
                    <Row label="Role" value={ROLE_LABELS[member.role]} />
                    {isInvitation ? (
                        <>
                            <Row label="Invited" value={formatDate(member.created_at)} />
                            <Row label="Expires" value={formatRelativeTime(member.expires_at)} />
                        </>
                    ) : (
                        <>
                            <Row label="Username" value={member.username || '—'} />
                            <Row label="Joined" value={formatDate(member.created_at)} />
                            <Row label="Signs in with" value={providerLabel(member.provider)} />
                            <Row label="Second factor" value={member.mfa_enabled ? 'Enabled' : 'Not enabled'} />
                            <Row label="Nodes" value={String(member.nodes_count)} />
                            <Row label="Tokens" value={String(member.tokens_count)} />
                        </>
                    )}
                </div>

                <p className="flex items-start gap-3 text-[12.5px] leading-relaxed text-muted-foreground">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    <span>
                        <span className="font-medium text-foreground">{ROLE_LABELS[member.role]}</span> —{' '}
                        {ROLE_DESCRIPTIONS[member.role]}
                    </span>
                </p>

                {/* Removing an account is not free: what it holds stays in the
                    workspace, and somebody has to end up looking after it. */}
                {member.nodes_count > 0 || member.tokens_count > 0 ? (
                    <p className="flex items-start gap-3 rounded-xl border border-hairline bg-card/60 px-4 py-3 text-[12.5px] leading-relaxed text-muted-foreground">
                        <Network className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                            Holds {member.nodes_count} node{member.nodes_count === 1 ? '' : 's'} and{' '}
                            {member.tokens_count} token{member.tokens_count === 1 ? '' : 's'}. These stay in
                            the workspace if the account is removed — they belong to the organisation, not to
                            the person who enrolled them.
                        </span>
                    </p>
                ) : null}

                {!isInvitation && !member.mfa_enabled && member.status === 'active' && member.role !== 'member' ? (
                    <p className="flex items-start gap-3 rounded-xl border border-warning/35 bg-warning/10 px-4 py-3 text-[12.5px] leading-relaxed text-warning">
                        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                        No second factor on an account that reaches every node here.
                    </p>
                ) : null}
            </DialogContent>
        </Dialog>
    );
}
