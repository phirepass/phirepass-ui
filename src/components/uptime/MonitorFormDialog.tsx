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
    MONITOR_KIND_HINTS,
    MONITOR_KIND_LABELS,
    type MonitorInput,
    type MonitorKind,
    type MonitorSummary,
} from '@/types/uptime';

import { KIND_ICONS } from './monitor-display';

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
    const [intervalSecs, setIntervalSecs] = useState(
        monitor?.interval_secs ?? DEFAULT_INTERVAL_BY_KIND.http
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
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const selectKind = (next: MonitorKind) => {
        setKind(next);
        // Expiry checks answer from a registry once a day; carrying an HTTP
        // monitor's 5-minute cadence over would just hammer it.
        if (!isEdit) {
            setIntervalSecs(DEFAULT_INTERVAL_BY_KIND[next]);
        }
    };

    const handleSubmit = async () => {
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

                                return (
                                    <button
                                        key={option}
                                        type="button"
                                        onClick={() => selectKind(option)}
                                        aria-pressed={active}
                                        className={cn(
                                            'flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-colors',
                                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                            active
                                                ? 'border-accent/50 bg-accent/10'
                                                : 'border-border hover:border-border hover:bg-secondary/40'
                                        )}
                                    >
                                        <Icon className={cn('h-4 w-4', active ? 'text-accent' : 'text-muted-foreground')} />
                                        <span className="text-xs font-medium">{MONITOR_KIND_LABELS[option]}</span>
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
                            <Input
                                id="monitor-target"
                                value={target}
                                onChange={(event) => setTarget(event.target.value)}
                                placeholder={TARGET_PLACEHOLDERS[kind]}
                                className="mt-1.5 font-mono text-sm"
                                required
                            />
                        </div>
                    </div>

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
                        <button
                            type="button"
                            onClick={() => setShowAdvanced((value) => !value)}
                            className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                        >
                            {showAdvanced ? 'Hide advanced options' : 'Show advanced options'}
                        </button>
                    </div>

                    {showAdvanced ? (
                        <div className="space-y-4 rounded-lg border border-border bg-card/40 p-4">
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

                                    <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
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
