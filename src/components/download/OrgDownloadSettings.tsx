'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ORG_DOWNLOAD_DEFAULTS, type OrgDownloadSettings } from '@/app/lib/org-download-settings';

/**
 * Organisation → Downloads (T1.21): how long finished downloads are listed,
 * and how long a cast or player link lasts. One rounded group, saved together.
 */
export function OrgDownloadSettingsCard() {
    const [saved, setSaved] = useState<OrgDownloadSettings | null>(null);
    const [draft, setDraft] = useState<OrgDownloadSettings>(ORG_DOWNLOAD_DEFAULTS);
    const [problem, setProblem] = useState<{ field: string; error: string } | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let disposed = false;
        fetch('/api/org/download-settings').then(async (res) => {
            if (!res.ok) throw new Error(`Could not load settings (${res.status}).`);
            const data = await res.json() as { settings: OrgDownloadSettings };
            if (disposed) return;
            setSaved(data.settings);
            setDraft(data.settings);
        }).catch((e: unknown) => {
            if (!disposed) toast.error(e instanceof Error ? e.message : 'Could not load settings.');
        });
        return () => {
            disposed = true;
        };
    }, []);

    const save = async () => {
        setSaving(true);
        setProblem(null);
        try {
            const res = await fetch('/api/org/download-settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(draft),
            });
            const data = await res.json().catch(() => ({})) as { settings?: OrgDownloadSettings; error?: string; field?: string };
            if (!res.ok || !data.settings) {
                if (data.field && data.error) setProblem({ field: data.field, error: data.error });
                else throw new Error(data.error ?? `Could not save (${res.status}).`);
                return;
            }
            setSaved(data.settings);
            setDraft(data.settings);
            toast.success('Saved.');
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not save.');
        } finally {
            setSaving(false);
        }
    };

    const changed = saved !== null && (saved.keep_days !== draft.keep_days || saved.stream_link_hours !== draft.stream_link_hours);
    const field = (key: keyof OrgDownloadSettings, label: string, detail: string, unit: string) => (
        <div className="flex items-start gap-3 px-4 py-3">
            <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-foreground">{label}</span>
                <span className={problem?.field === key ? 'block text-[11px] text-destructive' : 'block text-[11px] text-muted-foreground'}>
                    {problem?.field === key ? problem.error : detail}
                </span>
            </span>
            <span className="flex items-center gap-1.5">
                <Input type="number" inputMode="numeric" value={Number.isFinite(draft[key]) ? draft[key] : ''} aria-label={label}
                    className="h-8 w-20 text-right text-xs" disabled={saved === null}
                    onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value === '' ? Number.NaN : Number(e.target.value) }))} />
                <span className="w-9 text-[11px] text-muted-foreground">{unit}</span>
            </span>
        </div>
    );

    return (
        <div className="gradient-card mac-squircle divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline">
            {field('keep_days', 'Keep finished downloads for', 'Then they leave the list. Files on the node are never touched.', 'days')}
            {field('stream_link_hours', 'Cast and player links last', 'The longest a link to play a download works.', 'hours')}
            <div className="flex justify-end px-4 py-2.5">
                <Button size="sm" disabled={!changed || saving} onClick={() => void save()}>
                    {saving ? 'Saving…' : 'Save'}
                </Button>
            </div>
        </div>
    );
}
