import { Search, X } from 'lucide-react';
import { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface SearchBarProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    'aria-label'?: string;
    /** Filter chips or view toggles rendered on the trailing edge of the row. */
    children?: ReactNode;
    className?: string;
}

/**
 * The actions row that sits between a page's summary and its card grid — same
 * proportions as the Nodes page search so the pages line up scan-for-scan.
 */
export function SearchBar({
    value,
    onChange,
    placeholder = 'Search...',
    'aria-label': ariaLabel,
    children,
    className,
}: SearchBarProps) {
    return (
        <div className={cn('flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between', className)}>
            <div className="relative flex-1 w-full sm:max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                    type="text"
                    placeholder={placeholder}
                    aria-label={ariaLabel ?? placeholder}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="h-9 w-full rounded-full border border-hairline bg-input/80 pl-9 pr-9 text-sm shadow-sunken transition-[box-shadow,border-color] duration-150 ease-mac placeholder:text-muted-foreground focus:border-accent/40 focus:outline-none focus:ring-[3px] focus:ring-ring/45"
                />
                {value ? (
                    <button
                        type="button"
                        aria-label="Clear search"
                        onClick={() => onChange('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition-colors hover:bg-white/[0.1] hover:text-foreground"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                ) : null}
            </div>
            {children ? <div className="flex items-center gap-2 flex-wrap">{children}</div> : null}
        </div>
    );
}

interface FilterChipsProps<T extends string> {
    options: { value: T; label: string; count?: number }[];
    value: T;
    onChange: (value: T) => void;
    label: string;
}

/** Single-select segmented filter; the selected chip carries the accent colour. */
export function FilterChips<T extends string>({ options, value, onChange, label }: FilterChipsProps<T>) {
    return (
        <div role="radiogroup" aria-label={label} className="flex items-center gap-1.5 flex-wrap">
            {options.map((option) => {
                const isActive = option.value === value;

                return (
                    <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        onClick={() => onChange(option.value)}
                        className={cn(
                            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                            'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/45',
                            isActive
                                ? 'border-accent/40 bg-accent/15 text-accent shadow-[inset_0_1px_0_0_var(--specular)]'
                                : 'border-hairline text-muted-foreground hover:bg-white/[0.06] hover:text-foreground'
                        )}
                    >
                        {option.label}
                        {typeof option.count === 'number' ? (
                            <span className={cn('font-mono', isActive ? 'text-accent/80' : 'text-muted-foreground/70')}>
                                {option.count}
                            </span>
                        ) : null}
                    </button>
                );
            })}
        </div>
    );
}
