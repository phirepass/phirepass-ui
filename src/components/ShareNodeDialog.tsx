'use client';

/**
 * Sharing one node with the people you already work with.
 *
 * Two audiences and no third, which is the whole shape of the feature: the
 * workspace, or somebody in it. There is no link to copy and no address to
 * type, because a share cannot reach outside the organisation — the API refuses
 * a grantee who is not an active member, so an email field could only ever
 * produce a refusal, and a field whose most likely outcome is "no" is a field
 * that should not exist.
 *
 * What this grants is *use*: the node appears in their list, its monitors show
 * up, and they can open a session against it. Renaming it, deleting it, editing
 * its services and reading service credentials all stay with the owner — see
 * `nodeManageScope`, which has no share arm.
 *
 * This replaced a mockup that offered share links, per-share expiry and
 * permission levels against no API at all.
 */

import { useCallback, useEffect, useState } from 'react';
import { Building2, Check, Loader2, Plus, Users, X } from 'lucide-react';
import { toast } from 'sonner';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useCurrentOrg } from '@/lib/session';
import { ROLE_STYLES } from '@/components/users/member-display';
import type { TunnelNode } from '@/types/node';
import type { NodeShare, ShareCandidate, SharesResponse } from '@/types/share';

interface ShareNodeDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    node: TunnelNode | null;
    /** Kept for callers that still pass it; this dialog manages shares itself. */
    onManageShares?: () => void;
}

function personName(entry: { username: string | null; email: string | null }): string {
    return entry.username?.trim() || entry.email?.split('@')[0] || 'Someone';
}

function initials(name: string): string {
    return name.trim().charAt(0).toUpperCase() || '?';
}

/** One round tile, in place of a per-row card — the list is one list. */
function Monogram({ label, url }: { label: string; url?: string | null }) {
    if (url) {
        return <img src={url} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-hairline" />;
    }

    return (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-[11px] font-semibold text-foreground ring-1 ring-hairline">
            {label}
        </span>
    );
}

export function ShareNodeDialog({ open, onOpenChange, node }: ShareNodeDialogProps) {
    const org = useCurrentOrg();

    const [shares, setShares] = useState<NodeShare[]>([]);
    const [candidates, setCandidates] = useState<ShareCandidate[]>([]);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const nodeId = node?.id ?? null;

    const apply = useCallback((data: SharesResponse) => {
        setShares(data.shares ?? []);
        setCandidates(data.candidates ?? []);
    }, []);

    /**
     * Every mutation answers with both refreshed lists, so nothing here patches
     * a row locally: adding a person moves them from one list to the other, and
     * a client that did that itself is a client that can disagree with the
     * database about who can reach a machine.
     */
    const request = useCallback(async (input: string, init?: RequestInit): Promise<SharesResponse | null> => {
        const res = await fetch(input, {
            credentials: 'include',
            headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
            ...init,
        });

        const body = await res.json().catch(() => null) as (SharesResponse & { error?: string }) | null;

        if (!res.ok) {
            /*
             * A 404 here is almost never a missing node — the card that opened
             * this dialog is on screen. It is `nodeManageScope` refusing, which
             * is what the API says to somebody who can *reach* a node but not
             * change it: a member who was given it, rather than its owner. The
             * route is right to answer 404 (403 would confirm the id exists to
             * somebody who cannot see it); the dialog is the place to say what
             * that means to a person looking at the machine.
             */
            if (res.status === 404) {
                throw new Error('Only this node\u2019s owner, or a workspace admin, can change who reaches it.');
            }

            // Otherwise the route's own message: it says *why* — not a member
            // of this workspace, already the owner, no longer shared.
            throw new Error(body?.error || 'Something went wrong');
        }

        return body;
    }, []);

    useEffect(() => {
        if (!open || !nodeId) return;

        let alive = true;

        /*
         * The lists are cleared as this starts, not left behind. Reopening the
         * dialog on a *different* node would otherwise show the previous node's
         * shares for as long as the fetch takes — which is a moment of showing
         * somebody the wrong answer to "who can reach this machine".
         */
        const load = async () => {
            setShares([]);
            setCandidates([]);
            setError(null);
            setLoading(true);

            try {
                const data = await request(`/api/nodes/${nodeId}/shares`);
                if (alive && data) apply(data);
            } catch (e) {
                if (alive) setError(e instanceof Error ? e.message : 'Could not load sharing');
            } finally {
                if (alive) setLoading(false);
            }
        };

        void load();

        return () => { alive = false; };
    }, [open, nodeId, request, apply]);

    const orgShare = shares.find((share) => share.audience === 'org') ?? null;
    const memberShares = shares.filter((share) => share.audience === 'member');

    const mutate = useCallback(async (key: string, input: string, init: RequestInit, done: string) => {
        setBusy(key);
        try {
            const data = await request(input, init);
            if (data) apply(data);
            toast.success(done);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Something went wrong');
        } finally {
            setBusy(null);
        }
    }, [request, apply]);

    const toggleOrgShare = useCallback(() => {
        if (!nodeId) return;

        if (orgShare) {
            void mutate('org', `/api/nodes/${nodeId}/shares/${orgShare.id}`, { method: 'DELETE' },
                'The workspace no longer has this node');
            return;
        }

        void mutate('org', `/api/nodes/${nodeId}/shares`, {
            method: 'POST',
            body: JSON.stringify({ audience: 'org' }),
        }, 'Shared with the whole workspace');
    }, [nodeId, orgShare, mutate]);

    const workspaceName = org?.name ?? 'this workspace';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="truncate">Share {node?.name || node?.stats?.host_name || 'node'}</DialogTitle>
                    <DialogDescription>
                        People you share with can open sessions and see this node&apos;s monitors. Only you can
                        rename it, delete it, or change its services.
                    </DialogDescription>
                </DialogHeader>

                {error ? (
                    <p className="rounded-[10px] border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
                        {error}
                    </p>
                ) : null}

                {loading ? (
                    <div className="flex items-center justify-center gap-2 py-8 text-[13px] text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading sharing…
                    </div>
                ) : (
                    <div className="space-y-5">
                        {/* Everyone at once. One row, because it is one decision. */}
                        <div className="overflow-hidden rounded-[10px] border border-hairline bg-white/[0.03] mac-squircle">
                            <div className="flex items-center gap-3 px-3 py-3">
                                <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-[13px] leading-tight text-foreground">
                                        Everyone in {workspaceName}
                                    </p>
                                    <p className="mt-0.5 truncate text-[11px] leading-tight text-muted-foreground">
                                        {orgShare
                                            ? 'Every member of this workspace can reach it'
                                            : 'Members reach only their own nodes'}
                                    </p>
                                </div>
                                <Switch
                                    checked={!!orgShare}
                                    disabled={busy !== null}
                                    onCheckedChange={toggleOrgShare}
                                    aria-label={`Share with everyone in ${workspaceName}`}
                                />
                            </div>
                        </div>

                        {memberShares.length > 0 && (
                            <section>
                                <h3 className="px-1 pb-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                                    Shared with
                                </h3>
                                <div className="overflow-hidden rounded-[10px] border border-hairline bg-white/[0.03] mac-squircle">
                                    {memberShares.map((share, index) => {
                                        const name = personName({ username: share.grantee_username, email: share.grantee_email });

                                        return (
                                            <div
                                                key={share.id}
                                                className={cn(
                                                    'flex items-center gap-3 px-3 py-2.5',
                                                    index > 0 && 'border-t border-hairline',
                                                )}
                                            >
                                                <Monogram label={initials(name)} url={share.grantee_avatar_url} />
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-[13px] leading-tight text-foreground">{name}</p>
                                                    <p className="truncate text-[11px] leading-tight text-muted-foreground">
                                                        {share.grantee_email}
                                                    </p>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                                                    aria-label={`Stop sharing with ${name}`}
                                                    disabled={busy !== null}
                                                    onClick={() => nodeId && mutate(
                                                        share.id,
                                                        `/api/nodes/${nodeId}/shares/${share.id}`,
                                                        { method: 'DELETE' },
                                                        `${name} can no longer reach this node`,
                                                    )}
                                                >
                                                    {busy === share.id
                                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                                        : <X className="h-4 w-4" />}
                                                </Button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>
                        )}

                        <section>
                            <h3 className="px-1 pb-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                                {memberShares.length > 0 ? 'Add someone else' : 'Share with one person'}
                            </h3>

                            {candidates.length === 0 ? (
                                /* Nobody left is two different situations, and the
                                   difference matters: an empty workspace is a thing
                                   to fix, everyone-already-added is not. */
                                <p className="rounded-[10px] border border-hairline bg-white/[0.02] px-3 py-4 text-center text-[12px] text-muted-foreground mac-squircle">
                                    {memberShares.length > 0
                                        ? 'Everyone in this workspace already has it.'
                                        : 'There is nobody else in this workspace yet. Invite someone from Members.'}
                                </p>
                            ) : (
                                <div className="max-h-56 overflow-y-auto overflow-x-hidden rounded-[10px] border border-hairline bg-white/[0.03] mac-squircle">
                                    {candidates.map((person, index) => {
                                        const name = personName(person);

                                        return (
                                            <div
                                                key={person.id}
                                                className={cn(
                                                    'flex items-center gap-3 px-3 py-2.5',
                                                    index > 0 && 'border-t border-hairline',
                                                )}
                                            >
                                                <Monogram label={initials(name)} url={person.avatar_url} />
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-[13px] leading-tight text-foreground">{name}</p>
                                                    <p className="truncate text-[11px] leading-tight text-muted-foreground">
                                                        {person.email}
                                                    </p>
                                                </div>
                                                <span className={cn('shrink-0 text-[11px] capitalize', ROLE_STYLES[person.role])}>
                                                    {person.role}
                                                </span>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 shrink-0"
                                                    aria-label={`Share with ${name}`}
                                                    disabled={busy !== null}
                                                    onClick={() => nodeId && mutate(
                                                        person.id,
                                                        `/api/nodes/${nodeId}/shares`,
                                                        { method: 'POST', body: JSON.stringify({ audience: 'member', user_id: person.id }) },
                                                        `${name} can now reach this node`,
                                                    )}
                                                >
                                                    {busy === person.id
                                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                                        : <Plus className="h-4 w-4" />}
                                                </Button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </section>

                        {orgShare ? (
                            <p className="flex items-start gap-2 px-1 text-[11px] leading-snug text-muted-foreground">
                                <Users className="mt-px h-3.5 w-3.5 shrink-0" />
                                Shared with the whole workspace, so naming people individually adds nothing until
                                you turn that off.
                            </p>
                        ) : null}

                        {!orgShare && memberShares.length === 0 && candidates.length > 0 ? (
                            <p className="flex items-start gap-2 px-1 text-[11px] leading-snug text-muted-foreground">
                                <Check className="mt-px h-3.5 w-3.5 shrink-0" />
                                This node is private to you.
                            </p>
                        ) : null}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
