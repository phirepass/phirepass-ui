import { AlertTriangle, KeyRound } from 'lucide-react';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { useNow } from '@/hooks/use-now';
import {
    TOKEN_EXPIRY_WARNING_DAYS,
    daysUntil,
    formatAbsolute,
    formatAbsoluteTime,
    formatRelative,
} from '@/lib/token-display';
import { cn } from '@/lib/utils';
import type { PatToken, PatTokenScope } from '@/types/pat-token';

/**
 * One hue per scope so a grant can be read without parsing its string, mirroring
 * how the node cards tint each service kind. Written out in full because
 * Tailwind cannot resolve class names built at runtime.
 */
const SCOPE_TINTS: Record<PatTokenScope, { icon: string; tile: string }> = {
    'server:register': { icon: 'text-accent', tile: 'border-accent/35 bg-accent/10' },
};

const FALLBACK_SCOPE_TINT = { icon: 'text-info', tile: 'border-info/35 bg-info/10' };

const SCOPE_LABELS: Record<PatTokenScope, string> = {
    'server:register': 'Register a node',
};

const SCOPE_DESCRIPTIONS: Record<PatTokenScope, string> = {
    'server:register': 'Lets an agent enrol itself with a server exactly once.',
};

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
    return (
        <div className="flex items-baseline justify-between gap-4 border-b border-border/40 py-2 last:border-0">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
            <span className={cn('min-w-0 truncate font-mono text-sm text-foreground', tone)}>{value}</span>
        </div>
    );
}

interface TokenDetailsDialogProps {
    token: PatToken | null;
    onClose: () => void;
}

export function TokenDetailsDialog({ token, onClose }: TokenDetailsDialogProps) {
    const now = useNow();

    if (!token) return null;

    const remainingDays = daysUntil(token.expires_at, now);
    const expiringSoon = token.status === 'active'
        && remainingDays !== null
        && remainingDays >= 0
        && remainingDays <= TOKEN_EXPIRY_WARNING_DAYS;

    const scopes = token.scopes ?? [];

    const statusTone = token.status === 'active'
        ? 'text-success'
        : token.status === 'expired'
            ? 'text-warning'
            : 'text-destructive';

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="truncate">{token.name}</DialogTitle>
                    <DialogDescription className="font-mono text-xs break-all">
                        pat_{token.token_id}
                    </DialogDescription>
                </DialogHeader>

                {expiringSoon ? (
                    <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                        <p className="text-sm text-warning">
                            Expires {formatRelative(token.expires_at, now)} — issue a replacement before agents
                            using it stop enrolling.
                        </p>
                    </div>
                ) : null}

                <div className="rounded-lg border border-border bg-card/60 px-3 py-1">
                    <Row label="Status" value={token.status} tone={cn('capitalize', statusTone)} />
                    <Row label="Token ID" value={token.token_id} />
                    <Row label="Created" value={formatAbsoluteTime(token.created_at)} />
                    <Row
                        label="Last used"
                        value={formatAbsoluteTime(token.last_used_at)}
                        tone={token.last_used_at ? undefined : 'text-muted-foreground'}
                    />
                    <Row
                        label="Expires"
                        value={token.expires_at ? formatAbsolute(token.expires_at) : 'Never'}
                        tone={expiringSoon ? 'text-warning' : undefined}
                    />
                </div>

                <div>
                    <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs uppercase tracking-wider text-muted-foreground">Scopes</span>
                        <span className="font-mono text-[11px] text-muted-foreground/70">
                            {scopes.length} granted
                        </span>
                    </div>
                    <div className="space-y-2">
                        {scopes.length === 0 ? (
                            <div className="flex items-center gap-2.5 rounded-lg border border-dashed border-border/60 px-3 py-3 text-sm text-muted-foreground">
                                <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                                No scopes granted
                            </div>
                        ) : (
                            scopes.map((scope) => {
                                const tint = SCOPE_TINTS[scope] ?? FALLBACK_SCOPE_TINT;

                                return (
                                    <div
                                        key={scope}
                                        className={cn('flex items-start gap-3 rounded-lg border px-3 py-2.5', tint.tile)}
                                    >
                                        <KeyRound className={cn('mt-0.5 h-4 w-4 shrink-0', tint.icon)} />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium text-foreground">
                                                {SCOPE_LABELS[scope] ?? scope}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {SCOPE_DESCRIPTIONS[scope] ?? 'No description available.'}
                                            </p>
                                        </div>
                                        <span className="shrink-0 font-mono text-[11px] text-muted-foreground/70">
                                            {scope}
                                        </span>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
