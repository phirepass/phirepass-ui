'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, Users } from 'lucide-react';
import { toast } from 'sonner';

import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { SearchBar } from '@/components/SearchBar';
import { Button } from '@/components/ui/button';
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
import {
    ROLE_DESCRIPTIONS,
    ROLE_LABELS,
    ROLE_ORDER,
    can,
    canActOnMember,
    canGrantRole,
    type Role,
} from '@/lib/rbac';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import type { OrgMember } from '@/types/org';

import { InviteUserDialog } from './InviteUserDialog';
import { MemberDetailDialog } from './MemberDetailDialog';
import { MemberRow } from './MemberRow';
import {
    MembersApiError,
    changeRole,
    fetchMembers,
    inviteMember,
    removeMember,
    revokeInvitation,
    setSuspended,
    type MembersResponse,
} from './members-api';
import { displayName, isUnhardenedPrivilege } from './member-display';

/**
 * Grouped, not filtered.
 *
 * A status filter answers "show me the suspended ones". The question somebody
 * opens this page with is "who can reach my machines" — and the answer is the
 * first group, always on screen, without pressing anything. Invitations and
 * suspended accounts stay visible below rather than hidden behind a chip nobody
 * presses.
 */
const GROUPS = [
    {
        id: 'privileged',
        title: 'Full access',
        hint: 'Reaches every node in this workspace',
    },
    {
        id: 'members',
        title: 'Members',
        hint: 'Reaches only their own nodes',
    },
    {
        id: 'invited',
        title: 'Invited',
        hint: 'Joins when they sign in with the invited address',
    },
    {
        id: 'suspended',
        title: 'Suspended',
        hint: 'Signed out of the API until reinstated',
    },
] as const;

type GroupId = (typeof GROUPS)[number]['id'];

export default function UsersPage() {
    const session = useSession();
    const role = session.role ?? 'member';
    const canManage = can(role, 'users:manage');
    const canInvite = can(role, 'users:invite');

    const [data, setData] = useState<MembersResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    const [detailId, setDetailId] = useState<string | null>(null);
    const [inviteOpen, setInviteOpen] = useState(false);
    const [roleTarget, setRoleTarget] = useState<OrgMember | null>(null);
    const [pendingRole, setPendingRole] = useState<Role>('member');
    const [removeTarget, setRemoveTarget] = useState<OrgMember | null>(null);

    /**
     * Bumped to ask for the list again — on mount, and from "Try again".
     *
     * The fetch lives in the effect rather than in a function the effect calls,
     * so no state is set synchronously in the effect body, and the `cancelled`
     * flag means a reload that lands after an unmount is dropped instead of
     * warning.
     */
    const [reloadNonce, setReloadNonce] = useState(0);
    const reload = useCallback(() => setReloadNonce((value) => value + 1), []);

    useEffect(() => {
        let cancelled = false;

        fetchMembers()
            .then((next) => {
                if (cancelled) return;
                setData(next);
                setError(null);
            })
            .catch((e: unknown) => {
                if (cancelled) return;
                setError(e instanceof MembersApiError ? e.message : 'Could not load the member list');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => { cancelled = true; };
    }, [reloadNonce]);

    const members = useMemo(() => data?.members ?? [], [data]);
    const selfId = data?.self_id ?? session.userId;

    const ownerCount = useMemo(
        () => members.filter((m) => m.kind === 'member' && m.role === 'owner' && m.status === 'active').length,
        [members],
    );

    const grouped = useMemo(() => {
        const needle = searchQuery.trim().toLowerCase();

        const matches = members.filter((member) => {
            if (!needle) return true;
            return member.email.toLowerCase().includes(needle)
                || (member.username ?? '').toLowerCase().includes(needle)
                || ROLE_LABELS[member.role].toLowerCase().includes(needle);
        });

        const buckets: Record<GroupId, OrgMember[]> = {
            privileged: [], members: [], invited: [], suspended: [],
        };

        for (const member of matches) {
            if (member.kind === 'invitation') buckets.invited.push(member);
            else if (member.status === 'suspended') buckets.suspended.push(member);
            else if (member.role === 'member') buckets.members.push(member);
            else buckets.privileged.push(member);
        }

        for (const key of Object.keys(buckets) as GroupId[]) {
            buckets[key].sort((a, b) => {
                const delta = ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
                if (delta !== 0) return delta;
                return displayName(a).localeCompare(displayName(b));
            });
        }

        return { buckets, total: matches.length };
    }, [members, searchQuery]);

    const detailMember = detailId ? members.find((m) => m.id === detailId) ?? null : null;

    /**
     * Every mutation goes through here: one busy row, one refreshed list, one
     * place errors become a toast. The route answers with the whole list, so
     * nothing is patched locally and the page cannot drift from the database.
     */
    const mutate = useCallback(async (
        id: string,
        action: () => Promise<{ members: OrgMember[] }>,
        onSuccess: () => void,
    ) => {
        setBusyId(id);
        try {
            const result = await action();
            setData((current) => (current ? { ...current, members: result.members } : current));
            onSuccess();
            // A role change can change the *caller's* role — a transfer demotes
            // them to admin — and `useCurrentRole` reads a cached profile. Ask
            // for it again so the buttons match what the API will now allow.
            window.dispatchEvent(new Event('phirepass:session-changed'));
        } catch (e) {
            toast.error(e instanceof MembersApiError ? e.message : 'Something went wrong');
        } finally {
            setBusyId(null);
        }
    }, []);

    const applyRole = () => {
        const target = roleTarget;
        if (!target) return;
        setRoleTarget(null);

        void mutate(
            target.id,
            () => changeRole(target.id, pendingRole),
            () => toast.success(
                pendingRole === 'owner'
                    ? `${displayName(target)} now owns this workspace — you are an admin`
                    : `${displayName(target)} is now ${ROLE_LABELS[pendingRole].toLowerCase()}`,
            ),
        );
    };

    const toggleSuspend = (member: OrgMember) => {
        const reinstating = member.status === 'suspended';
        void mutate(
            member.id,
            () => setSuspended(member.id, !reinstating),
            () => toast.success(reinstating
                ? `${displayName(member)} can use the workspace again`
                : `${displayName(member)} is suspended — their next request is refused`),
        );
    };

    const confirmRemove = () => {
        const target = removeTarget;
        if (!target) return;
        setRemoveTarget(null);

        void mutate(
            target.id,
            async () => {
                const result = await removeMember(target.id);
                const held = result.removed.nodes + result.removed.tokens;
                toast.success(
                    `${displayName(target)} was removed`,
                    held > 0
                        ? { description: `Their ${result.removed.nodes} node(s) and ${result.removed.tokens} token(s) stay in this workspace.` }
                        : undefined,
                );
                return result;
            },
            () => undefined,
        );
    };

    const withdraw = (member: OrgMember) => {
        void mutate(
            member.id,
            () => revokeInvitation(member.id),
            () => toast.success(`Invitation to ${member.email} withdrawn`),
        );
    };

    const invite = async (email: string, inviteRole: Role): Promise<boolean> => {
        try {
            const result = await inviteMember(email, inviteRole);
            setData((current) => (current ? { ...current, members: result.members } : current));
            setInviteOpen(false);

            toast.success(`${email} was invited`, {
                description: result.delivery.sent
                    ? 'They join as soon as they sign in with that address.'
                    // Delivery is best-effort by design: the invitation exists
                    // and is claimable either way, so saying so beats a red
                    // error on a thing that worked.
                    : `The email could not be sent (${result.delivery.reason}) — they can still join by signing in with that address.`,
            });
            return true;
        } catch (e) {
            toast.error(e instanceof MembersApiError ? e.message : 'Could not send the invitation');
            return false;
        }
    };

    const inviteButton = canInvite ? (
        <Button size="sm" className="gap-2 rounded-full" onClick={() => setInviteOpen(true)}>
            <Plus className="h-4 w-4" />
            Invite
        </Button>
    ) : null;

    /**
     * One quiet line instead of a row of stat tiles.
     *
     * The two numbers that matter are how many people reach everything, and how
     * many of those have no second factor. Four boxes of counts would say less
     * and take four times the room.
     */
    const posture = useMemo(() => {
        const privileged = members.filter(
            (m) => m.kind === 'member' && m.status === 'active' && m.role !== 'member',
        ).length;
        const exposed = members.filter(isUnhardenedPrivilege).length;

        const parts = [
            `${privileged} ${privileged === 1 ? 'person reaches' : 'people reach'} every node`,
        ];
        if (exposed > 0) parts.push(`${exposed} without a second factor`);
        if (ownerCount === 1) parts.push('one owner — if that account is lost, nobody can restore access');

        return { parts, warn: exposed > 0 || ownerCount === 1 };
    }, [members, ownerCount]);

    return (
        <div className="container mx-auto max-w-4xl space-y-6 px-4 py-8">
            <PageHeader
                title="Members"
                description={data?.org
                    ? `Who is in ${data.org.name}, and what they can reach.`
                    : 'Who is in this workspace, and what they can reach.'}
                actions={inviteButton}
            />

            {loading ? (
                <div className="py-16 text-center text-sm text-muted-foreground">Loading members...</div>
            ) : error ? (
                <EmptyState
                    icon={Users}
                    title="Could not load the member list"
                    description={error}
                    action={<Button variant="outline" className="rounded-full" onClick={reload}>Try again</Button>}
                />
            ) : (
                <>
                    <p className={cn(
                        '-mt-2 flex items-start gap-2 text-[11.5px] leading-relaxed',
                        posture.warn ? 'text-muted-foreground' : 'text-muted-foreground/70',
                    )}>
                        <span
                            aria-hidden
                            className={cn(
                                'mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full',
                                posture.warn ? 'bg-warning' : 'bg-success',
                            )}
                        />
                        <span>{posture.parts.join(' · ')}</span>
                    </p>

                    <SearchBar
                        value={searchQuery}
                        onChange={setSearchQuery}
                        placeholder="Search by name, address, or role"
                        aria-label="Search members"
                    >
                        <span className="text-[12px] tabular-nums text-muted-foreground/70">
                            {searchQuery.trim()
                                ? `${grouped.total} of ${members.length} match`
                                : `${members.length} ${members.length === 1 ? 'person' : 'people'}`}
                        </span>
                    </SearchBar>

                    {grouped.total === 0 ? (
                        <EmptyState
                            icon={searchQuery.trim() ? Search : Users}
                            title={searchQuery.trim() ? 'Nobody matches this search' : 'You are on your own here'}
                            description={searchQuery.trim()
                                ? 'Try a different term, or clear the box to see everyone again.'
                                : 'Invite somebody and they join the moment they sign in with the address you used.'}
                            action={searchQuery.trim() ? null : inviteButton}
                        />
                    ) : (
                        GROUPS.map((group) => {
                            const entries = grouped.buckets[group.id];
                            if (entries.length === 0) return null;

                            return (
                                <section key={group.id}>
                                    <div className="mb-2.5 flex items-center gap-2.5 px-1">
                                        <h2 className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground/80">
                                            {group.title}
                                        </h2>
                                        <span className="rounded-full bg-white/[0.06] px-1.5 py-px text-[10px] font-medium tabular-nums text-muted-foreground/70">
                                            {entries.length}
                                        </span>
                                        <span className="hidden text-[11px] text-muted-foreground/50 sm:inline">
                                            {group.hint}
                                        </span>
                                        <span aria-hidden className="h-px flex-1 bg-hairline" />
                                    </div>

                                    {/* One container, hairline dividers — the group
                                        is the object, not each person inside it. */}
                                    <div className="gradient-card mac-squircle divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline">
                                        {entries.map((member) => (
                                            <MemberRow
                                                key={member.id}
                                                member={member}
                                                isSelf={member.kind === 'member' && member.id === selfId}
                                                canManage={canManage}
                                                canInvite={canInvite}
                                                canActOnThis={canActOnMember(
                                                    role,
                                                    member.role,
                                                    member.kind === 'member' && member.id === selfId,
                                                )}
                                                isLastOwner={member.role === 'owner' && ownerCount <= 1}
                                                busy={busyId === member.id}
                                                onOpen={(target) => setDetailId(target.id)}
                                                onChangeRole={(target) => {
                                                    setRoleTarget(target);
                                                    setPendingRole(target.role);
                                                }}
                                                onToggleSuspend={toggleSuspend}
                                                onRevokeInvitation={withdraw}
                                                onRemove={(target) => setRemoveTarget(target)}
                                            />
                                        ))}
                                    </div>
                                </section>
                            );
                        })
                    )}
                </>
            )}

            <InviteUserDialog
                open={inviteOpen}
                onOpenChange={setInviteOpen}
                onSubmit={invite}
                existingEmails={members.map((member) => member.email)}
                actorRole={role}
            />

            <MemberDetailDialog member={detailMember} onClose={() => setDetailId(null)} />

            <AlertDialog open={!!roleTarget} onOpenChange={(open) => !open && setRoleTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Change role</AlertDialogTitle>
                        <AlertDialogDescription>
                            {roleTarget ? `${displayName(roleTarget)} (${roleTarget.email})` : ''}
                        </AlertDialogDescription>
                    </AlertDialogHeader>

                    <div className="space-y-2">
                        <Select value={pendingRole} onValueChange={(value) => setPendingRole(value as Role)}>
                            <SelectTrigger aria-label="Role">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {(['owner', 'admin', 'member'] as Role[])
                                    .filter((option) => canGrantRole(role, option))
                                    .map((option) => (
                                        <SelectItem key={option} value={option}>
                                            {ROLE_LABELS[option]}
                                        </SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[pendingRole]}</p>

                        {/* Making somebody else the owner steps you down in the
                            same statement. Saying so before the click is the
                            difference between a transfer and a surprise. */}
                        {pendingRole === 'owner' ? (
                            <p className="rounded-lg border border-warning/35 bg-warning/10 px-3 py-2 text-xs text-warning">
                                Ownership transfers. You become an admin, and only they can hand it back.
                            </p>
                        ) : null}
                    </div>

                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={applyRole}>Apply</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remove from this workspace?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {removeTarget
                                ? `${displayName(removeTarget)} loses access on their next request. Their ${removeTarget.nodes_count} node(s) and ${removeTarget.tokens_count} token(s) stay here — they belong to the workspace, not to them.`
                                : ''}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmRemove}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Remove
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
