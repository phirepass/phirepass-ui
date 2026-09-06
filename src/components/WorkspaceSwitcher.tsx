'use client';

/**
 * Which workspace the dashboard is showing, and how to move to another one.
 *
 * An account can belong to several organisations — its own, plus every one it
 * has been invited into — but `users.primary_org_id` names exactly one, and
 * every request resolves against that (`readMembership`, `src/app/lib/authz.ts`).
 * Without a control for it, a membership gained by accepting an invitation is
 * real in the database and invisible in the product: the dashboard looks
 * identical the day after you join a team. This is that control.
 *
 * Hidden for the ordinary account that belongs to one workspace. A picker with
 * a single entry is a piece of furniture that never answers a question, and the
 * toolbar is not long enough to carry one.
 */

import { useCallback, useEffect, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import { ROLE_STYLES } from '@/components/users/member-display';
import type { Membership } from '@/types/org';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * One fetch per browser session, shared by the two variants below.
 *
 * The toolbar switcher and the mobile one are both mounted on every dashboard
 * page — one of them merely hidden by a media query — so an unshared fetch here
 * is two identical requests on every load. The in-flight promise is held as well
 * as the result, because both mount in the same tick and a result-only cache
 * would still let them both start.
 */
let cached: Membership[] | null = null;
let inflight: Promise<Membership[]> | null = null;

function loadWorkspaces(): Promise<Membership[]> {
    if (cached) return Promise.resolve(cached);
    if (inflight) return inflight;

    inflight = fetch('/api/org/workspaces', { credentials: 'include' })
        .then(async (res) => {
            if (!res.ok) throw new Error('Failed to load workspaces');
            const body = await res.json() as { workspaces?: Membership[] };
            cached = body.workspaces ?? [];
            return cached;
        })
        .finally(() => {
            inflight = null;
        });

    return inflight;
}

function invalidateWorkspaces() {
    cached = null;
}

/** "Personal" or a member count — what tells two similarly named workspaces apart. */
function describe(entry: Membership): string {
    if (entry.status === 'suspended') return 'Access suspended';
    if (entry.org.personal) return 'Personal workspace';
    return entry.member_count === 1 ? '1 member' : `${entry.member_count} members`;
}

function monogram(name: string): string {
    return name.trim().charAt(0).toUpperCase() || '?';
}

interface WorkspaceSwitcherProps {
    /** The id of the workspace this session is in, from `/api/profile`. */
    currentOrgId: string | null;
    /**
     * `toolbar` is the macOS pop-up button in the desktop header. `inline` is a
     * plain list for the mobile sheet, which is painted above the menu layer —
     * a portalled dropdown would open behind it.
     */
    variant?: 'toolbar' | 'inline';
    /** The mobile sheet closes itself once a switch is under way. */
    onSwitch?: () => void;
}

export function WorkspaceSwitcher({ currentOrgId, variant = 'toolbar', onSwitch }: WorkspaceSwitcherProps) {
    const [workspaces, setWorkspaces] = useState<Membership[]>(cached ?? []);
    const [pendingId, setPendingId] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;

        const load = () => {
            loadWorkspaces()
                .then((list) => { if (alive) setWorkspaces(list); })
                .catch(() => { /* A switcher that cannot load is a switcher that is not there. */ });
        };

        load();

        // A role change elsewhere (a transfer of ownership on the members page)
        // is published as this event, and the role is on screen here too.
        const onSessionChanged = () => { invalidateWorkspaces(); load(); };
        window.addEventListener('phirepass:session-changed', onSessionChanged);

        return () => {
            alive = false;
            window.removeEventListener('phirepass:session-changed', onSessionChanged);
        };
    }, []);

    const switchTo = useCallback(async (entry: Membership) => {
        if (entry.org.id === currentOrgId || entry.status === 'suspended') return;

        setPendingId(entry.org.id);

        try {
            const res = await fetch('/api/org/workspaces', {
                method: 'PATCH',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ org_id: entry.org.id }),
            });

            if (!res.ok) {
                const body = await res.json().catch(() => null) as { error?: string } | null;
                throw new Error(body?.error || 'Could not switch workspace');
            }

            invalidateWorkspaces();
            onSwitch?.();

            /**
             * A full load of the default page, not a client-side refresh.
             *
             * Every list, count and permission on screen belongs to the
             * workspace being left, and there is no store to invalidate
             * centrally — pages fetch in their own effects, so `router.refresh()`
             * would leave a mounted list showing the old organisation's nodes.
             * Landing on `/dashboard/nodes` also avoids the sharper version of
             * the same problem: staying on a detail route for a node the new
             * workspace cannot see.
             */
            window.location.assign('/dashboard/nodes');
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not switch workspace');
            setPendingId(null);
        }
    }, [currentOrgId, onSwitch]);

    // One workspace is the ordinary case and needs no control; zero means the
    // list has not arrived (or failed), and an empty popup is worse than none.
    if (workspaces.length < 2) return null;

    const current = workspaces.find((entry) => entry.org.id === currentOrgId) ?? workspaces[0];

    const rows = workspaces.map((entry) => {
        const isCurrent = entry.org.id === current.org.id;
        const suspended = entry.status === 'suspended';

        return (
            <button
                key={entry.org.id}
                type="button"
                role="menuitemradio"
                aria-checked={isCurrent}
                disabled={suspended || pendingId !== null}
                onClick={() => switchTo(entry)}
                className={cn(
                    'flex w-full items-center gap-2.5 rounded-[6px] px-2 py-1.5 text-left transition-colors duration-150 ease-mac',
                    'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/45',
                    suspended ? 'cursor-default opacity-55' : 'hover:bg-white/[0.06]',
                    pendingId === entry.org.id && 'opacity-60',
                )}
            >
                <Check className={cn('h-3.5 w-3.5 shrink-0 text-accent', !isCurrent && 'invisible')} />
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] bg-white/[0.07] text-[11px] font-semibold text-foreground ring-1 ring-hairline">
                    {monogram(entry.org.name)}
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] leading-tight tracking-[-0.01em] text-foreground">
                        {entry.org.name}
                    </span>
                    <span className={cn(
                        'block truncate text-[11px] leading-tight',
                        suspended ? 'text-destructive' : 'text-muted-foreground',
                    )}>
                        {describe(entry)}
                    </span>
                </span>
                <span className={cn('shrink-0 text-[11px] capitalize', ROLE_STYLES[entry.role])}>
                    {entry.role}
                </span>
            </button>
        );
    });

    if (variant === 'inline') {
        return (
            <div className="my-2 border-t border-hairline pt-3">
                <p className="px-2 pb-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                    Workspace
                </p>
                {/* One rounded container with hairline dividers, rather than a
                    card per row: the rows are one list, and macOS draws a list
                    that way. */}
                <div className="overflow-hidden rounded-[10px] border border-hairline bg-white/[0.03] mac-squircle [&>button]:rounded-none [&>button+button]:border-t [&>button+button]:border-hairline [&>button]:px-3 [&>button]:py-2.5">
                    {rows}
                </div>
            </div>
        );
    }

    return (
        // The separator belongs to the switcher, not to the header: it marks
        // this control off from the wordmark, and an account with one workspace
        // must not be left with a hairline floating beside the logo.
        <div className="flex items-center gap-3">
            <div className="h-6 w-px bg-hairline" />
            <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    aria-label={`Workspace: ${current.org.name}`}
                    className={cn(
                        'flex h-9 max-w-[13rem] items-center gap-2 rounded-[8px] border border-hairline bg-[image:var(--fill-control)] px-2 pr-1.5 shadow-control mac-squircle',
                        'transition-[background-color,box-shadow] duration-150 ease-mac hover:bg-white/[0.06]',
                        'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/45',
                    )}
                >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] bg-white/[0.07] text-[10px] font-semibold ring-1 ring-hairline">
                        {monogram(current.org.name)}
                    </span>
                    <span className="truncate text-[13px] font-medium tracking-[-0.01em] text-foreground">
                        {current.org.name}
                    </span>
                    <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[17rem] p-1.5">
                <DropdownMenuLabel className="px-2 pb-1 pt-0.5 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                    Workspaces
                </DropdownMenuLabel>
                {/* The rows are plain buttons rather than DropdownMenuItem: a
                    radio row that stays put while its request is in flight is
                    not a menu item that dismisses on click. */}
                <div className="space-y-px">{rows}</div>
            </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
