'use client';

import { useMemo } from 'react';
import { HardDrive, Info } from 'lucide-react';

import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useUserNodes } from '@/hooks/use-user-nodes';
import { cn } from '@/lib/utils';
import { KIND_SUPPORTS_AGENT, type MonitorKind } from '@/types/monitor';

/**
 * How many checks an agent is already carrying.
 *
 * Spelled out rather than shown as a bare number: "3" beside a status word
 * reads as a version, an ID, or anything else. The count is here so someone
 * choosing a vantage can see which agents are already loaded before adding to
 * one — a probe runs on the agent's own runtime, and `PROBE_MAX_CONCURRENT`
 * caps how many can be in flight at once.
 */
function formatMonitorLoad(count: number): string {
    if (count === 0) return 'no monitors';
    return count === 1 ? '1 monitor' : `${count} monitors`;
}

interface MonitorVantageFieldProps {
    kind: MonitorKind;
    nodeId: string | null;
    onNodeChange: (nodeId: string | null) => void;
    agentOfflineIsOutage: boolean;
    onAgentOfflineIsOutageChange: (value: boolean) => void;
    /**
     * Name recorded on the monitor being edited. Used to keep a node that the
     * list no longer returns from silently vanishing out of the picker.
     */
    fallbackNodeName?: string | null;
}

/**
 * Chooses which of the user's agents runs the probe.
 *
 * There is deliberately no "from the PhirePass servers" option: every monitor
 * runs from an agent, so the field lists agents and nothing else. A monitor
 * without one cannot be created, which is why an empty list is presented as a
 * blocking condition rather than a quiet fallback.
 *
 * Split out of `MonitorFormDialog` because it owns a fetch, a derived option
 * list, and a dependent switch — enough behaviour that inlining it would bury
 * the rest of the form.
 */
export function MonitorVantageField({
    kind,
    nodeId,
    onNodeChange,
    agentOfflineIsOutage,
    onAgentOfflineIsOutageChange,
    fallbackNodeName,
}: MonitorVantageFieldProps) {
    const supported = KIND_SUPPORTS_AGENT[kind];
    const { nodes, loading, error } = useUserNodes(supported);

    // A monitor can outlive the node it was pointed at, and the list can simply
    // fail to load. Either way the selected id must stay in the options, or the
    // select would fall back to showing server vantage and an unwitting save
    // would move the monitor off the agent it was on.
    const options = useMemo(() => {
        if (!nodeId || nodes.some((node) => node.id === nodeId)) {
            return nodes;
        }
        return [
            ...nodes,
            // No count: this node is not in the list the server returned, so
            // there is nothing to report about it.
            { id: nodeId, name: fallbackNodeName || 'Unavailable node', online: false },
        ];
    }, [nodes, nodeId, fallbackNodeName]);

    if (!supported) {
        return (
            <div className="flex items-start gap-2 rounded-lg border border-border bg-card/40 px-3 py-2.5">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">
                    Domain checks are answered by the registry over RDAP and never connect to the
                    domain itself, so they always run from the PhirePass servers. Every agent would
                    get the same answer.
                </p>
            </div>
        );
    }

    const selected = options.find((node) => node.id === nodeId) ?? null;
    const noNodes = !loading && !error && options.length === 0;

    return (
        <div className="space-y-3">
            <div>
                <Label htmlFor="monitor-vantage">Run the check from</Label>
                <Select
                    value={nodeId ?? undefined}
                    onValueChange={onNodeChange}
                    disabled={noNodes}
                >
                    <SelectTrigger id="monitor-vantage" className="mt-1.5">
                        <SelectValue placeholder={loading ? 'Loading your agents...' : 'Select an agent'} />
                    </SelectTrigger>
                    <SelectContent>
                        {options.map((node) => (
                            <SelectItem
                                key={node.id}
                                value={node.id}
                                // Radix wraps the child in an `ItemText` span
                                // that shrinks to its content, so `ml-auto`
                                // inside it has nothing to push against and the
                                // status/load column comes out ragged. Letting
                                // that span grow is scoped here rather than
                                // changed on the shared `SelectItem`, which
                                // seven other pickers use.
                                className="[&>span:last-child]:min-w-0 [&>span:last-child]:flex-1"
                            >
                                <span className="flex w-full items-center gap-2">
                                    <HardDrive className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                    <span className="truncate">{node.name}</span>

                                    {/* Status and load sit together on the
                                        right: both are facts about whether this
                                        agent is a good place to put the check,
                                        where the name is only which one it is. */}
                                    <span className="ml-auto flex shrink-0 items-center gap-2 pl-3 text-xs text-muted-foreground">
                                        <span className="flex items-center gap-1.5">
                                            <span
                                                aria-hidden
                                                className={cn(
                                                    'h-1.5 w-1.5 rounded-full',
                                                    node.online ? 'bg-success' : 'bg-muted-foreground/50',
                                                )}
                                            />
                                            {node.online ? 'online' : 'offline'}
                                        </span>

                                        {/* Omitted, not zeroed, when the count
                                            is unknown — see `UserNodeOption`. */}
                                        {node.monitorCount !== undefined ? (
                                            <span className="tabular-nums">
                                                · {formatMonitorLoad(node.monitorCount)}
                                            </span>
                                        ) : null}
                                    </span>
                                </span>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <p className="mt-1 text-xs text-muted-foreground">
                    The agent runs the probe on its own network, so private addresses and internal
                    names resolve.
                </p>

                {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
                {noNodes ? (
                    <p className="mt-1 text-xs text-warning">
                        You have no agents yet. Add a node first — checks run from an agent, so
                        there is nowhere to run this one.
                    </p>
                ) : null}
            </div>

            {nodeId ? (
                <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2.5">
                    <div className="min-w-0">
                        <p className="text-sm font-medium">Treat an offline agent as an outage</p>
                        <p className="text-xs text-muted-foreground">
                            {agentOfflineIsOutage
                                ? `While the agent is offline the check counts as down${
                                    selected ? ` — ${selected.name} going away will page you` : ''
                                }.`
                                : 'While the agent is offline the check is recorded as unknown and stays quiet, so a restart is not logged as an outage.'}
                        </p>
                    </div>
                    <Switch
                        checked={agentOfflineIsOutage}
                        onCheckedChange={onAgentOfflineIsOutageChange}
                        aria-label="Treat an offline agent as an outage"
                    />
                </div>
            ) : null}
        </div>
    );
}
