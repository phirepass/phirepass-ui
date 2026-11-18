'use client';

import { useState } from 'react';
import { Download, SlidersHorizontal } from 'lucide-react';

import { Button } from './ui/button';
import { Switch } from './ui/switch';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from './ui/alert-dialog';
import { confirmationFor, policyLock, runningLabel, switchState, type DownloadSwitch } from '@/lib/download-switches';
import { useCurrentOrg } from '@/lib/session';
import type { TunnelNode } from '@/types/node';

import { DownloadSettingsDialog } from './download/DownloadSettingsDialog';

/**
 * Remote Fetch on the node card: the running line (F3) for anyone lent
 * Downloads, and the two switches (F) for whoever may configure the node.
 *
 * The switches are one rounded group with a hairline between rows, following
 * the dashboard's look rather than the widget's. Below them, Settings opens
 * the node's download settings (T1.21), and turning Downloads on opens them
 * at once, since nothing can download until a folder is chosen.
 */
export function NodeDownloads({
    node,
    canManage,
    disabled,
    onSetSwitch,
    onOpen,
}: {
    node: TunnelNode;
    canManage: boolean;
    disabled: boolean;
    /** Resolves once the node has the change; throws with the node's reason. */
    onSetSwitch?: (kind: DownloadSwitch, on: boolean) => Promise<void>;
    /** Opens the downloader. Absent until the dashboard ships the widget. */
    onOpen?: () => void;
}) {
    const state = switchState(node.services);
    const running = node.downloads?.running ?? 0;
    const percent = node.downloads?.percent ?? null;
    const name = node.name || 'this node';
    const org = useCurrentOrg()?.name ?? 'your organisation';
    // L2: the organisation's ceiling. A locked switch that is somehow on can
    // still be turned off; only turning it on is refused.
    const fetchLock = state.downloads ? null : policyLock(node.download_policy, 'FETCH', org);
    const torrentLock = state.torrents ? null : policyLock(node.download_policy, 'TORRENT', org);

    const [pending, setPending] = useState<DownloadSwitch | null>(null);
    const [asking, setAsking] = useState<{ kind: DownloadSwitch; on: boolean; question: 'K6' | 'K7' } | null>(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const online = node.status ? node.status === 'online' : !!node.is_online;

    const flip = async (kind: DownloadSwitch, on: boolean) => {
        if (!onSetSwitch) return;
        setPending(kind);
        try {
            await onSetSwitch(kind, on);
            if (kind === 'FETCH' && on) setSettingsOpen(true);
        } finally {
            setPending(null);
        }
    };

    const request = (kind: DownloadSwitch, on: boolean) => {
        const question = confirmationFor(state, kind, on, running);
        if (question) setAsking({ kind, on, question });
        else void flip(kind, on);
    };

    const showSwitches = canManage && !!onSetSwitch;
    if (!showSwitches && !state.downloads) return null;

    return (
        <div className="mt-3 space-y-2">
            {state.downloads && running > 0 ? (
                <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">{runningLabel(running)}</span>
                    {percent !== null ? (
                        <span className="font-mono text-foreground">{Math.floor(percent)}%</span>
                    ) : null}
                </div>
            ) : null}

            {state.downloads && onOpen ? (
                <Button variant="outline" size="sm" className="h-8 w-full gap-2 text-xs" disabled={disabled} onClick={onOpen}>
                    <Download className="h-3.5 w-3.5" />
                    Downloads
                </Button>
            ) : null}

            {showSwitches ? (
                <div className="mac-squircle divide-y divide-hairline rounded-[9px] border border-hairline">
                    <SwitchRow
                        label="Downloads"
                        detail={fetchLock ?? 'Let people with access make this node download links into its download folder.'}
                        checked={state.downloads}
                        busy={pending === 'FETCH'}
                        disabled={disabled || pending !== null || fetchLock !== null}
                        onChange={(on) => request('FETCH', on)}
                    />
                    <SwitchRow
                        label="Torrents"
                        detail={torrentLock ?? (state.downloads
                            ? 'Also allow magnet links and .torrent files. The node connects to public peers.'
                            : 'Turn Downloads on first.')}
                        checked={state.torrents}
                        busy={pending === 'TORRENT'}
                        disabled={disabled || pending !== null || !state.downloads || torrentLock !== null}
                        onChange={(on) => request('TORRENT', on)}
                    />
                    {state.downloads ? (
                        <button type="button" onClick={() => setSettingsOpen(true)} disabled={disabled}
                            className="flex w-full items-center gap-3 px-3 py-2.5 text-left disabled:opacity-50">
                            <span className="min-w-0 flex-1">
                                <span className="block text-xs font-medium text-foreground">Settings</span>
                                <span className="block text-[11px] leading-snug text-muted-foreground">
                                    Folder, how many at once, free space, download hours.
                                </span>
                            </span>
                            <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                    ) : null}
                </div>
            ) : null}

            {showSwitches ? (
                <DownloadSettingsDialog node={node} nodeName={name} online={online}
                    open={settingsOpen} onOpenChange={setSettingsOpen} />
            ) : null}

            <AlertDialog open={asking !== null} onOpenChange={(open) => !open && setAsking(null)}>
                <AlertDialogContent>
                    {asking?.question === 'K7' ? (
                        <AlertDialogHeader>
                            <AlertDialogTitle>Allow torrents on {name}?</AlertDialogTitle>
                            <AlertDialogDescription asChild>
                                <div className="space-y-2">
                                    <p>
                                        Anyone who can download to this node will be able to start torrents. The node
                                        connects to public peers, shows them its internet address, and uploads while it
                                        downloads.
                                    </p>
                                    <p>Finished torrents keep seeding until someone deletes them.</p>
                                    <p>You are responsible for what is downloaded to your node.</p>
                                </div>
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                    ) : (
                        <AlertDialogHeader>
                            <AlertDialogTitle>Turn off downloads on {name}?</AlertDialogTitle>
                            <AlertDialogDescription>
                                {running === 1 ? '1 download is running' : `${running} downloads are running`}. They will
                                finish, but people with access will not be able to start new ones.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                    )}
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (asking) void flip(asking.kind, asking.on);
                                setAsking(null);
                            }}
                        >
                            {asking?.question === 'K7' ? 'Allow torrents' : 'Turn off'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

function SwitchRow({
    label,
    detail,
    checked,
    busy,
    disabled,
    onChange,
}: {
    label: string;
    detail: string;
    checked: boolean;
    busy: boolean;
    disabled: boolean;
    onChange: (on: boolean) => void;
}) {
    return (
        <label className="flex items-start gap-3 px-3 py-2.5">
            <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-foreground">{label}</span>
                <span className="block text-[11px] leading-snug text-muted-foreground">
                    {busy ? 'Waiting for the node…' : detail}
                </span>
            </span>
            <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} aria-label={label} />
        </label>
    );
}
