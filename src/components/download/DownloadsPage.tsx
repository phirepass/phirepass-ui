'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Download, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { useDemoMode } from '@/components/DemoModeProvider';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { can } from '@/lib/rbac';
import { useCurrentRole } from '@/lib/session';

import { AddDownloadDialog } from './AddDownloadDialog';
import { DownloadGroup } from './DownloadGroup';
import { groupByNode, summarize, summaryParts } from './download-display';
import { useDownloadFeed, type FeedState } from './use-download-feed';

/** Countdowns ("retrying in 8 min") and "finished today" read from one clock. */
const TICK_MS = 10_000;

/** One quiet line under the title: whether what is on screen is live. */
const FEED_NOTE: Partial<Record<FeedState, string>> = {
    connecting: 'Connecting for live progress…',
    reconnecting: 'Reconnecting — progress shown may be a few seconds old.',
    unsupported: 'Live progress and controls need the next dashboard update. The list below is as of this page load.',
    demo: 'Demo data — downloads cannot be started or stopped here.',
};

/**
 * Every download the person can see, grouped by node (screen U1). A download
 * on an offline node is not failed: it waits, and its row says so.
 */
export default function DownloadsPage() {
    const demo = useDemoMode();
    const manages = can(useCurrentRole(), 'nodes:manage:all');
    const feed = useDownloadFeed(demo);
    const [adding, setAdding] = useState(false);
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), TICK_MS);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        if (!feed.error) return;
        toast.error(feed.error);
        feed.clearError();
    }, [feed]);

    const online = useMemo(() => new Map(feed.nodes.map((node) => [node.id, node.online])), [feed.nodes]);
    const groups = useMemo(() => groupByNode(feed.items, feed.nodes), [feed.items, feed.nodes]);
    const parts = summaryParts(summarize(feed.items, (id) => online.get(id) ?? false, now));
    const controls = feed.state === 'live';
    const canAdd = feed.nodes.some((node) => node.downloads);
    const note = FEED_NOTE[feed.state];

    return (
        <div className="container mx-auto max-w-4xl space-y-6 px-4 py-8">
            <PageHeader
                title="Downloads"
                description={parts.length > 0 ? (
                    <span className="tabular-nums">
                        {parts.map((part, index) => (
                            <span key={part.label}>
                                {index > 0 ? <span aria-hidden className="px-1.5 text-muted-foreground/50">·</span> : null}
                                <span className="font-medium text-foreground">{part.count}</span> {part.label}
                            </span>
                        ))}
                    </span>
                ) : 'Links, magnets and torrents your nodes fetch for you.'}
                actions={canAdd || manages ? (
                    <>
                        {/* Organisation → Downloads (L1): owners and admins only. */}
                        {manages ? (
                            <Button asChild variant="ghost" className="rounded-full text-[13px]">
                                <Link href="/dashboard/downloads/restrictions">Restrictions</Link>
                            </Button>
                        ) : null}
                        {canAdd ? (
                            <Button className="gap-2 rounded-full" onClick={() => setAdding(true)} disabled={!controls}>
                                <Plus className="h-4 w-4" />
                                Add download
                            </Button>
                        ) : null}
                    </>
                ) : null}
            />

            {note ? (
                <p className="-mt-2 flex items-start gap-2 text-[11.5px] leading-relaxed text-muted-foreground/70">
                    <span aria-hidden className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                    <span>{note}</span>
                </p>
            ) : null}

            {feed.state === 'loading' ? (
                <div className="py-16 text-center text-sm text-muted-foreground">Loading downloads…</div>
            ) : !feed.available ? (
                <EmptyState
                    icon={Download}
                    title="Downloads are not set up yet"
                    description="This dashboard's database does not have the downloads table yet. It is created when the dashboard next starts."
                />
            ) : groups.length === 0 ? (
                <EmptyState
                    icon={Download}
                    title="Nothing downloaded yet"
                    description={canAdd
                        ? 'Add a link or a magnet and the node fetches it into its download folder, even with this tab closed.'
                        : 'Turn on Downloads from a node’s card on the Nodes page, then add a link here.'}
                />
            ) : (
                <div className="space-y-4">
                    {groups.map((group) => (
                        <DownloadGroup
                            key={group.node.id}
                            group={group}
                            now={now}
                            controls={controls}
                            commands={feed}
                        />
                    ))}
                </div>
            )}

            <AddDownloadDialog
                open={adding}
                onOpenChange={setAdding}
                nodes={feed.nodes}
                onAdd={feed.start}
            />
        </div>
    );
}
