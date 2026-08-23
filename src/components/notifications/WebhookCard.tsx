'use client';

import { Loader2, Pencil, Send, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { webhookHealth, type WebhookEndpoint } from '@/types/notification';

import {
    CHANNEL_STYLES,
    WEBHOOK_HEALTH_STYLES,
    describeWebhookDelivery,
    displayUrl,
    formatDate,
} from './notification-display';

interface WebhookCardProps {
    endpoint: WebhookEndpoint;
    /** True while this endpoint's test is in flight. */
    testing: boolean;
    onTest: (endpoint: WebhookEndpoint) => void;
    onEdit: (endpoint: WebhookEndpoint) => void;
    onToggle: (endpoint: WebhookEndpoint, next: boolean) => void;
    onDelete: (endpoint: WebhookEndpoint) => void;
}

/**
 * One endpoint, as a card in the same grid the device list uses.
 *
 * The two channels get the same card shape on purpose — they are the same kind
 * of thing, a place a notification can land — and differ in what fills it: a
 * device carries a platform and a check-in time, an endpoint carries a URL and
 * whatever its receiver last answered. The violet bloom is the channel's, not
 * the endpoint's, so a webhook card is tellable from a device card at a glance
 * even when both are scrolled past.
 */
export function WebhookCard({
    endpoint,
    testing,
    onTest,
    onEdit,
    onToggle,
    onDelete,
}: WebhookCardProps) {
    const channel = CHANNEL_STYLES.webhook;
    const Icon = channel.icon;
    const health = WEBHOOK_HEALTH_STYLES[webhookHealth(endpoint)];

    return (
        <article
            className={cn(
                'gradient-card mac-squircle group relative flex h-full min-h-[147px] flex-col overflow-hidden rounded-xl border',
                'transition-[box-shadow,border-color,opacity] duration-200 ease-mac hover:shadow-window-raised',
                endpoint.enabled
                    ? 'border-hairline hover:border-hairline-strong'
                    : 'border-hairline opacity-60'
            )}
        >
            <div
                aria-hidden
                className={cn(
                    'pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full blur-2xl',
                    'opacity-90 transition-opacity duration-300 ease-mac group-hover:opacity-100',
                    channel.bloom
                )}
            />

            <div className="relative flex flex-1 items-start justify-between gap-3 p-4">
                <div className="flex min-w-0 items-start gap-3">
                    <span
                        aria-hidden
                        className={cn(
                            'mac-squircle flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-hairline',
                            channel.well,
                            channel.tint
                        )}
                    >
                        <Icon className="h-5 w-5" />
                    </span>

                    <div className="min-w-0">
                        <p className="truncate font-medium tracking-[-0.01em] text-foreground">
                            {endpoint.name}
                        </p>

                        {/* Monospace, and truncated from the end: the host is the
                            part worth reading, the path rarely is. */}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <p className="truncate font-mono text-xs text-muted-foreground">
                                    {displayUrl(endpoint.url)}
                                </p>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-sm break-all font-mono text-xs">
                                {endpoint.url}
                            </TooltipContent>
                        </Tooltip>

                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <span
                                className={cn(
                                    'rounded-full border px-2 py-0.5 text-[10px] font-medium',
                                    health.border,
                                    health.well,
                                    health.tint
                                )}
                            >
                                {health.label}
                            </span>
                            {!endpoint.enabled ? (
                                <span className="rounded-full border border-hairline bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                    Paused
                                </span>
                            ) : null}
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span className="rounded-full border border-hairline bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                                        …{endpoint.secret_hint}
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                    The last four characters of this endpoint&apos;s signing secret.
                                    The secret itself was shown once, when it was created.
                                </TooltipContent>
                            </Tooltip>
                        </div>
                    </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-full border border-transparent text-muted-foreground transition-colors hover:border-hairline hover:text-foreground"
                                aria-label={`Send a test delivery to ${endpoint.name}`}
                                disabled={testing}
                                onClick={() => onTest(endpoint)}
                            >
                                {testing ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Send className="h-4 w-4" />
                                )}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                            Send a test delivery — works even while paused
                        </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-full border border-transparent text-muted-foreground transition-colors hover:border-hairline hover:text-foreground"
                                aria-label={`Edit ${endpoint.name}`}
                                onClick={() => onEdit(endpoint)}
                            >
                                <Pencil className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Edit name, URL, or rotate the secret</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-full border border-transparent text-muted-foreground transition-colors hover:border-hairline hover:text-destructive"
                                aria-label={`Remove ${endpoint.name}`}
                                onClick={() => onDelete(endpoint)}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Remove this endpoint</TooltipContent>
                    </Tooltip>
                </div>
            </div>

            <div className="relative mt-auto flex h-11 items-center justify-between gap-3 border-t border-hairline px-4">
                <span className="min-w-0 truncate text-[11px] text-muted-foreground">
                    {describeWebhookDelivery(endpoint)}
                </span>

                {/* The pause switch sits with the timestamps rather than in the
                    action row: it is a state, not a command, and the row above
                    is for things that happen when clicked. */}
                <div className="flex shrink-0 items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">
                        Added {formatDate(endpoint.created_at)}
                    </span>
                    <Switch
                        checked={endpoint.enabled}
                        onCheckedChange={(next) => onToggle(endpoint, next)}
                        aria-label={`${endpoint.enabled ? 'Pause' : 'Resume'} deliveries to ${endpoint.name}`}
                        className="scale-90"
                    />
                </div>
            </div>
        </article>
    );
}
