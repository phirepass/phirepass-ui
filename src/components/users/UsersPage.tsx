'use client';

import { useEffect, useMemo, useState } from 'react';
import { Clock, Plus, ShieldAlert, ShieldCheck, UserCog, Users } from 'lucide-react';
import { toast } from 'sonner';

import { AlertStrip, type AlertEntry } from '@/components/AlertStrip';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { Pager } from '@/components/Pager';
import { FilterChips, SearchBar } from '@/components/SearchBar';
import { StatTiles } from '@/components/StatTiles';
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
import { ROLE_DESCRIPTIONS, ROLE_LABELS, can, useCurrentRole, type Role } from '@/lib/rbac';
import { createInvitedUser, createMockUsers } from '@/data/mockUsers';
import type { InviteUserInput, UserStatus, WorkspaceUser } from '@/types/user';

import { InviteUserDialog } from './InviteUserDialog';
import { UserDetailDialog } from './UserDetailDialog';
import { UserRow } from './UserRow';
import { displayName, isDormant } from './user-display';

const USERS_PER_PAGE = 8;
const FAKE_LATENCY_MS = 380;

/** The signed-in account, until there is a session to read it from. */
const CURRENT_USER_ID = 'usr-01';

type StatusFilter = 'all' | UserStatus;

export default function UsersPage() {
    const role = useCurrentRole();
    const canManage = can(role, 'users:manage');
    const canInvite = can(role, 'users:invite');

    const [users, setUsers] = useState<WorkspaceUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filter, setFilter] = useState<StatusFilter>('all');
    const [page, setPage] = useState(1);

    const [detailId, setDetailId] = useState<string | null>(null);
    const [inviteOpen, setInviteOpen] = useState(false);
    const [roleTarget, setRoleTarget] = useState<WorkspaceUser | null>(null);
    const [pendingRole, setPendingRole] = useState<Role>('member');
    const [removeTarget, setRemoveTarget] = useState<WorkspaceUser | null>(null);

    useEffect(() => {
        let disposed = false;

        const seed = async () => {
            await new Promise((resolve) => { setTimeout(resolve, FAKE_LATENCY_MS); });
            if (disposed) return;
            setUsers(createMockUsers());
            setLoading(false);
        };

        void seed();
        return () => { disposed = true; };
    }, []);

    const counts = useMemo(() => {
        const tally: Record<UserStatus, number> = { active: 0, invited: 0, suspended: 0 };
        for (const user of users) {
            tally[user.status] += 1;
        }
        return tally;
    }, [users]);

    const ownerCount = useMemo(
        () => users.filter((user) => user.role === 'owner').length,
        [users]
    );

    const alerts = useMemo<AlertEntry[]>(() => {
        const entries: AlertEntry[] = [];

        // An admin without a second factor is the account worth hardening first:
        // it can reach every node in the workspace.
        for (const user of users) {
            if (user.status === 'active' && !user.mfa_enabled && user.role !== 'member') {
                entries.push({
                    id: `mfa-${user.id}`,
                    level: 'warning',
                    title: `${displayName(user)} has no second factor`,
                    message: 'Privileged accounts should not rely on a single credential.',
                    tag: ROLE_LABELS[user.role],
                });
            }

            if (isDormant(user) && (user.nodes_count > 0 || user.tokens_count > 0)) {
                entries.push({
                    id: `dormant-${user.id}`,
                    level: 'warning',
                    title: `${displayName(user)} has been inactive for 90+ days`,
                    message: `Still holds ${user.nodes_count} node(s) and ${user.tokens_count} token(s).`,
                    tag: user.email,
                });
            }
        }

        if (ownerCount === 1) {
            entries.push({
                id: 'single-owner',
                level: 'warning',
                title: 'This workspace has a single owner',
                message: 'If that account is lost there is no one left who can restore access. Promote a second owner.',
                tag: 'owner',
            });
        }

        return entries;
    }, [users, ownerCount]);

    const filteredUsers = useMemo(() => {
        const needle = searchQuery.trim().toLowerCase();
        const roleOrder: Record<Role, number> = { owner: 0, admin: 1, member: 2 };

        return users
            .filter((user) => filter === 'all' || user.status === filter)
            .filter((user) => {
                if (!needle) return true;
                return (
                    user.email.toLowerCase().includes(needle)
                    || user.username.toLowerCase().includes(needle)
                    || (user.name ?? '').toLowerCase().includes(needle)
                    || ROLE_LABELS[user.role].toLowerCase().includes(needle)
                );
            })
            // Most privileged first, then alphabetical — the order an
            // administrator reads a member list in.
            .sort((a, b) => {
                const delta = roleOrder[a.role] - roleOrder[b.role];
                if (delta !== 0) return delta;
                return displayName(a).localeCompare(displayName(b));
            });
    }, [users, filter, searchQuery]);

    const pageCount = Math.max(1, Math.ceil(filteredUsers.length / USERS_PER_PAGE));
    const clampedPage = Math.min(page, pageCount);
    const pagedUsers = filteredUsers.slice(
        (clampedPage - 1) * USERS_PER_PAGE,
        clampedPage * USERS_PER_PAGE
    );

    const detailUser = detailId ? users.find((user) => user.id === detailId) ?? null : null;

    const invite = async (input: InviteUserInput): Promise<boolean> => {
        await new Promise((resolve) => { setTimeout(resolve, FAKE_LATENCY_MS); });
        setUsers((prev) => [createInvitedUser(input), ...prev]);
        setInviteOpen(false);
        toast.success(`Invitation sent to ${input.email}`);
        return true;
    };

    const applyRole = () => {
        if (!roleTarget) return;
        const target = roleTarget;
        setUsers((prev) => prev.map((user) => (
            user.id === target.id ? { ...user, role: pendingRole } : user
        )));
        setRoleTarget(null);
        toast.success(`${displayName(target)} is now ${ROLE_LABELS[pendingRole].toLowerCase()}`);
    };

    const toggleSuspend = (user: WorkspaceUser) => {
        const suspended = user.status === 'suspended';
        setUsers((prev) => prev.map((entry) => (
            entry.id === user.id ? { ...entry, status: suspended ? 'active' : 'suspended' } : entry
        )));
        toast.success(suspended
            ? `${displayName(user)} can sign in again`
            : `${displayName(user)} is suspended and their sessions are revoked`);
    };

    const remove = () => {
        if (!removeTarget) return;
        const target = removeTarget;
        setUsers((prev) => prev.filter((user) => user.id !== target.id));
        setRemoveTarget(null);
        toast.success(`${displayName(target)} was removed from the workspace`);
    };

    const inviteButton = canInvite ? (
        <Button size="sm" className="w-fit gap-2" onClick={() => setInviteOpen(true)}>
            <Plus className="h-4 w-4" />
            Invite User
        </Button>
    ) : null;

    return (
        <div className="container mx-auto space-y-6 px-4 py-6">
            <PageHeader
                title="Users"
                description="Who has access to this workspace, what they can do, and what they hold"
                badge={
                    <span className="rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-warning">
                        dev preview
                    </span>
                }
                actions={inviteButton}
            />

            <div className="flex items-start gap-3 rounded-lg border border-info/30 bg-info/10 px-4 py-3 text-sm text-info">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                    Administrative view. Roles shown here are not enforced yet — once RBAC ships this page
                    requires <span className="font-mono text-xs">users:read</span>, and changing an
                    account requires <span className="font-mono text-xs">users:manage</span>.
                </p>
            </div>

            <StatTiles
                tiles={[
                    { label: 'Users', value: users.length, icon: Users, tone: 'accent' },
                    { label: 'Active', value: counts.active, icon: ShieldCheck, tone: 'success' },
                    { label: 'Invited', value: counts.invited, icon: Clock, tone: 'info', hint: 'Not accepted yet' },
                    { label: 'Suspended', value: counts.suspended, icon: ShieldAlert, tone: 'danger' },
                ]}
            />

            {loading ? (
                <div className="py-12 text-center text-muted-foreground">
                    <p>Loading users...</p>
                </div>
            ) : (
                <>
                    <AlertStrip alerts={alerts} />

                    <SearchBar
                        value={searchQuery}
                        onChange={(value) => { setSearchQuery(value); setPage(1); }}
                        placeholder="Search users..."
                        aria-label="Search users by name, email, or role"
                    >
                        <FilterChips<StatusFilter>
                            label="Filter users by status"
                            value={filter}
                            onChange={(value) => { setFilter(value); setPage(1); }}
                            options={[
                                { value: 'all', label: 'All', count: users.length },
                                { value: 'active', label: 'Active', count: counts.active },
                                { value: 'invited', label: 'Invited', count: counts.invited },
                                { value: 'suspended', label: 'Suspended', count: counts.suspended },
                            ]}
                        />
                    </SearchBar>

                    {filteredUsers.length === 0 ? (
                        <EmptyState
                            icon={Users}
                            title={users.length === 0 ? 'No users yet' : 'No users match this view'}
                            description={
                                users.length === 0
                                    ? 'Invite someone and they pick their own sign-in method when they accept.'
                                    : 'Try a different search term or clear the status filter.'
                            }
                            action={users.length === 0 ? inviteButton : null}
                        />
                    ) : (
                        <>
                            <div className="flex flex-col gap-2">
                                {pagedUsers.map((user) => (
                                    <UserRow
                                        key={user.id}
                                        user={user}
                                        canManage={canManage}
                                        canInvite={canInvite}
                                        isSelf={user.id === CURRENT_USER_ID}
                                        isLastOwner={user.role === 'owner' && ownerCount === 1}
                                        onOpen={(target) => setDetailId(target.id)}
                                        onChangeRole={(target) => {
                                            setRoleTarget(target);
                                            setPendingRole(target.role);
                                        }}
                                        onToggleSuspend={toggleSuspend}
                                        onResendInvite={(target) => toast.success(
                                            `Invitation resent to ${target.email}`
                                        )}
                                        onRemove={(target) => setRemoveTarget(target)}
                                    />
                                ))}
                            </div>

                            <Pager page={clampedPage} pageCount={pageCount} onPageChange={setPage} />
                        </>
                    )}
                </>
            )}

            <InviteUserDialog
                open={inviteOpen}
                onOpenChange={setInviteOpen}
                onSubmit={invite}
                existingEmails={users.map((user) => user.email)}
            />

            <UserDetailDialog user={detailUser} onClose={() => setDetailId(null)} />

            {/* Role change */}
            <AlertDialog open={!!roleTarget} onOpenChange={(open) => !open && setRoleTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <UserCog className="h-4 w-4" />
                            Change role
                        </AlertDialogTitle>
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
                                {(['owner', 'admin', 'member'] as Role[]).map((option) => (
                                    <SelectItem key={option} value={option}>
                                        {ROLE_LABELS[option]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[pendingRole]}</p>
                    </div>

                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={applyRole}>Apply</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Removal */}
            <AlertDialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remove from workspace?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {removeTarget
                                ? `${displayName(removeTarget)} loses access immediately. Their ${removeTarget.nodes_count} node(s) and ${removeTarget.tokens_count} token(s) have to be reassigned or revoked.`
                                : ''}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={remove}
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
