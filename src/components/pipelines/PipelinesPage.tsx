'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, Workflow } from 'lucide-react';
import { toast } from 'sonner';

import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { SearchBar } from '@/components/SearchBar';
import { Button } from '@/components/ui/button';
import { can, useCurrentRole } from '@/lib/rbac';
import { cn } from '@/lib/utils';
import { MOCK_AGENTS } from '@/data/mockPipelines';
import { flattenSteps, latestRun, type Pipeline } from '@/types/pipeline';

import { PipelineDetailDialog } from './PipelineDetailDialog';
import { PipelineLane } from './PipelineLane';
import { PipelineTimeline } from './PipelineTimeline';
import {
    deletePipeline,
    queueManualRun,
    setPipelineStatus,
    usePipelines,
    useStoreReady,
} from './pipeline-store';
import { describeTrigger, nextFiring } from './pipeline-display';

/**
 * How often the page's clock advances.
 *
 * Every countdown, the "now" line on the rail, and the duration of a run in
 * flight read from one value held here, so the whole screen ticks together
 * rather than each row reading the clock whenever React happens to render it.
 * Ten seconds is under the resolution anything on screen displays.
 */
const TICK_MS = 10_000;

/**
 * Lanes are grouped, not filtered.
 *
 * A filter answers "show me the paused ones"; the question people arrive with
 * is "is anything wrong, and what runs next". Groups answer that without a
 * click, and keep the drafts and paused pipelines on the page — visibly set
 * aside rather than hidden behind a chip nobody presses.
 */
const GROUPS = [
    { id: 'attention', title: 'Needs attention' },
    { id: 'scheduled', title: 'Scheduled' },
    { id: 'manual', title: 'Manual' },
    { id: 'idle', title: 'Paused and drafts' },
] as const;

type GroupId = (typeof GROUPS)[number]['id'];

export default function PipelinesPage() {
    const role = useCurrentRole();
    const canManage = can(role, 'pipelines:manage');

    const pipelines = usePipelines();
    const ready = useStoreReady();
    const [now, setNow] = useState(0);
    const [searchQuery, setSearchQuery] = useState('');
    const [detailId, setDetailId] = useState<string | null>(null);

    // The clock starts after mount: the sample data is built relative to the
    // current time, and reading it during render would give the server one
    // answer and the browser another.
    useEffect(() => {
        setNow(Date.now());
        const timer = setInterval(() => setNow(Date.now()), TICK_MS);
        return () => clearInterval(timer);
    }, []);

    const offlineAgentIds = useMemo(
        () => new Set(MOCK_AGENTS.filter((agent) => !agent.online).map((agent) => agent.id)),
        []
    );

    const grouped = useMemo(() => {
        const needle = searchQuery.trim().toLowerCase();

        const matches = pipelines.filter((pipeline) => {
            if (!needle) return true;
            return (
                pipeline.name.toLowerCase().includes(needle)
                || pipeline.description.toLowerCase().includes(needle)
                || describeTrigger(pipeline).toLowerCase().includes(needle)
                || flattenSteps(pipeline.steps).some(({ step }) => step.name.toLowerCase().includes(needle))
            );
        });

        const buckets: Record<GroupId, Pipeline[]> = { attention: [], scheduled: [], manual: [], idle: [] };

        for (const pipeline of matches) {
            const failed = latestRun(pipeline)?.status === 'failed';
            const unreachable = flattenSteps(pipeline.steps).some(({ step }) => (
                step.kind !== 'branch' && step.target.kind === 'node' && offlineAgentIds.has(step.target.node_id)
            ));

            if (pipeline.status !== 'active') {
                buckets.idle.push(pipeline);
            } else if (failed || unreachable) {
                buckets.attention.push(pipeline);
            } else if (pipeline.trigger.kind === 'cron') {
                buckets.scheduled.push(pipeline);
            } else {
                buckets.manual.push(pipeline);
            }
        }

        // Within a group, whatever fires soonest comes first; a pipeline with no
        // next firing sorts to the end rather than to an arbitrary place.
        for (const key of Object.keys(buckets) as GroupId[]) {
            buckets[key].sort((a, b) => {
                const nextA = nextFiring(a, new Date(now))?.getTime() ?? Number.POSITIVE_INFINITY;
                const nextB = nextFiring(b, new Date(now))?.getTime() ?? Number.POSITIVE_INFINITY;
                if (nextA !== nextB) return nextA - nextB;
                return a.name.localeCompare(b.name);
            });
        }

        return { buckets, total: matches.length };
    }, [pipelines, searchQuery, offlineAgentIds, now]);

    const detailPipeline = detailId ? pipelines.find((entry) => entry.id === detailId) ?? null : null;

    const togglePause = (pipeline: Pipeline) => {
        const paused = pipeline.status === 'paused';
        setPipelineStatus(pipeline.id, paused ? 'active' : 'paused');
        toast.success(paused
            ? `${pipeline.name} is scheduled again`
            : `${pipeline.name} is paused — its schedule will not fire`);
    };

    // There is no runner behind this page, so "Run now" does what a real one
    // would do first: it queues the run and shows it, and says plainly that
    // nothing will pick it up yet.
    const runNow = (pipeline: Pipeline) => {
        queueManualRun(pipeline.id);
        setDetailId(pipeline.id);
        toast.success(`Queued a run of ${pipeline.name}`, {
            description: 'No runner is attached yet, so it will sit queued.',
        });
    };

    const remove = (pipeline: Pipeline) => {
        deletePipeline(pipeline.id);
        toast.success(`Deleted ${pipeline.name}`);
    };

    return (
        <div className="container mx-auto max-w-5xl space-y-6 px-4 py-8">
            <PageHeader
                title="Pipelines"
                description="Scheduled work that runs on your agents, one step at a time."
                badge={
                    <span className="rounded-full border border-hairline px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                        preview
                    </span>
                }
                actions={canManage ? (
                    <Button asChild className="gap-2 rounded-full">
                        <Link href="/dashboard/pipelines/new">
                            <Plus className="h-4 w-4" />
                            New pipeline
                        </Link>
                    </Button>
                ) : null}
            />

            {/* Nothing executes these yet, and a page of schedules that reads as
                live would be actively misleading. It does not need a boxed
                banner to say so, though — a caveat in a bordered well is a
                fourth block of chrome before the first pipeline, and the page
                is supposed to be a list. One quiet line, under the title it
                qualifies. */}
            <p className="-mt-2 flex items-start gap-2 text-[11.5px] leading-relaxed text-muted-foreground/70">
                <span aria-hidden className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                <span>
                    Design preview — no scheduler and no runner behind this page. Nothing here executes,
                    edits live only in this tab, and a secret typed into a step is held as plain text.
                </span>
            </p>

            {!ready ? (
                <div className="py-16 text-center text-sm text-muted-foreground">Loading pipelines...</div>
            ) : pipelines.length === 0 ? (
                <EmptyState
                    icon={Workflow}
                    title="No pipelines yet"
                    description="A pipeline is a schedule and a list of steps — fetch something, reshape it, hand it on."
                    action={canManage ? (
                        <Button asChild className="gap-2 rounded-full">
                            <Link href="/dashboard/pipelines/new">
                                <Plus className="h-4 w-4" />
                                New pipeline
                            </Link>
                        </Button>
                    ) : null}
                />
            ) : (
                <div className="space-y-6">
                    <PipelineTimeline
                        pipelines={pipelines}
                        now={now}
                        onSelect={(pipeline) => setDetailId(pipeline.id)}
                    />

                    <SearchBar
                        value={searchQuery}
                        onChange={setSearchQuery}
                        placeholder="Search pipelines, schedules, or steps"
                        aria-label="Search pipelines"
                    >
                        <span className="text-[12px] tabular-nums text-muted-foreground/70">
                            {searchQuery.trim()
                                ? `${grouped.total} of ${pipelines.length} match`
                                : `${pipelines.length} pipeline${pipelines.length === 1 ? '' : 's'}`}
                        </span>
                    </SearchBar>

                    {grouped.total === 0 ? (
                        <EmptyState
                            icon={Search}
                            title="No pipelines match this search"
                            description="Try a different term, or clear the box to see everything again."
                        />
                    ) : (
                        GROUPS.map((group) => {
                            const entries = grouped.buckets[group.id];
                            if (entries.length === 0) return null;
                            const urgent = group.id === 'attention';

                            return (
                                <section key={group.id}>
                                    {/* A rule running out from the label, rather
                                        than a heavier heading: the group has to
                                        separate the lists without competing with
                                        the pipeline names inside them. */}
                                    <div className="mb-2.5 flex items-center gap-2.5 px-1">
                                        <h2
                                            className={cn(
                                                'text-[11px] font-semibold uppercase tracking-[0.09em]',
                                                urgent ? 'text-destructive' : 'text-muted-foreground/80'
                                            )}
                                        >
                                            {group.title}
                                        </h2>
                                        <span
                                            className={cn(
                                                'rounded-full px-1.5 py-px text-[10px] font-medium tabular-nums',
                                                urgent
                                                    ? 'bg-destructive/15 text-destructive'
                                                    : 'bg-white/[0.06] text-muted-foreground/70'
                                            )}
                                        >
                                            {entries.length}
                                        </span>
                                        <span aria-hidden className="h-px flex-1 bg-hairline" />
                                    </div>

                                    {/* One container, hairline dividers — the list is
                                        the object, not each row inside it. */}
                                    <div className="gradient-card mac-squircle divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline">
                                        {entries.map((pipeline) => (
                                            <PipelineLane
                                                key={pipeline.id}
                                                pipeline={pipeline}
                                                agents={MOCK_AGENTS}
                                                now={now}
                                                canManage={canManage}
                                                onOpen={(target) => setDetailId(target.id)}
                                                onRunNow={runNow}
                                                onTogglePause={togglePause}
                                                onDelete={remove}
                                            />
                                        ))}
                                    </div>
                                </section>
                            );
                        })
                    )}
                </div>
            )}

            <PipelineDetailDialog
                pipeline={detailPipeline}
                agents={MOCK_AGENTS}
                onClose={() => setDetailId(null)}
            />
        </div>
    );
}
