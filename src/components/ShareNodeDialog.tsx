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
 * **Sharing is one click; narrowing it is a second one.** A new share is every
 * service, no expiry, because that is what somebody who clicked a plus next to a
 * colleague's name meant. The scope line under each share is what makes the
 * narrower thing possible without making the common thing a form — click it and
 * the row becomes an editor for which services it opens and when it ends. Both
 * are the same POST, so a share is only ever one row.
 *
 * This replaced a mockup that offered share links, per-share expiry and
 * permission levels against no API at all. Two of those three now exist and are
 * wired; the link is still absent, and still deliberately.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Check, ChevronDown, Clock, Loader2, Plus, Users, X } from 'lucide-react';
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
import {
    SHAREABLE_SERVICES,
    type NodeShare,
    type ShareCandidate,
    type ShareableService,
    type SharesResponse,
} from '@/types/share';

/**
 * How long a share may run, as offers rather than a date picker.
 *
 * A calendar would let somebody pick a Tuesday in 2031, which is an expiry that
 * exists to satisfy a policy rather than to end anything. These are the
 * durations people actually mean, and the value is computed at submit time so a
 * dialog left open overnight does not post yesterday's deadline.
 */
const EXPIRY_CHOICES: readonly { label: string; hours: number | null }[] = [
    { label: 'No expiry', hours: null },
    { label: '24 hours', hours: 24 },
    { label: '7 days', hours: 24 * 7 },
    { label: '30 days', hours: 24 * 30 },
    { label: '90 days', hours: 24 * 90 },
];

/**
 * The identity of a share *and* its scope, so a saved change remounts the editor
 * that made it. See `ShareScope`.
 */
function scopeKey(share: NodeShare): string {
    return `${share.id}:${(share.services ?? []).join(',')}:${share.expires_at ?? ''}`;
}

/** What a share opens, in the fewest words that are still true. */
function servicesLabel(services: ShareableService[]): string {
    if (!services || services.length === 0) return 'Every service';
    return services.join(', ');
}

/**
 * When a share ends, in the reader's locale.
 *
 * Deliberately a date and not a countdown: "in 3 days" is friendlier and is
 * exactly the wrong thing here, because somebody auditing who can reach a
 * machine wants a date they can compare against a change they remember making.
 */
function expiryLabel(expiresAt: string | null): string {
    if (!expiresAt) return 'No expiry';

    const at = new Date(expiresAt);
    if (Number.isNaN(at.getTime())) return 'No expiry';

    return `Until ${at.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

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

/**
 * The scope line under a share, and the editor it opens into.
 *
 * Collapsed it is a sentence — "Every service · No expiry" — because the common
 * case is a share nobody narrowed and the common case should read, not click.
 * Expanded it is the two controls that change it, and `Save` posts the same
 * `POST /shares` that made the share: the route rewrites the one live row rather
 * than adding a second, so editing and sharing are genuinely one operation.
 *
 * `available` is the services this node actually exposes. Offering RDP on a
 * machine that runs none would be offering a permission over nothing, and
 * somebody would reasonably read it as the node having an RDP service.
 *
 * **Remounted on every change to the share it edits**, via a `key` at the call
 * site that includes the stored scope. The draft state has to be discarded when
 * a save lands, because the response is authoritative and can disagree with what
 * was typed — ticking every service stores the empty array, which reads back as
 * "every service" rather than as the four names. Letting React throw the
 * component away says that in one line, where an effect that reset state would
 * say it in five and cascade a render doing it.
 */
function ShareScope({
    share,
    available,
    disabled,
    onSave,
}: {
    share: NodeShare;
    available: readonly ShareableService[];
    disabled: boolean;
    onSave: (services: ShareableService[], expiresAt: string | null) => void;
}) {
    const [open, setOpen] = useState(false);
    const [services, setServices] = useState<ShareableService[]>(share.services ?? []);
    const [hours, setHours] = useState<number | null>(null);

    const toggle = (service: ShareableService) => {
        setServices((current) => {
            // Empty means every service, so the first click has to start from
            // "all of them" and remove one — not from nothing and add one, which
            // would read as un-ticking a box and getting the opposite.
            const base = current.length === 0 ? [...available] : current;
            return base.includes(service)
                ? base.filter((entry) => entry !== service)
                : available.filter((entry) => base.includes(entry) || entry === service);
        });
    };

    const chosen = services.length === 0 ? available : services;

    const save = () => {
        const expiresAt = hours === null
            // Computed here rather than when the choice was made, so a dialog
            // left open overnight does not post a deadline that has passed.
            ? null
            : new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

        onSave(services, expiresAt);
        setOpen(false);
    };

    if (!open) {
        return (
            <button
                type="button"
                className="mt-0.5 flex items-center gap-1 truncate text-[11px] leading-tight text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setOpen(true)}
                disabled={disabled}
            >
                <span className="truncate">{servicesLabel(share.services)}</span>
                <span aria-hidden>·</span>
                <span className="truncate">{expiryLabel(share.expires_at)}</span>
                <ChevronDown className="h-3 w-3 shrink-0" />
            </button>
        );
    }

    return (
        <div className="mt-2 space-y-2 rounded-[8px] border border-hairline bg-white/[0.02] p-2">
            <div className="flex flex-wrap gap-1">
                {available.map((service) => (
                    <button
                        key={service}
                        type="button"
                        disabled={disabled}
                        onClick={() => toggle(service)}
                        className={cn(
                            'rounded-full px-2 py-0.5 text-[11px] ring-1 transition-colors',
                            chosen.includes(service)
                                ? 'bg-white/[0.12] text-foreground ring-hairline'
                                : 'text-muted-foreground ring-transparent hover:text-foreground',
                        )}
                        aria-pressed={chosen.includes(service)}
                    >
                        {service}
                    </button>
                ))}
            </div>

            <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <select
                    className="flex-1 rounded-[6px] border border-hairline bg-transparent px-1.5 py-1 text-[11px] text-foreground outline-none"
                    value={hours === null ? '' : String(hours)}
                    disabled={disabled}
                    onChange={(event) => setHours(event.target.value === '' ? null : Number(event.target.value))}
                >
                    {EXPIRY_CHOICES.map((choice) => (
                        <option key={choice.label} value={choice.hours === null ? '' : String(choice.hours)}>
                            {choice.label}
                        </option>
                    ))}
                </select>
            </div>

            <div className="flex justify-end gap-1">
                <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => setOpen(false)}>
                    Cancel
                </Button>
                <Button size="sm" className="h-7 text-[11px]" disabled={disabled} onClick={save}>
                    Save
                </Button>
            </div>
        </div>
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

    /*
     * Only the services this machine actually runs are offered.
     *
     * `node.services` is a count per kind, built from the node's own settings,
     * so a box with no RDP simply has no RDP key. Offering it anyway would be
     * offering a permission over nothing — and worse, would read as a claim that
     * the node has an RDP service.
     *
     * A node whose services have not loaded yet falls back to the full list
     * rather than to none: an empty set of chips would look like a machine that
     * exposes nothing, which is a stronger and less likely statement than "we do
     * not know yet".
     */
    const available = useMemo<readonly ShareableService[]>(() => {
        const counts = node?.services;
        if (!counts) return SHAREABLE_SERVICES;

        const present = SHAREABLE_SERVICES.filter((service) => (counts[service] ?? 0) > 0);
        return present.length > 0 ? present : SHAREABLE_SERVICES;
    }, [node?.services]);

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

    /**
     * Rewrite one share's scope.
     *
     * The same POST that created it — the route's `ON CONFLICT … DO UPDATE`
     * rewrites the live row — so a narrowed share is the same grant with a
     * smaller reach rather than a new one beside the old.
     */
    const saveScope = useCallback((share: NodeShare, services: ShareableService[], expiresAt: string | null) => {
        if (!nodeId) return;

        void mutate(
            share.id,
            `/api/nodes/${nodeId}/shares`,
            {
                method: 'POST',
                body: JSON.stringify({
                    audience: share.audience,
                    user_id: share.grantee_id,
                    services,
                    expires_at: expiresAt,
                }),
            },
            'Access updated',
        );
    }, [nodeId, mutate]);

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
                        People you share with can open sessions and see this node&apos;s monitors. Choose which
                        services each share opens, and when it ends. Only you can rename this node, delete it,
                        or change its services.
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
                            <div className="flex items-start gap-3 px-3 py-3">
                                <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-[13px] leading-tight text-foreground">
                                        Everyone in {workspaceName}
                                    </p>
                                    {orgShare ? (
                                        <ShareScope
                                            key={scopeKey(orgShare)}
                                            share={orgShare}
                                            available={available}
                                            disabled={busy !== null}
                                            onSave={(services, expiresAt) => saveScope(orgShare, services, expiresAt)}
                                        />
                                    ) : (
                                        <p className="mt-0.5 truncate text-[11px] leading-tight text-muted-foreground">
                                            Members reach only their own nodes
                                        </p>
                                    )}
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
                                                    'flex items-start gap-3 px-3 py-2.5',
                                                    index > 0 && 'border-t border-hairline',
                                                )}
                                            >
                                                <Monogram label={initials(name)} url={share.grantee_avatar_url} />
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-[13px] leading-tight text-foreground">{name}</p>
                                                    <ShareScope
                                                        key={scopeKey(share)}
                                                        share={share}
                                                        available={available}
                                                        disabled={busy !== null}
                                                        onSave={(services, expiresAt) => saveScope(share, services, expiresAt)}
                                                    />
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
