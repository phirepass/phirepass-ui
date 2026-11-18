'use client';

import { useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
    DAY_LABELS,
    DEFAULT_DOWNLOAD_SETTINGS,
    GB,
    checkSettings,
    defaultWindow,
    fieldRefusal,
    hhmm,
    minutesOf,
    settingsStatus,
    type DownloadSettings,
    type NodeSettingsView,
} from '@/lib/download-settings';
import { cn } from '@/lib/utils';

import { useNodeSettings } from './use-node-settings';

/**
 * Node → Downloads settings (T1.21; F and W1). Grouped rounded lists, as the
 * switches on the card are; the node's refusal shows under the field it
 * names, and the line above Save says where the latest save stands.
 */
export function DownloadSettingsDialog({
    node,
    nodeName,
    online,
    open,
    onOpenChange,
}: {
    node: { id: string; server_id?: string | null };
    nodeName: string;
    online: boolean;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Downloads on {nodeName}</DialogTitle>
                    <DialogDescription>
                        Saved here and sent to the node. The node checks the folder itself.
                    </DialogDescription>
                </DialogHeader>
                {open ? <SettingsBody node={node} nodeName={nodeName} online={online} /> : null}
            </DialogContent>
        </Dialog>
    );
}

/** Mounted while the dialog is open, so its socket lives exactly that long. */
function SettingsBody({ node, nodeName, online }: {
    node: { id: string; server_id?: string | null };
    nodeName: string;
    online: boolean;
}) {
    const { view, connection, error, save } = useNodeSettings(node);
    const [draft, setDraft] = useState<DownloadSettings>(DEFAULT_DOWNLOAD_SETTINGS);
    const [seen, setSeen] = useState<number | null>(null);
    const [saving, setSaving] = useState(false);
    const [problem, setProblem] = useState<{ field: string; reason: string } | null>(null);

    // A fresh copy whenever the stored version moves (a save here or elsewhere).
    if (view && view.version !== seen) {
        setSeen(view.version);
        setDraft(view.settings);
    }

    const set = <K extends keyof DownloadSettings>(key: K, value: DownloadSettings[K]) => {
        setDraft((d) => ({ ...d, [key]: value }));
        setProblem(null);
    };

    const submit = async () => {
        const found = checkSettings(draft);
        if (found) {
            setProblem(found);
            return;
        }
        setSaving(true);
        try {
            await save(draft);
        } catch (e) {
            setProblem({ field: '', reason: e instanceof Error ? e.message : 'Could not save.' });
        } finally {
            setSaving(false);
        }
    };

    const errorFor = (field: string) => (problem?.field === field ? problem.reason : null) ?? fieldRefusal(view, field);
    const status = settingsStatus(view, online, nodeName);
    const ready = connection === 'ready';
    const win = draft.window;
    const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

    return connection === 'unsupported' ? (
            <p className="text-sm text-muted-foreground">
                This dashboard&apos;s connection library is older than download settings. They can be changed
                once it is updated.
            </p>
        ) : !ready ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
                {connection === 'error' ? error : 'Loading settings…'}
            </p>
        ) : (
            <div className="space-y-4">
                <Group>
                    <Row label="Download folder" error={errorFor('folder')}
                        detail="Where every download on this node is written.">
                        <Input value={draft.folder ?? ''} placeholder="/srv/downloads" className="h-8 w-56 font-mono text-xs"
                            onChange={(e) => set('folder', e.target.value.trim() === '' ? null : e.target.value)} />
                    </Row>
                    <NumberRow label="Running at once" value={draft.max_active} error={errorFor('max_active')}
                        detail="The rest wait their turn. Seeding does not count." onChange={(v) => set('max_active', v)} />
                    <NumberRow label="Downloads kept on the node" value={draft.max_jobs} error={errorFor('max_jobs')}
                        detail="Seeding included. A new one past this is refused." onChange={(v) => set('max_jobs', v)} />
                    <NumberRow label="Free space to keep" unit="GB" step={0.5} error={errorFor('min_free_bytes')}
                        value={Math.round((draft.min_free_bytes / GB) * 10) / 10}
                        detail="Downloads pause below it and resume 1 GB above it."
                        onChange={(v) => set('min_free_bytes', Math.round(v * GB))} />
                    <Row label="Reach private addresses" error={errorFor('allow_private')}
                        detail="Let links point at this node's own network: loopback, 10.x, 192.168.x and other private addresses.">
                        <Switch checked={draft.allow_private} onCheckedChange={(on) => set('allow_private', on)}
                            aria-label="Reach private addresses" />
                    </Row>
                </Group>

                <Group>
                    <Row label="Download window" error={errorFor('window')}
                        detail={win ? `Downloads run only in these hours (${win.timezone}).` : 'Downloads run at any time.'}>
                        <Switch checked={win !== null} aria-label="Download window"
                            onCheckedChange={(on) => set('window', on ? defaultWindow(browserZone) : null)} />
                    </Row>
                    {win ? (
                        <div className="space-y-2 px-3 py-2.5">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                From
                                <Input type="time" value={hhmm(win.start_min)} className="h-8 w-28 text-xs"
                                    onChange={(e) => {
                                        const m = minutesOf(e.target.value);
                                        if (m !== null) set('window', { ...win, start_min: m });
                                    }} />
                                to
                                <Input type="time" value={hhmm(win.end_min)} className="h-8 w-28 text-xs"
                                    onChange={(e) => {
                                        const m = minutesOf(e.target.value);
                                        if (m !== null) set('window', { ...win, end_min: m });
                                    }} />
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {DAY_LABELS.map((label, i) => {
                                    const on = (win.days & (1 << i)) !== 0;
                                    return (
                                        <button key={label} type="button" aria-pressed={on}
                                            onClick={() => set('window', { ...win, days: win.days ^ (1 << i) })}
                                            className={cn('rounded-full px-2.5 py-1 text-[11px] ring-1 ring-hairline transition-colors',
                                                on ? 'bg-white/[0.12] text-foreground' : 'text-muted-foreground hover:text-foreground')}>
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ) : null}
                </Group>

                <Group>
                    <NumberRow label="Players at once" value={draft.max_players} error={errorFor('max_players')}
                        detail="Open playback streams; more are turned away." onChange={(v) => set('max_players', v)} />
                    <NumberRow label="No data from a link for" unit="s" value={draft.stall_secs} error={errorFor('stall_secs')}
                        detail="Then the download retries." onChange={(v) => set('stall_secs', v)} />
                    <NumberRow label="Magnet metadata wait" unit="min" value={draft.metadata_secs / 60}
                        error={errorFor('metadata_secs')} detail="Then the torrent retries."
                        onChange={(v) => set('metadata_secs', Math.round(v * 60))} />
                    <NumberRow label="Longest retry wait" unit="min" value={draft.retry_max_secs / 60}
                        error={errorFor('retry_max_secs')} detail="Retries wait longer each time, up to this."
                        onChange={(v) => set('retry_max_secs', Math.round(v * 60))} />
                </Group>

                {problem && problem.field === '' ? (
                    <p className="text-xs text-destructive">{problem.reason}</p>
                ) : null}
                <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] text-muted-foreground">{status}</span>
                    <Button size="sm" onClick={() => void submit()} disabled={saving}>
                        {saving ? 'Saving…' : 'Save'}
                    </Button>
                </div>
            </div>
    );
}

function Group({ children }: { children: ReactNode }) {
    return <div className="mac-squircle divide-y divide-hairline rounded-[9px] border border-hairline">{children}</div>;
}

function Row({ label, detail, error, children }: {
    label: string;
    detail: string;
    error: string | null;
    children: ReactNode;
}) {
    return (
        <div className="flex items-start gap-3 px-3 py-2.5">
            <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-foreground">{label}</span>
                <span className={cn('block text-[11px] leading-snug', error ? 'text-destructive' : 'text-muted-foreground')}>
                    {error ?? detail}
                </span>
            </span>
            {children}
        </div>
    );
}

function NumberRow({ label, detail, error, value, unit, step = 1, onChange }: {
    label: string;
    detail: string;
    error: string | null;
    value: number;
    unit?: string;
    step?: number;
    onChange: (value: number) => void;
}) {
    return (
        <Row label={label} detail={detail} error={error}>
            <span className="flex items-center gap-1.5">
                <Input type="number" inputMode="decimal" step={step} value={Number.isFinite(value) ? value : ''}
                    className="h-8 w-20 text-right text-xs" aria-label={label}
                    onChange={(e) => onChange(e.target.value === '' ? Number.NaN : Number(e.target.value))} />
                {unit ? <span className="w-6 text-[11px] text-muted-foreground">{unit}</span> : null}
            </span>
        </Row>
    );
}
