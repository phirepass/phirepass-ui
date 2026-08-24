'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, BellOff, BellRing, Loader2, Pencil, Send, Smartphone } from 'lucide-react';
import { toast } from 'sonner';

import { AlertStrip, type AlertEntry } from '@/components/AlertStrip';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { useDemoMode } from '@/components/DemoModeProvider';
import { useRuntimeConfig } from '@/components/RuntimeConfigProvider';
import { DEMO_CURRENT_ENDPOINT_HASH } from '@/lib/demo/fixtures';
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
    NOTIFICATION_CHANNEL_LABELS,
    NOTIFICATION_EVENTS,
    type DevicePlatform,
    type NotificationChannel,
    type NotificationCategory,
    type NotificationEventDefinition,
    type NotificationPreferences,
    type RegisteredDevice,
    type WebhookEndpoint,
} from '@/types/notification';

import { ChannelRow } from './ChannelRow';
import { DeviceCard } from './DeviceCard';
import { EventPreferenceList } from './EventPreferenceList';
import { NotificationPreview } from './NotificationPreview';
import { WebhookChannel } from './WebhookChannel';
import {
    DESTINATION_CARD_MIN_HEIGHT,
    detectCurrentDevice,
    isStaleDevice,
} from './notification-display';

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

/** The count beside a tab label. Muted, so the label stays the thing read first. */
function ChannelCount({ value }: { value: number }) {
    return (
        <span className="rounded-full bg-white/[0.08] px-1.5 text-[11px] tabular-nums text-muted-foreground">
            {value}
        </span>
    );
}

export default function NotificationsPage() {
    const { config } = useRuntimeConfig();
    const vapidPublicKey = config.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

    /**
     * Demo mode takes the browser out of the loop entirely.
     *
     * Everything else on this page is a fetch, which `DemoModeProvider` already
     * answers from the fixture. Push is the exception: `subscribe()`,
     * `getSubscription()` and `unsubscribe()` talk to the browser and to a real
     * push service, and none of that can be intercepted. Left alone, opening
     * this page in a demo would raise a permission prompt on stage and leave a
     * real registration on a borrowed laptop — so while the demo is on, the
     * three calls below are skipped and the fixture's own device stands in.
     */
    const demo = useDemoMode();

    const [loading, setLoading] = useState(true);
    /** Which channel's destinations are on screen. */
    const [channel, setChannel] = useState<NotificationChannel>('web.push');
    const [devices, setDevices] = useState<RegisteredDevice[]>([]);
    /**
    * Mirrored up from `WebhookChannel`, which owns them. The page needs the
    * count for its summary strip and for one question the channels cannot
    * answer separately: whether the account has any destination at all, which
    * is what decides if the event switches decide anything.
    */
    const [webhooks, setWebhooks] = useState<WebhookEndpoint[]>([]);
    const [preferences, setPreferences] = useState<NotificationPreferences>(createDefaultPreferences);

    /** Resolved in an effect, because both depend on `window`. */
    const [support, setSupport] = useState<PushSupport>('ok');
    const [permission, setPermission] = useState<NotificationPermission>('default');
    /** False when the server has no VAPID keys, which makes the whole page inert. */
    const [configured, setConfigured] = useState(true);

    const [busy, setBusy] = useState(false);
    /** Bumped to remount the preview, which replays its arrival animation. */
    const [testPulse, setTestPulse] = useState(0);
    /** Bumped to make the webhook section re-read its rows after a shared test. */
    const [webhookPulse, setWebhookPulse] = useState(0);
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
        const subscription = demo ? null : await currentSubscription();
        const currentHash = demo
            ? DEMO_CURRENT_ENDPOINT_HASH
            : subscription ? await hashEndpoint(subscription.endpoint) : null;

        setConfigured(payload.configured !== false);
        setDevices((payload.devices ?? []).map((row) => toDevice(row, currentHash)));
    }, [demo]);

    const loadPreferences = useCallback(async (): Promise<NotificationPreferences | null> => {
        const response = await fetch('/api/notifications/preferences', { credentials: 'include' });
        if (!response.ok) {
            throw new Error(`preferences ${response.status}`);
        }
        const payload = await response.json() as { preferences?: NotificationPreferences };
        return payload.preferences ?? null;
    }, []);

    /**
    * Writes the whole set, optimistically.
    *
    * The switch moves first because a toggle that waits on a round trip feels
    * broken, and rolls back to `previous` if the write fails — leaving it in
    * the new position after a failed save would be a lie about what is stored.
    */
    const persist = useCallback(async (
        next: NotificationPreferences,
        previous: NotificationPreferences,
    ) => {
        setPreferences(next);

        try {
            const response = await fetch('/api/notifications/preferences', {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ preferences: next }),
            });
            if (!response.ok) {
                throw new Error(`preferences ${response.status}`);
            }

            // The server resolves against the catalogue, so take its answer
            // rather than assuming ours matched.
            const payload = await response.json() as { preferences?: NotificationPreferences };
            if (payload.preferences) setPreferences(payload.preferences);
        } catch (error) {
            console.warn('[notifications] failed to save preferences', error);
            setPreferences(previous);
            toast.error('Could not save your preferences');
        }
    }, []);

    useEffect(() => {
        let disposed = false;

        const load = async () => {
            // A presenter's browser may have push blocked, or none at all;
            // neither is a fact about the fleet being shown.
            setSupport(demo ? 'ok' : pushSupport());
            setPermission(demo ? 'granted' : permissionState());

            try {
                // Both, together: a half-loaded page that shows real devices
                // beside default preferences looks like the saved ones were lost.
                const [, saved] = await Promise.all([refresh(), loadPreferences()]);
                if (!disposed && saved) setPreferences(saved);
            } catch (error) {
                console.warn('[notifications] failed to load', error);
                if (!disposed) {
                    toast.error('Could not load your notification settings');
                }
            } finally {
                if (!disposed) setLoading(false);
            }
        };

        void load();
        return () => { disposed = true; };
    }, [refresh, loadPreferences, demo]);

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

    /**
    * Any destination at all, on either channel. The event switches are about
    * *what* is worth sending, so they only mean something once there is
    * somewhere for it to go — and a browser that is not subscribed is no
    * reason to grey them out if a webhook is registered.
    */
    const destinations = devices.length + webhooks.length;
    const activeWebhooks = useMemo(
        () => webhooks.filter((endpoint) => endpoint.enabled).length,
        [webhooks],
    );

    // Stable, because `WebhookChannel` calls it from inside the effect that
    // fetches: an inline arrow here would be a new dependency on every render
    // and would have that effect refetch in a loop.
    const handleEndpoints = useCallback((rows: WebhookEndpoint[]) => setWebhooks(rows), []);

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

        if (destinations > 0 && enabledEvents === 0) {
            entries.push({
                id: 'no-events',
                level: 'warning',
                title: 'No events are selected',
                message: 'Destinations are registered on this account, but nothing is set to trigger a notification to them.',
                tag: '0 events',
            });
        }

        // Endpoints that answered badly the last time something was sent. One
        // entry for the lot: a strip with six near-identical rows is a strip
        // nobody reads.
        const failing = webhooks.filter((endpoint) => (
            endpoint.enabled
            && endpoint.last_sent_at !== null
            && (endpoint.last_status === null || endpoint.last_status < 200 || endpoint.last_status >= 300)
        ));
        if (failing.length > 0) {
            entries.push({
                id: 'webhooks-failing',
                level: 'warning',
                title: failing.length === 1
                    ? `${failing[0].name} is not accepting deliveries`
                    : `${failing.length} webhook endpoints are not accepting deliveries`,
                message: failing.length === 1
                    ? failing[0].last_error ?? 'The last delivery to it did not succeed.'
                    : 'Their last delivery did not succeed. Testing one shows what its receiver answers.',
                tag: 'webhook',
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
    }, [support, configured, vapidPublicKey, blocked, destinations, enabledEvents, devices, webhooks]);

    const enable = async () => {
        setBusy(true);
        try {
            const subscription = demo ? null : await subscribe(vapidPublicKey);
            if (!demo) setPermission(permissionState());

            if (!demo && !subscription) {
                toast.error('Notifications were not allowed', {
                    description: 'The browser will not ask again — allow them in its site settings.',
                });
                return;
            }

            // `toJSON()` rather than reading `.keys`: the keys live on the
            // subscription as an opaque getter, and toJSON is the documented way
            // to get the base64url pair the server needs.
            const identity = detectCurrentDevice();
            // No subscription in a demo, so no endpoint and no keys to send —
            // the fixture restores its own row from the label alone.
            const json = subscription?.toJSON();

            const response = await fetch('/api/notifications/devices', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    endpoint: subscription?.endpoint,
                    keys: json?.keys,
                    label: identity.name,
                    platform: identity.platform,
                    browser: identity.browser,
                }),
            });

            if (!response.ok) {
                // The browser now holds a subscription the server does not know
                // about; dropping it keeps the two in step.
                if (!demo) await unsubscribeCurrent();
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

            if (!demo) await unsubscribeCurrent();
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
            if (target.is_current && !demo) {
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

    /**
    * Fires a real notification at every destination on the account, on both
    * channels at once.
    *
    * The two halves are reported separately rather than added together: "3
    * delivered" across two phones and a Slack relay would hide that the relay
    * was the one that refused, and knowing *which* channel is broken is the
    * entire reason to press this.
    */
    const sendTest = async () => {
        setTestPulse((n) => n + 1);
        try {
            const response = await fetch('/api/notifications/test', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channel: 'all' }),
            });
            if (!response.ok) {
                throw new Error(`test ${response.status}`);
            }

            const outcome = await response.json() as {
                push: { sent: number; pruned: number };
                webhooks: { sent: number; failed: number; skipped: number };
            };

            if (outcome.push.pruned > 0) {
                await refresh();
            }
            // The endpoints now carry a new status and a new timestamp.
            setWebhookPulse((n) => n + 1);

            const parts: string[] = [];
            if (devices.length > 0) {
                parts.push(`${outcome.push.sent} of ${devices.length} device${devices.length === 1 ? '' : 's'}`);
            }
            if (activeWebhooks > 0) {
                parts.push(`${outcome.webhooks.sent} of ${activeWebhooks} endpoint${activeWebhooks === 1 ? '' : 's'}`);
            }

            const delivered = outcome.push.sent + outcome.webhooks.sent;
            const description = [
                outcome.push.pruned > 0 ? `${outcome.push.pruned} dead subscription(s) removed.` : null,
                outcome.webhooks.skipped > 0 ? `${outcome.webhooks.skipped} paused endpoint(s) skipped.` : null,
            ].filter(Boolean).join(' ');

            if (delivered === 0) {
                toast.error('Nothing accepted the test', {
                    description: description || 'No destination took the delivery.',
                });
                return;
            }

            toast.success(`Test delivered to ${parts.join(' and ')}`, {
                description: description || 'It should arrive in a moment.',
            });
        } catch (error) {
            console.warn('[notifications] test failed', error);
            toast.error('Could not send the test notification');
        }
    };

    const applyToggle = (event: NotificationEventDefinition, next: boolean) => {
        void persist({ ...preferences, [event.id]: next }, preferences);
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
        const updated = { ...preferences };
        for (const event of NOTIFICATION_EVENTS) {
            if (event.category === category) {
                updated[event.id] = next;
            }
        }
        void persist(updated, preferences);
    };

    return (
        <div className="container mx-auto space-y-6 px-4 py-6">
            <PageHeader
                title="Notifications"
                description="Two ways an alert can reach you, and which alerts are worth interrupting you for"
                actions={destinations > 0 ? (
                    <Button variant="secondary" size="sm" className="gap-2" onClick={sendTest}>
                        <Send className="h-4 w-4" />
                        Send test
                    </Button>
                ) : null}
            />

            {loading ? (
                <div className="py-12 text-center text-muted-foreground">
                    <p>Loading notification settings...</p>
                </div>
            ) : (
                <>
                    <AlertStrip alerts={alerts} />

                    {/*
                        Destinations, one channel at a time.

                        The two used to sit one under the other, each with its
                        own header, count and status panel — which meant the page
                        opened on four headings before a single thing you could
                        act on. Tabs make the choice explicit and put the counts
                        where the choice is made, so whichever channel you came
                        here for starts at the top of the card rather than
                        halfway down the page.
                    */}
                    <section className="space-y-3" aria-label="Destinations">
                        <Tabs value={channel} onValueChange={(next) => setChannel(next as NotificationChannel)}>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-foreground">
                                    Destinations
                                </h2>

                                <TabsList>
                                    <TabsTrigger value="web.push" className="gap-2">
                                        {NOTIFICATION_CHANNEL_LABELS['web.push']}
                                        <ChannelCount value={devices.length} />
                                    </TabsTrigger>
                                    <TabsTrigger value="webhook" className="gap-2">
                                        {NOTIFICATION_CHANNEL_LABELS.webhook}
                                        <ChannelCount value={webhooks.length} />
                                    </TabsTrigger>
                                </TabsList>
                            </div>

                            <TabsContent value="web.push" className="mt-3 space-y-3">
                                {/* The master control, as one row rather than a
                                    panel: on, it is a status line; off, the
                                    button on the right is the whole point. */}
                                <ChannelRow
                                    channel="web.push"
                                    icon={enabled ? BellRing : BellOff}
                                    lit={enabled}
                                    title={enabled
                                        ? `Registered here${devices.length > 1 ? ` and on ${devices.length - 1} other device${devices.length === 2 ? '' : 's'}` : ''}`
                                        : blocked
                                            ? 'Blocked in this browser'
                                            : 'Not enabled in this browser'}
                                    action={enabled ? (
                                        <>
                                            <span className="text-xs text-muted-foreground">
                                                {busy ? 'Turning off...' : 'Delivery on'}
                                            </span>
                                            <Switch
                                                checked
                                                disabled={busy}
                                                onCheckedChange={disable}
                                                aria-label="Turn notifications off for this browser"
                                            />
                                        </>
                                    ) : (
                                        <Button
                                            size="sm"
                                            className="gap-2"
                                            onClick={enable}
                                            disabled={busy || blocked || unavailable}
                                        >
                                            {busy ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <Bell className="h-4 w-4" />
                                            )}
                                            {busy ? 'Enabling...' : 'Enable'}
                                        </Button>
                                    )}
                                />

                                {/* One card tall either way, so the empty state
                                    and the grid occupy the same floor and the
                                    page does not jump when devices arrive. */}
                                <div className={cn('flex flex-col', DESTINATION_CARD_MIN_HEIGHT)}>
                                    {devices.length === 0 ? (
                                        // The preview earns its place here and only
                                        // here: with nothing registered, it is the
                                        // one thing on screen that says what the
                                        // switch above actually buys you.
                                        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center">
                                            <EmptyState
                                                icon={Smartphone}
                                                title="No devices registered"
                                                description="Enable notifications above and this browser appears here. Revoking one device never affects the others."
                                            />
                                            <div className="hidden lg:block">
                                                <p className="mb-2 text-[11px] font-medium text-muted-foreground">
                                                    What you would see
                                                </p>
                                                <NotificationPreview
                                                    key={`${testPulse}-${enabledEvents}`}
                                                    preferences={preferences}
                                                    enabled={enabled}
                                                />
                                            </div>
                                        </div>
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
                                </div>
                            </TabsContent>

                            <TabsContent value="webhook" className="mt-3">
                                <WebhookChannel
                                    onEndpointsChange={handleEndpoints}
                                    refreshSignal={webhookPulse}
                                />
                            </TabsContent>
                        </Tabs>
                    </section>

                    {/* Events, once — they are the same list whichever channel
                        is showing above, which is why they are outside the tabs
                        rather than repeated inside each one. */}
                    <section className="space-y-3" aria-label="Event preferences">
                        <div className="flex items-center justify-between gap-4">
                            <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-foreground">
                                Events
                            </h2>
                            <span className="shrink-0 text-[11px] text-muted-foreground">
                                Sent to every destination above
                            </span>
                        </div>

                        <EventPreferenceList
                            preferences={preferences}
                            disabled={destinations === 0}
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
