import { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface PageHeaderProps {
    title: string;
    description?: string;
    /** Rendered to the right of the title on desktop, below it on mobile. */
    actions?: ReactNode;
    /** Small pill shown next to the title, e.g. a "Dev preview" marker. */
    badge?: ReactNode;
    className?: string;
}

/**
 * The title block every dashboard page opens with. Extracted so Tokens, Uptime,
 * and anything added later inherit the same rhythm as the Nodes page rather
 * than each re-deriving the spacing by eye.
 */
export function PageHeader({ title, description, actions, badge, className }: PageHeaderProps) {
    return (
        <div className={cn('flex flex-col md:flex-row md:items-center md:justify-between gap-4', className)}>
            <div className="min-w-0">
                <div className="flex items-center gap-3">
                    <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.024em] text-foreground">{title}</h1>
                    {badge}
                </div>
                {description ? (
                    <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>
                ) : null}
            </div>
            {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
    );
}
