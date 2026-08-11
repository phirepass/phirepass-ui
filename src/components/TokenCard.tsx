import { useState } from 'react';
import {
    AlertTriangle,
    Eye,
    EyeOff,
    Info,
    MoreVertical,
    Trash2,
} from 'lucide-react';

import { StatusIndicator } from './StatusIndicator';
import { Button } from './ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useNow } from '@/hooks/use-now';
import {
    TOKEN_EXPIRY_WARNING_DAYS,
    daysUntil,
    formatAbsolute,
    formatAbsoluteTime,
    formatAge,
    formatLastUsed,
    formatRelative,
    lifetimeUsedPercent,
} from '@/lib/token-display';
import { cn } from '@/lib/utils';
import type { PatToken } from '@/types/pat-token';

interface TokenCardProps {
    token: PatToken;
    onRevoke?: (token: PatToken) => void;
    /** Opens the details dialog, which is where scopes live. */
    onViewDetails?: (token: PatToken) => void;
    /** Present only immediately after creation — the one moment the secret exists client-side. */
    revealedSecret?: string;
}

/**
 * Deliberately short: a token has far less to say than a node, and padding a card
 * out to match one only makes the list harder to scan. Scopes and the long-form
 * metadata live in the details dialog.
 */
export function TokenCard({ token, onRevoke, onViewDetails, revealedSecret }: TokenCardProps) {
    const [secretVisible, setSecretVisible] = useState(false);
    const now = useNow();

    const isActive = token.status === 'active';
    const remainingDays = daysUntil(token.expires_at, now);
    const expiringSoon = isActive
        && remainingDays !== null
        && remainingDays >= 0
        && remainingDays <= TOKEN_EXPIRY_WARNING_DAYS;

    const lifetimeUsed = lifetimeUsedPercent(token.created_at, token.expires_at, now);

    const maskedSecret = `pat_${token.token_id}.${'•'.repeat(24)}`;
    const secret = revealedSecret ?? null;
    const displayedSecret = secret && secretVisible ? secret : maskedSecret;

    const statusTone = token.status === 'active'
        ? 'text-success'
        : token.status === 'expired'
            ? 'text-warning'
            : 'text-destructive';

    return (
        <div
            className={cn(
                'group gradient-card border border-border rounded-xl p-4 bg-card flex flex-col gap-2.5',
                'transition-colors hover:border-primary/40',
                !isActive && 'opacity-70'
            )}
        >
            {/* Header */}
            <div className="flex items-center gap-2.5 min-w-0">
                <StatusIndicator isOnline={isActive} size="sm" />
                <button
                    type="button"
                    onClick={() => onViewDetails?.(token)}
                    className="min-w-0 flex-1 truncate rounded text-left text-sm font-semibold text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    {token.name}
                </button>
                <span className={cn('shrink-0 text-[11px] font-medium capitalize', statusTone)}>
                    {token.status}
                </span>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 rounded-full border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-secondary/60 hover:text-foreground"
                            aria-label={`Open actions for ${token.name}`}
                        >
                            <MoreVertical className="w-4 h-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        align="end"
                        className="w-52 rounded-xl border-border/70 bg-popover/95 p-2 shadow-xl backdrop-blur"
                    >
                        <DropdownMenuItem onClick={() => onViewDetails?.(token)}>
                            <Info className="mr-2 w-4 h-4" />
                            View details
                        </DropdownMenuItem>
                        {secret ? (
                            <DropdownMenuItem onClick={() => setSecretVisible((v) => !v)}>
                                {secretVisible ? (
                                    <EyeOff className="mr-2 w-4 h-4" />
                                ) : (
                                    <Eye className="mr-2 w-4 h-4" />
                                )}
                                {secretVisible ? 'Hide token' : 'Reveal token'}
                            </DropdownMenuItem>
                        ) : null}
                        {isActive && onRevoke ? (
                            <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    onClick={() => onRevoke(token)}
                                    className="text-destructive focus:text-destructive"
                                >
                                    <Trash2 className="mr-2 w-4 h-4" />
                                    Revoke token
                                </DropdownMenuItem>
                            </>
                        ) : null}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Token value */}
            <Tooltip>
                <TooltipTrigger asChild>
                    <p className="truncate font-mono text-xs text-muted-foreground">{displayedSecret}</p>
                </TooltipTrigger>
                <TooltipContent>
                    {secret
                        ? 'The full token — record it now, it is never shown again.'
                        : 'Only the token ID is stored; the secret is shown once, at creation.'}
                </TooltipContent>
            </Tooltip>

            {/* Lifetime. A token that never expires has no lifetime to spend, so
                the bar is omitted rather than drawn at an arbitrary zero. */}
            {lifetimeUsed !== null ? (
                <Tooltip>
                    <TooltipTrigger asChild>
                        <div className="h-1 overflow-hidden rounded-full bg-secondary">
                            <div
                                className={cn(
                                    'h-full rounded-full transition-all duration-500',
                                    expiringSoon ? 'bg-warning' : 'bg-accent'
                                )}
                                style={{ width: `${lifetimeUsed}%` }}
                            />
                        </div>
                    </TooltipTrigger>
                    <TooltipContent>
                        {lifetimeUsed.toFixed(0)}% of this token&apos;s validity window has elapsed
                    </TooltipContent>
                </Tooltip>
            ) : null}

            {/* The two dates that answer "where is this token in its life?" are
                labelled and given their own row — unlabelled ages next to an
                expiry read as three interchangeable timestamps. */}
            <dl className="grid grid-cols-2 gap-x-3 border-t border-border/40 pt-2 text-[11px]">
                <div className="min-w-0">
                    <dt className="text-muted-foreground/70">Created</dt>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <dd className="truncate font-mono text-foreground">
                                {formatAge(token.created_at, now)}
                            </dd>
                        </TooltipTrigger>
                        <TooltipContent>Created {formatAbsoluteTime(token.created_at)}</TooltipContent>
                    </Tooltip>
                </div>
                <div className="min-w-0">
                    <dt className="text-muted-foreground/70">Last used</dt>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <dd
                                className={cn(
                                    'truncate font-mono',
                                    token.last_used_at ? 'text-foreground' : 'text-muted-foreground/60'
                                )}
                            >
                                {formatLastUsed(token.last_used_at, now)}
                            </dd>
                        </TooltipTrigger>
                        <TooltipContent>
                            {token.last_used_at
                                ? `An agent last authenticated with this token on ${formatAbsoluteTime(token.last_used_at)}`
                                : 'No agent has ever authenticated with this token'}
                        </TooltipContent>
                    </Tooltip>
                </div>
            </dl>

            {/* Only when there is an expiry to report. A token that never expires
                has no deadline to announce, and a line saying so is a row of card
                spent restating the absence of news. */}
            {token.expires_at ? (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className={cn('flex items-center gap-1 font-mono', expiringSoon && 'text-warning')}>
                                {expiringSoon ? <AlertTriangle className="h-3 w-3" /> : null}
                                expires {formatRelative(token.expires_at, now)}
                            </span>
                        </TooltipTrigger>
                        <TooltipContent>{formatAbsolute(token.expires_at)}</TooltipContent>
                    </Tooltip>
                </div>
            ) : null}
        </div>
    );
}
