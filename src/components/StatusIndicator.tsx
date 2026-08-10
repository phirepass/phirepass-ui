import { cn } from '@/lib/utils';

/**
 * `pending` covers both "we have not heard back yet" and "the server has not
 * decided yet" — from the card's point of view they render the same, and neither
 * is an answer. It takes precedence over `isOnline` so a stale cached `true`
 * cannot show as live before the current response confirms it.
 */
interface StatusIndicatorProps {
    isOnline: boolean;
    pending?: boolean;
    pendingLabel?: string;
    size?: 'sm' | 'md' | 'lg';
    showLabel?: boolean;
}

export function StatusIndicator({
    isOnline,
    pending = false,
    pendingLabel = 'Checking',
    size = 'md',
    showLabel = false,
}: StatusIndicatorProps) {
    const sizeClasses = {
        sm: 'w-2 h-2',
        md: 'w-3 h-3',
        lg: 'w-4 h-4',
    };

    const dotClass = pending
        ? 'bg-warning/70 animate-pulse'
        : isOnline
            ? 'bg-success animate-pulse-glow text-success'
            : 'bg-muted-foreground/50';

    const labelClass = pending
        ? 'text-warning'
        : isOnline
            ? 'text-success'
            : 'text-muted-foreground';

    return (
        <div className="flex items-center gap-2">
            <div className={cn('rounded-full', sizeClasses[size], dotClass)} />
            {showLabel && (
                <span className={cn('text-xs font-medium', labelClass)}>
                    {pending ? pendingLabel : isOnline ? 'Online' : 'Offline'}
                </span>
            )}
        </div>
    );
}
