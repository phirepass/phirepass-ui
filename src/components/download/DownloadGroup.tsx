'use client';

import { Pause, Play, RotateCw, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import { describeNode, describeRow, isActive, rowActions, type JobView, type NodeGroup } from './download-display';

export interface RowCommands {
    stop: (id: string) => void;
    resume: (id: string) => void;
    tryNow: (id: string) => void;
    remove: (id: string) => void;
}

/**
 * One node and its downloads (screen U1): one rounded container, the node on
 * the first row, a hairline between rows. Actions appear on hover and on
 * keyboard focus, so a list of twenty downloads is not twenty rows of buttons.
 */
export function DownloadGroup({
    group,
    now,
    controls,
    commands,
}: {
    group: NodeGroup;
    now: number;
    /** False until the live socket is up; buttons are then shown disabled. */
    controls: boolean;
    commands: RowCommands;
}) {
    const { node } = group;

    return (
        <section className="gradient-card mac-squircle overflow-hidden rounded-2xl border border-hairline">
            <header className="flex items-baseline gap-2 px-4 pb-2.5 pt-3.5">
                <h2 className="truncate text-[13px] font-semibold text-foreground">{node.name}</h2>
                <span className={cn('text-[11px]', node.online ? 'text-success' : 'text-muted-foreground')}>
                    {node.online ? 'online' : 'offline'}
                </span>
                <span className="ml-auto truncate text-[11px] tabular-nums text-muted-foreground">
                    {describeNode(group, now)}
                </span>
            </header>
            <ul className="divide-y divide-hairline border-t border-hairline">
                {group.items.map((item) => (
                    <DownloadRow
                        key={item.job.download_id}
                        job={item.job}
                        line={describeRow(item.job, node, now)}
                        waiting={isActive(item.job) && !node.online}
                        controls={controls}
                        commands={commands}
                    />
                ))}
            </ul>
        </section>
    );
}

function DownloadRow({
    job,
    line,
    waiting,
    controls,
    commands,
}: {
    job: JobView;
    line: { primary: string; secondary: string | null };
    waiting: boolean;
    controls: boolean;
    commands: RowCommands;
}) {
    const actions = rowActions(job);
    const total = job.total_bytes ?? 0;
    const progress = total > 0 ? Math.min(100, (job.done_bytes / total) * 100) : null;
    const retrying = job.state === 'Retrying';

    return (
        <li className="group flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-3">
                    <span className="truncate text-[13px] text-foreground">{job.name || 'Untitled download'}</span>
                    <span
                        className={cn(
                            'ml-auto shrink-0 text-[11px] tabular-nums',
                            retrying ? 'text-warning' : 'text-muted-foreground',
                        )}
                    >
                        {line.primary}
                    </span>
                </div>
                {progress !== null && isActive(job) ? (
                    <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-white/[0.06]">
                        <div
                            className={cn('h-full rounded-full', waiting ? 'bg-muted-foreground/40' : 'bg-accent')}
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                ) : null}
                {line.secondary ? (
                    <p className="mt-1 truncate text-[11px] tabular-nums text-muted-foreground/80">{line.secondary}</p>
                ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                {actions.tryNow ? (
                    <Button variant="ghost" size="sm" className="h-7 rounded-full px-2.5 text-[11px]" disabled={!controls}
                        onClick={() => commands.tryNow(job.download_id)}>
                        Try now
                    </Button>
                ) : null}
                {actions.resume ? (
                    <IconAction label="Resume" disabled={!controls} onClick={() => commands.resume(job.download_id)}>
                        <Play className="h-3.5 w-3.5" />
                    </IconAction>
                ) : null}
                {actions.stop ? (
                    <IconAction label={job.state === 'Seeding' ? 'Stop seeding' : 'Stop'} disabled={!controls}
                        onClick={() => commands.stop(job.download_id)}>
                        {retrying ? <RotateCw className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                    </IconAction>
                ) : null}
                {actions.remove ? (
                    <IconAction label="Remove from the list (the file stays)" disabled={!controls}
                        onClick={() => commands.remove(job.download_id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                    </IconAction>
                ) : null}
            </div>
        </li>
    );
}

function IconAction({
    label,
    disabled,
    onClick,
    children,
}: {
    label: string;
    disabled: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" aria-label={label}
                    disabled={disabled} onClick={onClick}>
                    {children}
                </Button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
        </Tooltip>
    );
}
