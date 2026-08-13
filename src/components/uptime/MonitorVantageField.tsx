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
import { KIND_SUPPORTS_AGENT, type MonitorKind } from '@/types/uptime';

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
                            <SelectItem key={node.id} value={node.id}>
                                <span className="flex items-center gap-2">
                                    <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
                                    {node.name}
                                    <span
                                        aria-hidden
                                        className={cn(
                                            'h-1.5 w-1.5 rounded-full',
                                            node.online ? 'bg-success' : 'bg-muted-foreground/50'
                                        )}
                                    />
                                    <span className="text-xs text-muted-foreground">
                                        {node.online ? 'online' : 'offline'}
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
