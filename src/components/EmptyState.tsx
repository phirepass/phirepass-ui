import { LucideIcon } from 'lucide-react';
import { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface EmptyStateProps {
    icon: LucideIcon;
    title: string;
    description?: string;
    action?: ReactNode;
    className?: string;
}

/**
 * Shown where a card grid would be. Dashed rather than solid so it reads as a
 * slot waiting to be filled instead of a card that failed to load.
 */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
    return (
        <div
            className={cn(
                'mac-squircle rounded-xl border border-dashed border-hairline-strong bg-white/[0.02] px-6 py-14 text-center',
                className
            )}
        >
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-hairline bg-white/[0.06] text-muted-foreground mac-squircle">
                <Icon className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-medium text-foreground">{title}</h3>
            {description ? (
                <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
            ) : null}
            {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
        </div>
    );
}
