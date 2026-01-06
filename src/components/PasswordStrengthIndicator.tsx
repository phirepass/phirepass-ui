import { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface PasswordStrengthIndicatorProps {
  password: string;
}

export function PasswordStrengthIndicator({ password }: PasswordStrengthIndicatorProps) {
  const strength = useMemo(() => {
    if (!password) return { score: 0, label: '', color: '' };

    let score = 0;

    // Length checks
    if (password.length >= 8) score += 1;
    if (password.length >= 12) score += 1;

    // Character variety checks
    if (/[a-z]/.test(password)) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^a-zA-Z0-9]/.test(password)) score += 1;

    // Normalize to 4 levels
    const normalizedScore = Math.min(4, Math.floor(score / 1.5));

    const levels = [
    { label: 'Weak', color: 'bg-destructive' },
    { label: 'Fair', color: 'bg-warning' },
    { label: 'Good', color: 'bg-accent' },
    { label: 'Strong', color: 'bg-success' },
    ];

    return {
    score: normalizedScore,
    ...levels[Math.max(0, normalizedScore - 1)] || { label: 'Too short', color: 'bg-muted' }
    };
  }, [password]);

  if (!password) return null;

  return (
    <div className="space-y-2">
    <div className="flex gap-1">
        {[1, 2, 3, 4].map((level) => (
        <div
            key={level}
            className={cn(
            'h-1.5 flex-1 rounded-full transition-all duration-300',
            level <= strength.score ? strength.color : 'bg-muted'
            )}
        />
        ))}
    </div>
    {strength.label && (
        <p className={cn(
        'text-xs transition-colors',
        strength.score <= 1 ? 'text-destructive' :
        strength.score === 2 ? 'text-warning' :
        strength.score === 3 ? 'text-accent' :
        'text-success'
        )}>
        {strength.label}
        </p>
    )}
    </div>
  );
}
