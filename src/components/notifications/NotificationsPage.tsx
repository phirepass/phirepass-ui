'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, BellOff, BellRing, Loader2, Pencil, Send, ShieldOff, Smartphone } from 'lucide-react';
import { toast } from 'sonner';

import { AlertStrip, type AlertEntry } from '@/components/AlertStrip';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { StatTiles } from '@/components/StatTiles';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
import { useRuntimeConfig } from '@/components/RuntimeConfigProvider';
import { cn } from '@/lib/utils';
import {
    currentSubscription,
    hashEndpoint,
    permissionState,
    pushSupport,
    subscribe,
    unsubscribeCurrent,
    type PushSupport,
} from '@/lib/push';
import { createDefaultPreferences } from '@/data/notificationDefaults';
import {
    NOTIFICATION_EVENTS,
    type DevicePlatform,
    type NotificationCategory,
    type NotificationEventDefinition,
    type NotificationPreferences,
    type RegisteredDevice,
} from '@/types/notification';

import { DeviceCard } from './DeviceCard';
import { EventPreferenceList } from './EventPreferenceList';
import { NotificationPreview } from './NotificationPreview';
import { detectCurrentDevice, isStaleDevice } from './notification-display';

/** Shape of a row from `GET /api/notifications/devices`. */
interface DeviceResponse {
    id: string;
    endpoint_hash: string;
    label: string | null;
    platform: DevicePlatform | null;
    browser: string | null;
    created_at: string;
    last_active_at: string;
}

/**
 * The API stores label/platform/browser as nullable, because none of it is
 * load-bearing — a row with no label still delivers. The list needs something
 * to render, so the gaps are filled here rather than in the database.
 */
function toDevice(row: DeviceResponse, currentHash: string | null): RegisteredDevice {
    return {
        id: row.id,
        endpoint_hash: row.endpoint_hash,
        name: row.label ?? 'Unnamed device',
        platform: row.platform ?? 'linux',
        browser: row.browser ?? 'Browser',
        registered_at: row.created_at,
        last_active_at: row.last_active_at,
        is_current: currentHash !== null && row.endpoint_hash === currentHash,
    };
}

export default function NotificationsPage() {
    const { config } = useRuntimeConfig();
    const vapidPublicKey = config.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

    const [loading, setLoading] = useState(true);
    const [devices, setDevices] = useState<RegisteredDevice[]>([]);
    const [preferences, setPreferences] = useState<NotificationPreferences>(createDefaultPreferences);

    /** Resolved in an effect, because both depend on `window`. */
    const [support, setSupport] = useState<PushSupport>('ok');
    const [permission, setPermission] = useState<NotificationPermission>('default');
    /** False when the server has no VAPID keys, which makes the whole page inert. */
    const [configured, setConfigured] = useState(true);

    const [busy, setBusy] = useState(false);
    /** Bumped to remount the preview, which replays its arrival animation. */
    const [testPulse, setTestPulse] = useState(0);
    const [revokeTarget, setRevokeTarget] = useState<RegisteredDevice | null>(null);
    const [renameTarget, setRenameTarget] = useState<RegisteredDevice | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [renaming, setRenaming] = useState(false);
    const [criticalTarget, setCriticalTarget] = useState<NotificationEventDefinition | null>(null);

    /**
     * Re-reads the device list and works out which row is this browser.
     *
     * The hash comparison is the only link between the two: the server never
     * returns endpoints, so the page hashes its own subscription and looks for a
     * match. No subscription means no row can be current, which is exactly the
     * state after revoking this device from another tab.
     */
    const refresh = useCallback(async () => {
        const response = await fetch('/api/notifications/devices', { credentials: 'include' });
        if (!response.ok) {
            throw new Error(`devices ${response.status}`);
        }

        const payload = await response.json() as { configured?: boolean; devices?: DeviceResponse[] };
        const subscription = await currentSubscription();
        const currentHash = subscription ? await hashEndpoint(subscription.endpoint) : null;

        setConfigured(payload.configured !== false);
        setDevices((payload.devices ?? []).map((row) => toDevice(row, currentHash)));
    }, []);

    useEffect(() => {
        let disposed = false;

        const load = async () => {
            setSupport(pushSupport());
            setPermission(permissionState());

            try {
                await refresh();
            } catch (error) {
                console.warn('[notifications] failed to load devices', error);
                if (!disposed) {
                    toast.error('Could not load your registered devices');
                }
            } finally {
                if (!disposed) setLoading(false);
            }
        };

        void load();
        return () => { disposed = true; };
    }, [refresh]);

    /** This browser is subscribed — the only sense in which delivery is "on" here. */
    const enabled = useMemo(() => devices.some((device) => device.is_current), [devices]);
    const currentDevice = useMemo(
        () => devices.find((device) => device.is_current) ?? null,
        [devices],
    );

    const enabledEvents = useMemo(
        () => NOTIFICATION_EVENTS.filter((event) => preferences[event.id]).length,
        [preferences],
    );

    const blocked = permission === 'denied';
    const unavailable = support !== 'ok' || !configured || !vapidPublicKey;

    const alerts = useMemo<AlertEntry[]>(() => {
        const entries: AlertEntry[] = [];

        if (support === 'unsupported') {
            entries.push({
                id: 'unsupported',
                level: 'error',
                title: 'This browser cannot receive push notifications',
                message: 'It has no Push API. Safari needs 16.4 or newer, and most in-app browsers never expose it.',
                tag: 'unsupported',
            });
        } else if (support === 'insecure') {
            entries.push({
                id: 'insecure',
                level: 'error',
                title: 'Push needs a secure context',
                message: 'Reach this page over HTTPS or on localhost. A plain http:// address on the network will not do.',
                tag: 'insecure',
            });
        } else if (!configured || !vapidPublicKey) {
            entries.push({
                id: 'unconfigured',
                level: 'error',
                title: 'Push is not configured on this server',
                message: 'VAPID_PRIVATE_KEY and NEXT_PUBLIC_VAPID_PUBLIC_KEY have to be set for subscriptions to be issued.',
                tag: 'vapid',
            });
        } else if (blocked) {
            entries.push({
                id: 'blocked',
                level: 'warning',
                title: 'Notifications are blocked for this site',
                message: 'The browser will not ask again. Allow notifications in its site settings, then reload this page.',
                tag: 'permission',
            });
        }

        if (enabled && enabledEvents === 0) {
            entries.push({
                id: 'no-events',
                level: 'warning',
                title: 'No events are selected',
                message: 'This browser is registered, but nothing is set to trigger a notification.',
                tag: '0 events',
            });
        }

        for (const device of devices.filter(isStaleDevice)) {
            entries.push({
                id: `stale-${device.id}`,
                level: 'warning',
                title: `${device.name} has not checked in for months`,
                message: 'The browser has most likely dropped this subscription already. Revoking it keeps the list honest.',
                tag: device.browser,
            });
        }

        return entries;
    }, [support, configured, vapidPublicKey, blocked, enabled, enabledEvents, devices]);

    const enable = async () => {
        setBusy(true);
        try {
            const subscription = await subscribe(vapidPublicKey);
            setPermission(permissionState());

            if (!subscription) {
                toast.error('Notifications were not allowed', {
                    description: 'The browser will not ask again — allow them in its site settings.',
                });
                return;
            }

            // `toJSON()` rather than reading `.keys`: the keys live on the
            // subscription as an opaque getter, and toJSON is the documented way
            // to get the base64url pair the server needs.
            const json = subscription.toJSON();
            const identity = detectCurrentDevice();

            const response = await fetch('/api/notifications/devices', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    endpoint: subscription.endpoint,
                    keys: json.keys,
                    label: identity.name,
                    platform: identity.platform,
                    browser: identity.browser,
                }),
            });

            if (!response.ok) {
                // The browser now holds a subscription the server does not know
                // about; dropping it keeps the two in step.
                await unsubscribeCurrent();
                throw new Error(`register ${response.status}`);
            }

            await refresh();
            setTestPulse((n) => n + 1);
            toast.success('Notifications enabled', {
                description: 'This browser is now registered to receive them.',
            });
        } catch (error) {
            console.warn('[notifications] enable failed', error);
            toast.error('Could not enable notifications');
        } finally {
            setBusy(false);
        }
    };

    const disable = async () => {
        if (!currentDevice) return;
        setBusy(true);
        try {
            const response = await fetch(`/api/notifications/devices/${currentDevice.id}`, {
                method: 'DELETE',
                credentials: 'include',
            });
            if (!response.ok && response.status !== 404) {
                throw new Error(`revoke ${response.status}`);
            }

            await unsubscribeCurrent();
            await refresh();
            toast('Notifications turned off for this browser', {
                description: 'Your other registered devices still receive them.',
            });
        } catch (error) {
            console.warn('[notifications] disable failed', error);
            toast.error('Could not turn notifications off');
        } finally {
            setBusy(false);
        }
    };

    const revoke = async () => {
        if (!revokeTarget) return;
        const target = revokeTarget;
        setRevokeTarget(null);

        try {
            const response = await fetch(`/api/notifications/devices/${target.id}`, {
                method: 'DELETE',
                credentials: 'include',
            });
            if (!response.ok && response.status !== 404) {
                throw new Error(`revoke ${response.status}`);
            }

            // Only this browser's own subscription can be dropped from here;
            // every other device drops its own next time it is used.
            if (target.is_current) {
                await unsubscribeCurrent();
            }

            await refresh();
            toast.success(`${target.name} will no longer receive notifications`);
        } catch (error) {
            console.warn('[notifications] revoke failed', error);
            toast.error(`Could not revoke ${target.name}`);
        }
    };

    const openRename = (device: RegisteredDevice) => {
        setRenameTarget(device);
        setRenameValue(device.name);
    };

    const submitRename = async () => {
        if (!renameTarget) return;
        const label = renameValue.trim();

        if (!label) {
            toast.error('A name is required');
            return;
        }

        // Nothing changed — close rather than spend a round trip saying so.
        if (label === renameTarget.name) {
            setRenameTarget(null);
            return;
        }

        setRenaming(true);
        try {
            const response = await fetch(`/api/notifications/devices/${renameTarget.id}`, {
                method: 'PATCH',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label }),
            });
            if (!response.ok) {
                throw new Error(`rename ${response.status}`);
            }

            await refresh();
            setRenameTarget(null);
            toast.success(`Renamed to ${label}`);
        } catch (error) {
            console.warn('[notifications] rename failed', error);
            toast.error('Could not rename this device');
        } finally {
            setRenaming(false);
        }
    };

    const sendTest = async () => {
        setTestPulse((n) => n + 1);
        try {
            const response = await fetch('/api/notifications/test', {
                method: 'POST',
                credentials: 'include',
            });
            if (!response.ok) {
                throw new Error(`test ${response.status}`);
            }

            const outcome = await response.json() as { sent: number; pruned: number };

            if (outcome.pruned > 0) {
                await refresh();
            }

            if (outcome.sent === 0) {
                toast.error('Nothing could be delivered', {
                    description: outcome.pruned > 0
                        ? `${outcome.pruned} dead subscription(s) were removed.`
                        : 'No registered device accepted the notification.',
                });
                return;
            }

            toast.success(`Test sent to ${outcome.sent} device${outcome.sent === 1 ? '' : 's'}`, {
                description: outcome.pruned > 0
                    ? `${outcome.pruned} dead subscription(s) were removed.`
                    : 'It should arrive in a moment.',
            });
        } catch (error) {
            console.warn('[notifications] test failed', error);
            toast.error('Could not send the test notification');
        }
    };

    const applyToggle = (event: NotificationEventDefinition, next: boolean) => {
        setPreferences((prev) => ({ ...prev, [event.id]: next }));
    };

    const toggleEvent = (event: NotificationEventDefinition, next: boolean) => {
        // Turning a recommended event *off* is the only direction worth
        // interrupting: it is the one that loses you an alert you would want.
        if (!next && event.critical) {
            setCriticalTarget(event);
            return;
        }
        applyToggle(event, next);
    };

    const confirmCriticalOff = () => {
        if (!criticalTarget) return;
        applyToggle(criticalTarget, false);
        setCriticalTarget(null);
        toast(`${criticalTarget.label} is off`, {
            description: 'You will not be notified when this happens.',
        });
    };

    const toggleCategory = (category: NotificationCategory, next: boolean) => {
        setPreferences((prev) => {
            const updated = { ...prev };
            for (const event of NOTIFICATION_EVENTS) {
                if (event.category === category) {
                    updated[event.id] = next;
                }
            }
            return updated;
        });
    };

    const permissionTile = permission === 'granted'
        ? { value: 'Allowed', tone: 'success' as const }
        : permission === 'denied'
            ? { value: 'Blocked', tone: 'danger' as const }
            : { value: 'Not asked', tone: 'neutral' as const };

    return (
        <div className="container mx-auto space-y-6 px-4 py-6">
            <PageHeader
                title="Notifications"
                description="Where alerts are delivered, and which of them are worth interrupting you for"
                badge={
                    <span className="rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-warning">
                        dev preview
                    </span>
                }
                actions={devices.length > 0 ? (
                    <Button variant="secondary" size="sm" className="gap-2" onClick={sendTest}>
                        <Send className="h-4 w-4" />
                        Send test
                    </Button>
                ) : null}
            />

            <StatTiles
                columns={3}
                tiles={[
                    {
                        label: 'Registered devices',
                        value: devices.length,
                        icon: Smartphone,
                        tone: 'info',
                        hint: 'One subscription per browser, not per machine',
                    },
                    {
                        label: 'Events on',
                        value: enabledEvents,
                        icon: Bell,
                        tone: enabledEvents === 0 ? 'warning' : 'accent',
                        hint: `Of ${NOTIFICATION_EVENTS.length} available`,
                    },
                    {
                        label: 'Browser permission',
                        value: permissionTile.value,
                        icon: permission === 'denied' ? ShieldOff : BellRing,
                        tone: permissionTile.tone,
                        hint: 'Granted per site, and remembered by the browser',
                    },
                ]}
            />

            {loading ? (
                <div className="py-12 text-center text-muted-foreground">
                    <p>Loading notification settings...</p>
                </div>
            ) : (
                <>
                    <AlertStrip alerts={alerts} />

                    {/* The master control. Off, it is the call to action the page
                        exists for; on, it collapses to a status row. */}
                    <section
                        className={cn(
                            'gradient-card mac-squircle relative overflow-hidden rounded-2xl border',
                            enabled ? 'border-accent/30' : 'border-hairline'
                        )}
                        aria-label="Push notifications"
                    >
                        {/* Lit only when it is actually on, so the state is
                            legible from the far side of the page. */}
                        {enabled ? (
                            <div aria-hidden className="pp-bloom pointer-events-none absolute inset-0" />
                        ) : null}

                        <div className="relative flex flex-col gap-8 p-6 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-center lg:gap-10">
                            <div className="flex min-w-0 items-start gap-4">
                                <span
                                    aria-hidden
                                    className={cn(
                                        'mac-squircle flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] border',
                                        enabled
                                            ? 'border-accent/30 bg-accent/12 text-accent shadow-[0_0_30px_hsl(var(--accent)/0.32)]'
                                            : 'border-hairline bg-white/[0.06] text-muted-foreground'
                                    )}
                                >
                                    {enabled ? (
                                        <BellRing className="animate-bell h-7 w-7" />
                                    ) : (
                                        <BellOff className="h-7 w-7" />
                                    )}
                                </span>

                                <div className="min-w-0">
                                    <h2 className="text-xl font-semibold tracking-[-0.022em] text-foreground">
                                        {enabled ? 'This browser is registered' : 'Notifications are off here'}
                                    </h2>
                                    <p className="mt-1 max-w-lg text-[13px] text-muted-foreground">
                                        {enabled
                                            ? devices.length > 1
                                                ? `Delivering to this browser and ${devices.length - 1} other device${devices.length === 2 ? '' : 's'}.`
                                                : 'Delivering to this browser. No other device is registered.'
                                            : blocked
                                                ? 'The browser is blocking notifications for this site. Allow them in its site settings and reload — this page cannot ask again.'
                                                : 'Get told the moment a node drops off the relay, and when it comes back — without keeping the dashboard open. Enabling asks the browser for permission and registers it.'}
                                    </p>

                                    <div className="mt-5 flex items-center gap-3">
                                        {enabled ? (
                                            <>
                                                <Switch
                                                    checked
                                                    disabled={busy}
                                                    onCheckedChange={disable}
                                                    aria-label="Turn notifications off for this browser"
                                                />
                                                <span className="text-[13px] font-medium text-foreground">
                                                    {busy ? 'Turning off...' : 'Delivery on'}
                                                </span>
                                            </>
                                        ) : (
                                            <Button
                                                size="lg"
                                                className="gap-2"
                                                onClick={enable}
                                                disabled={busy || blocked || unavailable}
                                            >
                                                {busy ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Bell className="h-4 w-4" />
                                                )}
                                                {busy ? 'Enabling...' : 'Enable notifications'}
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* The settings, made visible. */}
                            <div className="w-full min-w-0">
                                <p className="mb-2 text-[11px] font-medium text-muted-foreground">
                                    {enabled ? 'On your devices' : 'What you would see'}
                                </p>
                                <NotificationPreview
                                    key={`${testPulse}-${enabledEvents}`}
                                    preferences={preferences}
                                    enabled={enabled}
                                />
                            </div>
                        </div>
                    </section>

                    {/* Devices */}
                    <section className="space-y-3" aria-label="Registered devices">
                        <div className="flex items-end justify-between gap-4">
                            <div>
                                <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-foreground">
                                    Registered devices
                                </h2>
                                <p className="mt-0.5 text-[13px] text-muted-foreground">
                                    Every browser holding a push subscription for your account.
                                </p>
                            </div>
                            <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
                                {devices.length} registered
                            </span>
                        </div>

                        {devices.length === 0 ? (
                            <EmptyState
                                icon={Smartphone}
                                title="No devices registered"
                                description="Enable notifications on a browser and it appears here. Revoking a device only stops that one — the rest keep receiving."
                                action={!enabled ? (
                                    <Button
                                        className="gap-2"
                                        onClick={enable}
                                        disabled={busy || blocked || unavailable}
                                    >
                                        <Bell className="h-4 w-4" />
                                        Enable notifications
                                    </Button>
                                ) : null}
                            />
                        ) : (
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                {devices.map((device) => (
                                    <DeviceCard
                                        key={device.id}
                                        device={device}
                                        paused={!enabled && device.is_current}
                                        onRename={openRename}
                                        onRevoke={setRevokeTarget}
                                    />
                                ))}
                            </div>
                        )}
                    </section>

                    {/* Event preferences */}
                    <section className="space-y-3" aria-label="Event preferences">
                        <div className="flex items-end justify-between gap-4">
                            <div>
                                <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-foreground">
                                    What to notify me about
                                </h2>
                                <p className="mt-0.5 text-[13px] text-muted-foreground">
                                    Chosen here, but not stored yet — these reset on reload, and nothing
                                    dispatches on them automatically.
                                </p>
                            </div>
                            <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
                                {enabledEvents} of {NOTIFICATION_EVENTS.length} on
                            </span>
                        </div>

                        <EventPreferenceList
                            preferences={preferences}
                            disabled={devices.length === 0}
                            onToggle={toggleEvent}
                            onToggleCategory={toggleCategory}
                        />
                    </section>
                </>
            )}

            {/* Renaming a device. A plain Dialog rather than an AlertDialog:
                this asks for input, it does not warn about a consequence. */}
            <Dialog
                open={!!renameTarget}
                onOpenChange={(open) => { if (!open) setRenameTarget(null); }}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Rename device</DialogTitle>
                        <DialogDescription>
                            Display only — the label has no effect on where notifications go.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-2">
                        <Label htmlFor="device-label">Name</Label>
                        <Input
                            id="device-label"
                            value={renameValue}
                            maxLength={120}
                            autoFocus
                            placeholder={renameTarget ? `${renameTarget.browser} on this machine` : ''}
                            onChange={(event) => setRenameValue(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    void submitRename();
                                }
                            }}
                        />
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRenameTarget(null)}>
                            Cancel
                        </Button>
                        <Button
                            className="gap-2"
                            onClick={submitRename}
                            disabled={renaming || !renameValue.trim()}
                        >
                            {renaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
                            {renaming ? 'Saving...' : 'Save'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Revoking a subscription */}
            <AlertDialog open={!!revokeTarget} onOpenChange={(open) => !open && setRevokeTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Revoke this device?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {revokeTarget
                                ? revokeTarget.is_current
                                    ? `${revokeTarget.name} is the browser you are using now. It stops receiving notifications immediately, and you would have to enable them again here.`
                                    : `${revokeTarget.name} stops receiving notifications immediately. Your other devices are unaffected.`
                                : ''}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={revoke}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Revoke
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Turning off a recommended event */}
            <AlertDialog open={!!criticalTarget} onOpenChange={(open) => !open && setCriticalTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Turn off “{criticalTarget?.label}”?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {criticalTarget
                                ? `${criticalTarget.description} This is one of the events worth being interrupted for — with it off, you would only find out by opening the dashboard.`
                                : ''}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep it on</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmCriticalOff}>Turn off</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
