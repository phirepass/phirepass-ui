'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    Bell,
    BellOff,
    BellRing,
    Loader2,
    Send,
    Smartphone,
} from 'lucide-react';
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
import { cn } from '@/lib/utils';
import {
    MOCK_DELIVERED_LAST_7_DAYS,
    createCurrentDevice,
    createDefaultPreferences,
    createMockDevices,
} from '@/data/mockNotifications';
import {
    NOTIFICATION_EVENTS,
    type NotificationCategory,
    type NotificationEventDefinition,
    type NotificationPreferences,
    type RegisteredDevice,
} from '@/types/notification';

import { DeviceCard } from './DeviceCard';
import { NotificationPreview } from './NotificationPreview';
import { EventPreferenceList } from './EventPreferenceList';
import { detectCurrentDevice, isStaleDevice } from './notification-display';

/** Matches the other mock-backed surfaces, so the loading state is real enough to see. */
const FAKE_LATENCY_MS = 380;

export default function NotificationsPage() {
    const [loading, setLoading] = useState(true);
    const [devices, setDevices] = useState<RegisteredDevice[]>([]);
    const [preferences, setPreferences] = useState<NotificationPreferences>(createDefaultPreferences);

    /**
     * Account-wide delivery. Off on arrival on purpose: the state worth
     * designing for is the one a first-time visitor lands on, and it is the
     * only place the enable button lives.
     */
    const [enabled, setEnabled] = useState(false);
    const [enabling, setEnabling] = useState(false);

    /** Bumped to remount the preview, which replays its arrival animation. */
    const [testPulse, setTestPulse] = useState(0);
    const [revokeTarget, setRevokeTarget] = useState<RegisteredDevice | null>(null);
    const [criticalTarget, setCriticalTarget] = useState<NotificationEventDefinition | null>(null);

    useEffect(() => {
        let disposed = false;

        const seed = async () => {
            await new Promise((resolve) => { setTimeout(resolve, FAKE_LATENCY_MS); });
            if (disposed) return;
            setDevices(createMockDevices());
            setLoading(false);
        };

        void seed();
        return () => { disposed = true; };
    }, []);

    const currentDevice = useMemo(
        () => devices.find((device) => device.is_current) ?? null,
        [devices]
    );

    const enabledEvents = useMemo(
        () => NOTIFICATION_EVENTS.filter((event) => preferences[event.id]).length,
        [preferences]
    );

    const alerts = useMemo<AlertEntry[]>(() => {
        if (!enabled) {
            return [];
        }

        const entries: AlertEntry[] = [];

        if (devices.length === 0) {
            entries.push({
                id: 'no-devices',
                level: 'error',
                title: 'Nothing is registered to receive notifications',
                message: 'Delivery is on, but every subscription has been revoked. Enable it on this device to start receiving again.',
                tag: 'no devices',
            });
        } else if (!currentDevice) {
            entries.push({
                id: 'not-this-device',
                level: 'info',
                title: 'This browser is not registered',
                message: 'Other devices still receive notifications; this one will not until you register it.',
                tag: 'this browser',
            });
        }

        if (enabledEvents === 0) {
            entries.push({
                id: 'no-events',
                level: 'warning',
                title: 'No events are selected',
                message: 'Notifications are on, but nothing is set to trigger one. Turn on at least one event below.',
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
    }, [enabled, devices, currentDevice, enabledEvents]);

    const enable = async () => {
        setEnabling(true);
        // Stands in for the permission prompt plus the subscribe round-trip. No
        // real `Notification.requestPermission()` call: there is nothing behind
        // this page to deliver anything, and asking for a permission the product
        // cannot yet use spends it for good — a denial is sticky and the browser
        // will not ask again.
        await new Promise((resolve) => { setTimeout(resolve, FAKE_LATENCY_MS); });

        setDevices((prev) => (
            prev.some((device) => device.is_current)
                ? prev
                : [createCurrentDevice(detectCurrentDevice()), ...prev]
        ));
        setEnabled(true);
        setEnabling(false);
        setTestPulse((n) => n + 1);
        toast.success('Notifications enabled', {
            description: 'This browser is now registered to receive them.',
        });
    };

    const disable = () => {
        setEnabled(false);
        toast('Notifications paused', {
            description: 'Registered devices are kept, but nothing will be delivered.',
        });
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

    const revoke = () => {
        if (!revokeTarget) return;
        const target = revokeTarget;
        setDevices((prev) => prev.filter((device) => device.id !== target.id));
        setRevokeTarget(null);
        toast.success(`${target.name} will no longer receive notifications`);
    };

    const sendTest = () => {
        setTestPulse((n) => n + 1);
        const destination = currentDevice ? currentDevice.name : `${devices.length} device(s)`;
        toast('Node offline — synology', {
            description: `Test notification delivered to ${destination}.`,
            icon: <BellRing className="h-4 w-4" />,
        });
    };

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
                actions={enabled ? (
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
                        label: 'Delivered · 7 days',
                        value: MOCK_DELIVERED_LAST_7_DAYS,
                        icon: Send,
                        tone: 'violet',
                        hint: 'Mock figure — nothing is delivered yet',
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
                                        {enabled ? 'Notifications are on' : 'Notifications are off'}
                                    </h2>
                                    <p className="mt-1 max-w-lg text-[13px] text-muted-foreground">
                                        {enabled
                                            ? currentDevice
                                                ? `Delivering to ${devices.length} device${devices.length === 1 ? '' : 's'}, including this browser.`
                                                : `Delivering to ${devices.length} device${devices.length === 1 ? '' : 's'}. This browser is not one of them.`
                                            : 'Get told the moment a node drops off the relay, and when it comes back — without keeping the dashboard open. Enabling registers this browser and starts delivery to every device below.'}
                                    </p>

                                    <div className="mt-5 flex items-center gap-3">
                                        {enabled ? (
                                            <>
                                                <Switch
                                                    checked
                                                    onCheckedChange={disable}
                                                    aria-label="Turn notifications off"
                                                />
                                                <span className="text-[13px] font-medium text-foreground">
                                                    Delivery on
                                                </span>
                                            </>
                                        ) : (
                                            <Button size="lg" className="gap-2" onClick={enable} disabled={enabling}>
                                                {enabling ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Bell className="h-4 w-4" />
                                                )}
                                                {enabling ? 'Enabling...' : 'Enable notifications'}
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
                                    <Button className="gap-2" onClick={enable} disabled={enabling}>
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
                                        paused={!enabled}
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
                                    {enabled
                                        ? 'Applies to every registered device.'
                                        : 'Saved, but nothing is delivered while notifications are off.'}
                                </p>
                            </div>
                            <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
                                {enabledEvents} of {NOTIFICATION_EVENTS.length} on
                            </span>
                        </div>

                        <EventPreferenceList
                            preferences={preferences}
                            disabled={!enabled}
                            onToggle={toggleEvent}
                            onToggleCategory={toggleCategory}
                        />
                    </section>
                </>
            )}

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
