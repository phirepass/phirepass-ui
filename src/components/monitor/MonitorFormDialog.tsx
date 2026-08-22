'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
    DEFAULT_INTERVAL_BY_KIND,
    INTERVAL_OPTIONS,
    KIND_SUPPORTS_AGENT,
    MIN_INTERVAL_SECS,
    MONITOR_KIND_ENABLED,
    MONITOR_KIND_HINTS,
    MONITOR_KIND_LABELS,
    type MonitorInput,
    type MonitorKind,
    type MonitorSummary,
} from '@/types/monitor';

import { KIND_ICONS, KIND_STYLES } from './monitor-display';
import { MonitorVantageField } from './MonitorVantageField';

const KIND_ORDER: MonitorKind[] = ['http', 'ssl', 'domain'];

const TARGET_PLACEHOLDERS: Record<MonitorKind, string> = {
    http: 'https://example.com/health',
    ssl: 'example.com:443',
    domain: 'example.com',
};

const TARGET_LABELS: Record<MonitorKind, string> = {
    http: 'URL',
    ssl: 'Host and port',
    domain: 'Domain name',
};

interface MonitorFormDialogProps {
    /** Present when editing; absent when creating. */
    monitor: MonitorSummary | null;
    onClose: () => void;
    onSubmit: (input: MonitorInput) => Promise<boolean>;
}

/**
 * Mounted only while open, and keyed on the monitor being edited, so every field
 * can seed itself from props once. A cancelled edit cannot leak into the next
 * create because the component itself does not survive the close.
 */
export function MonitorFormDialog({ monitor, onClose, onSubmit }: MonitorFormDialogProps) {
    const isEdit = !!monitor;

    const [kind, setKind] = useState<MonitorKind>(monitor?.kind ?? 'http');
    const [name, setName] = useState(monitor?.name ?? '');
    const [target, setTarget] = useState(monitor?.target ?? '');
    // Clamped to the floor on the way in: a monitor stored below it — created
    // before the floor existed, or written directly — has no matching option, so
    // the select would seed blank and a save would silently drop the interval.
    const [intervalSecs, setIntervalSecs] = useState(
        Math.max(monitor?.interval_secs ?? DEFAULT_INTERVAL_BY_KIND.http, MIN_INTERVAL_SECS)
    );
    const [timeoutMs, setTimeoutMs] = useState(monitor?.timeout_ms ?? 10_000);
    const [method, setMethod] = useState(monitor?.method ?? 'GET');
    const [expectedStatus, setExpectedStatus] = useState(
        monitor?.expected_status.join(', ') ?? ''
    );
    const [keyword, setKeyword] = useState(monitor?.keyword ?? '');
    const [keywordMode, setKeywordMode] = useState<'contains' | 'absent'>(
        monitor?.keyword_mode ?? 'contains'
    );
    const [followRedirects, setFollowRedirects] = useState(monitor?.follow_redirects ?? true);
    const [degradedMs, setDegradedMs] = useState(monitor?.degraded_ms ?? 1500);
    const [expiryWarnDays, setExpiryWarnDays] = useState(monitor?.expiry_warn_days ?? 21);
    const [nodeId, setNodeId] = useState<string | null>(monitor?.node_id ?? null);
    const [agentOfflineIsOutage, setAgentOfflineIsOutage] = useState(
        monitor?.agent_offline_is_outage ?? false
    );
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const selectKind = (next: MonitorKind) => {
        // The buttons are disabled, but guard the handler too so the rule holds
        // if one is ever triggered by keyboard or by a caller.
        if (!MONITOR_KIND_ENABLED[next]) return;

        setKind(next);
        // Expiry checks answer from a registry once a day; carrying an HTTP
        // monitor's 5-minute cadence over would just hammer it.
        if (!isEdit) {
            setIntervalSecs(DEFAULT_INTERVAL_BY_KIND[next]);
        }
        // Cleared on the way in rather than only at submit, so the form never
        // shows a vantage the chosen kind cannot honour. Applies while editing
        // too: a monitor switched to `domain` genuinely loses its agent.
        if (!KIND_SUPPORTS_AGENT[next]) {
            setNodeId(null);
        }
    };

    const handleSubmit = async () => {
        // Checks run from an agent, so there is no vantage to fall back to when
        // none is chosen. Caught here rather than by `required` on the trigger,
        // which a Radix select does not support.
        if (KIND_SUPPORTS_AGENT[kind] && !nodeId) {
            setError('Choose the agent this check should run from.');
            return;
        }

        setSubmitting(true);
        setError(null);

        const parsedStatuses = expectedStatus
            .split(/[,\s]+/)
            .map((entry) => Number(entry.trim()))
            .filter((value) => Number.isInteger(value) && value >= 100 && value <= 599);

        try {
            const ok = await onSubmit({
                name: name.trim(),
                kind,
                target: target.trim(),
                interval_secs: intervalSecs,
                timeout_ms: timeoutMs,
                method,
                expected_status: parsedStatuses,
                keyword: kind === 'http' && keyword.trim() ? keyword.trim() : null,
                keyword_mode: keywordMode,
                follow_redirects: followRedirects,
                degraded_ms: degradedMs,
                expiry_warn_days: expiryWarnDays,
                node_id: KIND_SUPPORTS_AGENT[kind] ? nodeId : null,
                // Meaningless without an agent, and sending the toggle's stale
                // value would resurrect it if the monitor moved back to one.
                agent_offline_is_outage: nodeId ? agentOfflineIsOutage : false,
            });

            if (!ok) {
                setError('The server rejected this monitor. Check the fields above.');
            }
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : 'Failed to save monitor');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open onOpenChange={(next) => !next && onClose()}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{isEdit ? 'Edit monitor' : 'New monitor'}</DialogTitle>
                    <DialogDescription>
                        {isEdit
                            ? 'Changes take effect on the next scheduled check.'
                            : 'Pick what to watch; the scheduler starts checking immediately.'}
                    </DialogDescription>
                </DialogHeader>

                <form
                    className="space-y-5"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void handleSubmit();
                    }}
                >
                    <div>
                        <Label className="mb-2 block">What to watch</Label>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                            {KIND_ORDER.map((option) => {
                                const Icon = KIND_ICONS[option];
                                const active = kind === option;
                                const enabled = MONITOR_KIND_ENABLED[option];

                                return (
                                    <button
                                        key={option}
                                        type="button"
                                        onClick={() => selectKind(option)}
                                        aria-pressed={active}
                                        disabled={!enabled}
                                        title={enabled ? undefined : 'Not available yet'}
                                        className={cn(
                                            'flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-colors',
                                            'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/45',
                                            !enabled && 'cursor-not-allowed border-hairline bg-secondary/20 opacity-55',
                                            enabled && active && 'border-accent/50 bg-accent/10',
                                            enabled && !active && 'border-hairline hover:border-hairline-strong hover:bg-secondary/40'
                                        )}
                                    >
                                        <Icon
                                            className={cn(
                                                'h-4 w-4',
                                                enabled ? KIND_STYLES[option].text : 'text-muted-foreground',
                                                !enabled && 'opacity-70'
                                            )}
                                        />
                                        <span className="flex items-center gap-1.5 text-xs font-medium">
                                            {MONITOR_KIND_LABELS[option]}
                                            {enabled ? null : (
                                                <span className="rounded border border-hairline px-1 py-px text-[9px] font-medium text-muted-foreground">
                                                    soon
                                                </span>
                                            )}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">{MONITOR_KIND_HINTS[kind]}</p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <Label htmlFor="monitor-name">Name</Label>
                            <Input
                                id="monitor-name"
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                placeholder="Marketing site"
                                className="mt-1.5"
                                required
                            />
                        </div>
                        <div>
                            <Label htmlFor="monitor-target">{TARGET_LABELS[kind]}</Label>
                            {/*
                              * The method is fixed to GET while the advanced
                              * panel is disabled, so it is shown in the field
                              * rather than left implicit — the request being
                              * made is part of what the URL means.
                              */}
                            <div className="relative mt-1.5">
                                {kind === 'http' ? (
                                    <span
                                        aria-hidden
                                        className="ml-1 pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 select-none rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px] font-medium text-muted-foreground"
                                    >
                                        {method}
                                    </span>
                                ) : null}
                                <Input
                                    id="monitor-target"
                                    value={target}
                                    onChange={(event) => setTarget(event.target.value)}
                                    placeholder={TARGET_PLACEHOLDERS[kind]}
                                    className={cn('font-mono text-sm', kind === 'http' && 'pl-12')}
                                    required
                                />
                            </div>
                        </div>
                    </div>

                    <MonitorVantageField
                        kind={kind}
                        nodeId={nodeId}
                        onNodeChange={setNodeId}
                        agentOfflineIsOutage={agentOfflineIsOutage}
                        onAgentOfflineIsOutageChange={setAgentOfflineIsOutage}
                        fallbackNodeName={monitor?.node_name ?? null}
                    />

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <Label>Check every</Label>
                            <Select
                                value={String(intervalSecs)}
                                onValueChange={(value) => setIntervalSecs(Number(value))}
                            >
                                <SelectTrigger className="mt-1.5">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {INTERVAL_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={String(option.value)}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {kind === 'ssl' || kind === 'domain' ? (
                            <div>
                                <Label htmlFor="monitor-warn-days">Warn this many days before expiry</Label>
                                <Input
                                    id="monitor-warn-days"
                                    type="number"
                                    min={1}
                                    max={365}
                                    value={expiryWarnDays}
                                    onChange={(event) => setExpiryWarnDays(Number(event.target.value))}
                                    className="mt-1.5"
                                />
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Inside this window is degraded, not down.
                                </p>
                            </div>
                        ) : (
                            <div>
                                <Label htmlFor="monitor-degraded">Degraded above (ms)</Label>
                                <Input
                                    id="monitor-degraded"
                                    type="number"
                                    min={1}
                                    max={timeoutMs}
                                    value={degradedMs}
                                    onChange={(event) => setDegradedMs(Number(event.target.value))}
                                    className="mt-1.5"
                                />
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Slower than this reports degraded rather than down.
                                </p>
                            </div>
                        )}
                    </div>

                    <div>
                        {/*
                          * Disabled rather than removed: the panel below is
                          * complete and still typechecked, so re-enabling it is
                          * a one-line change once the backend honours the
                          * fields it sets.
                          */}
                        <button
                            type="button"
                            disabled
                            title="Not available yet"
                            onClick={() => setShowAdvanced((value) => !value)}
                            className="cursor-not-allowed text-xs font-medium text-muted-foreground/60"
                        >
                            Show advanced options (soon)
                        </button>
                    </div>

                    {showAdvanced ? (
                        <div className="space-y-4 rounded-lg border border-hairline bg-card/40 p-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div>
                                    <Label htmlFor="monitor-timeout">Timeout (ms)</Label>
                                    <Input
                                        id="monitor-timeout"
                                        type="number"
                                        min={500}
                                        max={120000}
                                        value={timeoutMs}
                                        onChange={(event) => setTimeoutMs(Number(event.target.value))}
                                        className="mt-1.5"
                                    />
                                </div>
                                {kind === 'ssl' || kind === 'domain' ? (
                                    <div>
                                        <Label htmlFor="monitor-degraded-adv">Degraded above (ms)</Label>
                                        <Input
                                            id="monitor-degraded-adv"
                                            type="number"
                                            min={1}
                                            max={timeoutMs}
                                            value={degradedMs}
                                            onChange={(event) => setDegradedMs(Number(event.target.value))}
                                            className="mt-1.5"
                                        />
                                    </div>
                                ) : (
                                    <div>
                                        <Label htmlFor="monitor-warn-days-adv">Expiry warning (days)</Label>
                                        <Input
                                            id="monitor-warn-days-adv"
                                            type="number"
                                            min={1}
                                            max={365}
                                            value={expiryWarnDays}
                                            onChange={(event) => setExpiryWarnDays(Number(event.target.value))}
                                            className="mt-1.5"
                                        />
                                    </div>
                                )}
                            </div>

                            {kind === 'http' ? (
                                <>
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <div>
                                            <Label>Method</Label>
                                            <Select value={method} onValueChange={setMethod}>
                                                <SelectTrigger className="mt-1.5">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].map((entry) => (
                                                        <SelectItem key={entry} value={entry}>
                                                            {entry}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label htmlFor="monitor-status">Expected status codes</Label>
                                            <Input
                                                id="monitor-status"
                                                value={expectedStatus}
                                                onChange={(event) => setExpectedStatus(event.target.value)}
                                                placeholder="200, 204"
                                                className="mt-1.5 font-mono text-sm"
                                            />
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                Leave empty to accept any 2xx or 3xx.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <div>
                                            <Label htmlFor="monitor-keyword">Keyword</Label>
                                            <Input
                                                id="monitor-keyword"
                                                value={keyword}
                                                onChange={(event) => setKeyword(event.target.value)}
                                                placeholder='e.g. "status":"ok"'
                                                className="mt-1.5 font-mono text-sm"
                                            />
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                A 200 that renders an error page still fails this.
                                            </p>
                                        </div>
                                        <div>
                                            <Label>Keyword must be</Label>
                                            <Select
                                                value={keywordMode}
                                                onValueChange={(value) => setKeywordMode(value as 'contains' | 'absent')}
                                            >
                                                <SelectTrigger className="mt-1.5">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="contains">Present in the response</SelectItem>
                                                    <SelectItem value="absent">Absent from the response</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between rounded-lg border border-hairline px-3 py-2.5">
                                        <div>
                                            <p className="text-sm font-medium">Follow redirects</p>
                                            <p className="text-xs text-muted-foreground">
                                                Off means a 301 is judged on its own status code.
                                            </p>
                                        </div>
                                        <Switch checked={followRedirects} onCheckedChange={setFollowRedirects} />
                                    </div>
                                </>
                            ) : null}
                        </div>
                    ) : null}

                    {error ? <p className="text-sm text-destructive">{error}</p> : null}

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={submitting}>
                            {submitting ? 'Saving...' : isEdit ? 'Save changes' : 'Create monitor'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
