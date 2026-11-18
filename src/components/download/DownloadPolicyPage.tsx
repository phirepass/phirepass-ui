'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
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
import { can } from '@/lib/rbac';
import { useCurrentOrg, useCurrentRole, useCurrentUserId } from '@/lib/session';
import { cn } from '@/lib/utils';

import { OrgDownloadSettingsCard } from './OrgDownloadSettings';
import { POLICY_LABELS, describePolicyRow, needsConfirmation, type Policy, type PolicyRow } from './policy-display';

const POLICIES: Policy[] = ['allowed', 'links_only', 'blocked'];

/**
 * Organisation → Downloads (screen L1): which of the organisation's nodes may
 * download. A ceiling over each node's own switches, for owners and admins.
 * One rounded list, a segmented control per node.
 */
export default function DownloadPolicyPage() {
    const role = useCurrentRole();
    const org = useCurrentOrg();
    const me = useCurrentUserId();
    const allowed = can(role, 'nodes:manage:all');

    const [rows, setRows] = useState<PolicyRow[] | null>(null);
    const [available, setAvailable] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    const [asking, setAsking] = useState<{ row: PolicyRow; next: Policy } | null>(null);

    useEffect(() => {
        if (!allowed) return;
        let disposed = false;
        fetch('/api/nodes/download-policy').then(async (res) => {
            if (!res.ok) throw new Error(`Could not load nodes (${res.status}).`);
            const data = await res.json() as { nodes: PolicyRow[]; available: boolean };
            if (disposed) return;
            setRows(data.nodes);
            setAvailable(data.available);
        }).catch((e: unknown) => {
            if (!disposed) toast.error(e instanceof Error ? e.message : 'Could not load nodes.');
        });
        return () => {
            disposed = true;
        };
    }, [allowed]);

    const save = async (row: PolicyRow, next: Policy) => {
        setSaving(row.id);
        try {
            const res = await fetch('/api/nodes/download-policy', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ node_id: row.id, policy: next }),
            });
            const data = await res.json().catch(() => ({})) as { error?: string };
            if (!res.ok) throw new Error(data.error ?? `Could not save (${res.status}).`);
            setRows((current) => current?.map((r) => r.id === row.id
                ? {
                    ...r,
                    policy: next,
                    changed_at: new Date().toISOString(),
                    changed_by: me,
                    downloads_on: next === 'blocked' ? false : r.downloads_on,
                }
                : r) ?? null);
            if (next !== 'allowed' && row.running > 0) {
                toast.success('Saved. Running downloads stop within half a minute; their partial files are kept.');
            }
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not save.');
        } finally {
            setSaving(null);
        }
    };

    const choose = (row: PolicyRow, next: Policy) => {
        if (next === row.policy) return;
        if (needsConfirmation(row, next)) setAsking({ row, next });
        else void save(row, next);
    };

    return (
        <div className="container mx-auto max-w-3xl space-y-6 px-4 py-8">
            <Link href="/dashboard/downloads" className="-mb-2 inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
                <ChevronLeft className="h-3.5 w-3.5" />
                Downloads
            </Link>
            <PageHeader
                title="Downloads on your nodes"
                description={`Choose which nodes in ${org?.name ?? 'your organisation'} may download. A node's owner can turn Downloads on only where this allows it.`}
            />

            {!allowed ? (
                <EmptyState
                    icon={ShieldAlert}
                    title="Owners and admins only"
                    description="Ask an owner or admin of your organisation to change where downloads are allowed."
                />
            ) : rows === null ? (
                <div className="py-16 text-center text-sm text-muted-foreground">Loading nodes…</div>
            ) : !available ? (
                <EmptyState
                    icon={ShieldAlert}
                    title="Not set up yet"
                    description="This dashboard's database does not have the download tables yet. They are created when the dashboard next starts."
                />
            ) : (
                <OrgDownloadSettingsCard />
            )}

            {!allowed || rows === null || !available ? null : rows.length === 0 ? (
                <EmptyState icon={ShieldAlert} title="No nodes yet" description="Nodes enrolled into this organisation appear here." />
            ) : (
                <ul className="gradient-card mac-squircle divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline">
                    {rows.map((row) => (
                        <li key={row.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-[13px] font-medium text-foreground">{row.name || row.id.slice(0, 8)}</div>
                                <div className="truncate text-[11px] text-muted-foreground">{describePolicyRow(row, me)}</div>
                            </div>
                            <div role="radiogroup" aria-label={`Downloads on ${row.name ?? 'this node'}`}
                                className="inline-flex shrink-0 rounded-full bg-white/[0.05] p-0.5 ring-1 ring-hairline">
                                {POLICIES.map((policy) => (
                                    <button
                                        key={policy}
                                        type="button"
                                        role="radio"
                                        aria-checked={row.policy === policy}
                                        disabled={saving === row.id}
                                        onClick={() => choose(row, policy)}
                                        className={cn(
                                            'rounded-full px-3 py-1 text-[11px] transition-colors disabled:opacity-50',
                                            row.policy === policy
                                                ? policy === 'blocked'
                                                    ? 'bg-destructive/20 text-destructive'
                                                    : 'bg-white/[0.12] text-foreground'
                                                : 'text-muted-foreground hover:text-foreground',
                                        )}
                                    >
                                        {POLICY_LABELS[policy]}
                                    </button>
                                ))}
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            <AlertDialog open={asking !== null} onOpenChange={(open) => !open && setAsking(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {asking?.next === 'blocked' ? 'Block downloads' : 'Allow only links'} on {asking?.row.name ?? 'this node'}?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {asking?.row.running === 1 ? '1 download is running' : `${asking?.row.running ?? 0} downloads are running`}.{' '}
                            {asking?.next === 'blocked'
                                ? 'They stop within half a minute and people with access will not be able to start new ones.'
                                : 'Torrents among them stop within half a minute, seeding included; links keep going.'}{' '}
                            Partial files are kept, so they can be resumed if this is lifted.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => {
                            if (asking) void save(asking.row, asking.next);
                            setAsking(null);
                        }}>
                            {asking?.next === 'blocked' ? 'Block' : 'Allow only links'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
