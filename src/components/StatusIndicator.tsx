import { cn } from '@/lib/utils';

interface StatusIndicatorProps {
  isOnline: boolean;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function StatusIndicator({ isOnline, size = 'md', showLabel = false }: StatusIndicatorProps) {
  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4',
  };

  return (
    <div className="flex items-center gap-2">
    <div
        className={cn(
        'rounded-full',
        sizeClasses[size],
        isOnline
            ? 'bg-success animate-pulse-glow text-success'
            : 'bg-muted-foreground/50'
        )}
    />
    {showLabel && (
        <span
        className={cn(
            'text-xs font-medium',
            isOnline ? 'text-success' : 'text-muted-foreground'
        )}
        >
        {isOnline ? 'Online' : 'Offline'}
        </span>
    )}
    </div>
  );
}
