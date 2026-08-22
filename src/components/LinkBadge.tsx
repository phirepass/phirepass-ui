import type { LucideIcon } from 'lucide-react';

/**
 * The circular icon badge that fronts every entry in the footer link row
 * (Terms, Privacy, GitHub, Contact). Its own file so both `LegalLinks` and the
 * contact dialog's trigger can use it without importing each other.
 */
export function LinkBadge({ icon: Icon, children }: { icon?: LucideIcon; children?: React.ReactNode }) {
    return (
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-hairline bg-secondary/60 text-muted-foreground transition-colors group-hover:border-accent/50 group-hover:text-accent">
            {Icon ? <Icon className="h-3 w-3" /> : children}
        </span>
    );
}
