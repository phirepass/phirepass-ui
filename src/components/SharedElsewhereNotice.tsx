'use client';

/**
 * Where the machines somebody lent you actually are.
 *
 * A share never crosses an organisation — the row carries `org_id`, and the read
 * predicate in `src/app/lib/scope.ts` matches it against the reader's own — so a
 * node shared with you is only ever visible from the workspace that owns it.
 * That is the correct rule and it is not what is changing here.
 *
 * What was missing is that an account signs in to **its own** workspace. Somebody
 * who is lent two machines in a colleague's workspace lands in their personal one,
 * sees an empty list, filters to "Shared with me", and is told *nobody has shared
 * a node with you* — which is false, and which no amount of looking at that page
 * could disprove. The share worked; there was nothing to say where it landed.
 *
 * So this is one line that says where, and a control that goes there. It is not a
 * second node list: showing another workspace's machines from inside this one is
 * exactly the boundary the whole model exists to hold.
 */

import { useEffect, useState } from 'react';
import { ArrowRight, Share2 } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import { cachedWorkspaces, loadWorkspaces, switchWorkspace } from '@/lib/workspaces';
import type { Membership } from '@/types/org';

interface SharedElsewhereNoticeProps {
    /** The workspace this session is in, from `/api/profile`. Null until it loads. */
    currentOrgId: string | null;
    className?: string;
}

function describe(entry: Membership): string {
    const count = entry.shared_node_count;
    const nodes = count === 1 ? '1 node is' : `${count} nodes are`;
    return `${nodes} shared with you in ${entry.org.name}`;
}

export function SharedElsewhereNotice({ currentOrgId, className }: SharedElsewhereNoticeProps) {
    const [workspaces, setWorkspaces] = useState<Membership[]>(cachedWorkspaces() ?? []);
    const [pendingId, setPendingId] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;

        loadWorkspaces()
            .then((list) => { if (alive) setWorkspaces(list); })
            .catch(() => { /* A notice that cannot load is a notice that is not there. */ });

        return () => { alive = false; };
    }, []);

    const elsewhere = workspaces.filter((entry) => (
        entry.org.id !== currentOrgId
        && entry.status === 'active'
        && entry.shared_node_count > 0
    ));

    if (elsewhere.length === 0) {
        return null;
    }

    return (
        // One rounded container with hairline dividers rather than a card per
        // row: these are one list, and that is how macOS draws one.
        <div className={cn(
            'overflow-hidden rounded-[10px] border border-hairline bg-white/[0.03] mac-squircle',
            className,
        )}>
            {elsewhere.map((entry, index) => (
                <div
                    key={entry.org.id}
                    className={cn(
                        'flex items-center gap-3 px-3.5 py-2.5',
                        index > 0 && 'border-t border-hairline',
                    )}
                >
                    <Share2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <p className="min-w-0 flex-1 truncate text-[13px] leading-tight tracking-[-0.01em] text-foreground">
                        {describe(entry)}
                    </p>
                    <button
                        type="button"
                        disabled={pendingId !== null}
                        onClick={() => {
                            setPendingId(entry.org.id);
                            switchWorkspace(entry.org.id).catch((e: unknown) => {
                                toast.error(e instanceof Error ? e.message : 'Could not switch workspace');
                                setPendingId(null);
                            });
                        }}
                        className={cn(
                            'flex shrink-0 items-center gap-1 rounded-[6px] px-2 py-1 text-[12px] font-medium text-accent',
                            'transition-colors duration-150 ease-mac hover:bg-white/[0.06]',
                            'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/45',
                            pendingId === entry.org.id && 'opacity-60',
                        )}
                    >
                        Open
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                </div>
            ))}
        </div>
    );
}
