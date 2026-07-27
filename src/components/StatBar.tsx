import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface StatBarProps {
  label: string;
  value: number;
  unit?: string;
  variant?: 'default' | 'warning' | 'danger' | 'secondary';
  icon?: ReactNode;
}

export function StatBar({ label, value, unit = '%', variant = 'default', icon }: StatBarProps) {
  const getVariant = () => {
    if (variant !== 'default') return variant;
    if (value >= 90) return 'danger';
    if (value >= 70) return 'warning';
    return 'default';
  };

  const colorVariant = getVariant();

  // `--primary` is near-white in this theme, so a "default" bar rendered as a
  // colourless strip. Healthy values now read in the brand emerald, which also
  // makes the amber/red escalation at 70% and 90% actually mean something.
  const barColors = {
    default: 'bg-accent',
    warning: 'bg-warning',
    danger: 'bg-destructive',
    secondary: 'bg-muted-foreground',
  };

  const textColors = {
    default: 'text-accent',
    warning: 'text-warning',
    danger: 'text-destructive',
    secondary: 'text-muted-foreground',
  };

  const displayValue = unit === '%' ? value.toFixed(2) : value;

  return (
    <div className="space-y-1">
    <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground uppercase tracking-wider">
        {icon}
        {label}
        </span>
        <span className={cn('font-mono font-medium', textColors[colorVariant])}>
        {displayValue}{unit}
        </span>
    </div>
    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
        <div
        className={cn('h-full rounded-full transition-all duration-500', barColors[colorVariant])}
        style={{ width: `${Math.min(value, 100)}%` }}
        />
    </div>
    </div>
  );
}
