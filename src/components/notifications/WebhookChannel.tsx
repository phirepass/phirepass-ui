'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Webhook } from 'lucide-react';
import { toast } from 'sonner';

import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
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
import type { WebhookEndpoint } from '@/types/notification';

import { ChannelRow } from './ChannelRow';
import { DESTINATION_CARD_MIN_HEIGHT } from './notification-display';
import { WebhookCard } from './WebhookCard';
import { WebhookFormDialog, WebhookSecretDialog, type WebhookFormValues } from './WebhookDialog';

interface WebhookChannelProps {
    /**
    * Reports the current list upward. The page needs the count for its stat
    * tiles and for deciding whether the account has *any* destination at all,
    * which is the thing that makes the event switches meaningful — but nothing
    * above needs to own the CRUD, so it stays here.
    */
    onEndpointsChange: (endpoints: WebhookEndpoint[]) => void;
    /** Bumped by the page after an account-wide test, to pull in new statuses. */
    refreshSignal: number;
}

/**
 * The webhook half of the notifications page: everything about endpoints, from
 * the fetch to the dialogs.
 *
 * Split out rather than folded into `NotificationsPage` because it shares
 * nothing with the push half except the events both channels carry — the push
 * side is about permission and subscriptions, this side is about URLs and what
 * they answered — and one component holding both would be two unrelated state
 * machines in one file.
 */
export function WebhookChannel({ onEndpointsChange, refreshSignal }: WebhookChannelProps) {
    const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
    const [loading, setLoading] = useState(true);

    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<WebhookEndpoint | null>(null);
    const [submitting, setSubmitting] = useState(false);

    /** The secret to reveal, and whose it is. Both cleared together. */
    const [revealed, setRevealed] = useState<{ secret: string; name: string } | null>(null);

    const [deleteTarget, setDeleteTarget] = useState<WebhookEndpoint | null>(null);
    const [testingId, setTestingId] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        const response = await fetch('/api/notifications/webhooks', { credentials: 'include' });
        if (!response.ok) {
            throw new Error(`webhooks ${response.status}`);
        }

        const payload = await response.json() as { webhooks?: WebhookEndpoint[] };
        const rows = payload.webhooks ?? [];

        setEndpoints(rows);
        onEndpointsChange(rows);
    }, [onEndpointsChange]);

    useEffect(() => {
        let disposed = false;

        void (async () => {
            try {
                await refresh();
            } catch (error) {
                console.warn('[notifications] failed to load webhooks', error);
                if (!disposed) toast.error('Could not load your webhook endpoints');
            } finally {
                if (!disposed) setLoading(false);
            }
        })();

        return () => { disposed = true; };
    }, [refresh, refreshSignal]);

    /** Both the create and the edit path — they differ only in method and URL. */
    const submit = async (values: WebhookFormValues) => {
        const target = editing;
        setSubmitting(true);

        try {
            const response = await fetch(
                target ? `/api/notifications/webhooks/${target.id}` : '/api/notifications/webhooks',
                {
                    method: target ? 'PATCH' : 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(
                        target
                            ? { label: values.label || target.name, url: values.url, rotate_secret: values.rotate_secret }
                            : { label: values.label || undefined, url: values.url },
                    ),
                },
            );

            const payload = await response.json().catch(() => ({})) as {
                error?: string;
                secret?: string;
                webhook?: WebhookEndpoint;
            };

            if (!response.ok) {
                // The server's message is the specific one — "that URL is
                // already registered", "the URL has to be https" — and is worth
                // far more here than a generic failure toast.
                toast.error(payload.error ?? 'Could not save this endpoint');
                return;
            }

            await refresh();
            setFormOpen(false);
            setEditing(null);

            // A minted or rotated secret is the only thing that has to be acted
            // on before the dialog closes, so it takes over from the toast.
            if (payload.secret && payload.webhook) {
                setRevealed({ secret: payload.secret, name: payload.webhook.name });
            } else {
                toast.success(target ? 'Endpoint updated' : 'Endpoint added');
            }
        } catch (error) {
            console.warn('[notifications] webhook save failed', error);
            toast.error('Could not save this endpoint');
        } finally {
            setSubmitting(false);
        }
    };

    /**
    * Pausing and resuming, optimistically — the switch moves first and rolls
    * back on failure, matching how the event preferences behave.
    */
    const toggle = async (endpoint: WebhookEndpoint, next: boolean) => {
        setEndpoints((current) => current.map((row) => (
            row.id === endpoint.id ? { ...row, enabled: next } : row
        )));

        try {
            const response = await fetch(`/api/notifications/webhooks/${endpoint.id}`, {
                method: 'PATCH',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: next }),
            });
            if (!response.ok) {
                throw new Error(`toggle ${response.status}`);
            }
            await refresh();
        } catch (error) {
            console.warn('[notifications] webhook toggle failed', error);
            setEndpoints((current) => current.map((row) => (
                row.id === endpoint.id ? { ...row, enabled: endpoint.enabled } : row
            )));
            toast.error(`Could not ${next ? 'resume' : 'pause'} ${endpoint.name}`);
        }
    };

    const test = async (endpoint: WebhookEndpoint) => {
        setTestingId(endpoint.id);

        try {
            const response = await fetch(`/api/notifications/webhooks/${endpoint.id}/test`, {
                method: 'POST',
                credentials: 'include',
            });
            if (!response.ok) {
                throw new Error(`test ${response.status}`);
            }

            const delivery = await response.json() as {
                ok: boolean;
                status: number | null;
                error: string | null;
            };

            // The row now carries the outcome, so the card and the toast agree.
            await refresh();

            if (delivery.ok) {
                toast.success(`${endpoint.name} accepted the delivery`, {
                    description: `It answered HTTP ${delivery.status}.`,
                });
            } else {
                toast.error(`${endpoint.name} did not accept the delivery`, {
                    description: delivery.error ?? 'No response.',
                });
            }
        } catch (error) {
            console.warn('[notifications] webhook test failed', error);
            toast.error('Could not send the test delivery');
        } finally {
            setTestingId(null);
        }
    };

    const remove = async () => {
        if (!deleteTarget) return;
        const target = deleteTarget;
        setDeleteTarget(null);

        try {
            const response = await fetch(`/api/notifications/webhooks/${target.id}`, {
                method: 'DELETE',
                credentials: 'include',
            });
            if (!response.ok && response.status !== 404) {
                throw new Error(`delete ${response.status}`);
            }

            await refresh();
            toast.success(`${target.name} removed`);
        } catch (error) {
            console.warn('[notifications] webhook delete failed', error);
            toast.error(`Could not remove ${target.name}`);
        }
    };

    const openAdd = () => {
        setEditing(null);
        setFormOpen(true);
    };

    const openEdit = (endpoint: WebhookEndpoint) => {
        setEditing(endpoint);
        setFormOpen(true);
    };

    const delivering = endpoints.filter((endpoint) => endpoint.enabled).length;

    return (
        <div className="space-y-3">
            <ChannelRow
                channel="webhook"
                icon={Webhook}
                lit={delivering > 0}
                title={endpoints.length === 0
                    ? 'No endpoints registered'
                    : delivering === endpoints.length
                        ? `${endpoints.length} endpoint${endpoints.length === 1 ? '' : 's'} active`
                        : `${delivering} of ${endpoints.length} endpoints active`}
                action={(
                    <Button size="sm" className="gap-2" onClick={openAdd}>
                        <Plus className="h-4 w-4" />
                        Add endpoint
                    </Button>
                )}
            />

            {/* One card tall whatever is inside it — loading, empty, or a
                filled grid — so nothing below shifts when the fetch lands. */}
            <div className={cn('flex flex-col', DESTINATION_CARD_MIN_HEIGHT)}>
                {loading ? (
                    <p className="flex flex-1 items-center justify-center text-[13px] text-muted-foreground">
                        Loading endpoints...
                    </p>
                ) : endpoints.length === 0 ? (
                    // Not a second "no endpoints" — the row above already said
                    // that. What is left worth saying is what adding one does.
                    <EmptyState
                        icon={Webhook}
                        title="Add your first endpoint"
                        description="Every event you have switched on is POSTed to it as signed JSON — the same alerts your browsers get, delivered to a system instead of a person."
                    />
                ) : (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {endpoints.map((endpoint) => (
                            <WebhookCard
                                key={endpoint.id}
                                endpoint={endpoint}
                                testing={testingId === endpoint.id}
                                onTest={test}
                                onEdit={openEdit}
                                onToggle={toggle}
                                onDelete={setDeleteTarget}
                            />
                        ))}
                    </div>
                )}
            </div>

            <WebhookFormDialog
                open={formOpen}
                endpoint={editing}
                submitting={submitting}
                onClose={() => { setFormOpen(false); setEditing(null); }}
                onSubmit={submit}
            />

            <WebhookSecretDialog
                secret={revealed?.secret ?? null}
                name={revealed?.name ?? null}
                onClose={() => setRevealed(null)}
            />

            <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remove this endpoint?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {deleteTarget
                                ? `${deleteTarget.name} stops receiving deliveries immediately, and its signing secret is destroyed with it. Adding the URL back mints a new one, which the receiver would have to be updated with.`
                                : ''}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={remove}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Remove
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
