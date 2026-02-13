'use client';

import { cn } from '@/lib/utils';

interface PasswordStrengthProps {
  password: string;
  className?: string;
}

interface Requirement {
  label: string;
  met: boolean;
}

function getStrength(password: string): { score: number; label: string; requirements: Requirement[] } {
  const requirements: Requirement[] = [
    { label: '8+ characters', met: password.length >= 8 },
    { label: 'Uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'Number', met: /\d/.test(password) },
    { label: 'Special character', met: /[^A-Za-z0-9]/.test(password) },
  ];

  const score = requirements.filter((r) => r.met).length;

  const labels = ['Weak', 'Weak', 'Fair', 'Good', 'Strong'];
  return { score, label: labels[score]!, requirements };
}

const segmentColors = [
  'bg-destructive',
  'bg-orange-500',
  'bg-yellow-500',
  'bg-green-500',
];

const labelColors: Record<string, string> = {
  Weak: 'text-destructive',
  Fair: 'text-yellow-500',
  Good: 'text-green-500',
  Strong: 'text-green-500',
};

export function PasswordStrength({ password, className }: PasswordStrengthProps) {
  if (!password) return null;

  const { score, label, requirements } = getStrength(password);

  return (
    <div className={cn('space-y-2', className)}>
      {/* Strength bar */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-colors duration-200',
                i < score ? segmentColors[score - 1] : 'bg-muted'
              )}
            />
          ))}
        </div>
        <span className={cn('text-xs font-medium', labelColors[label])}>
          {label}
        </span>
      </div>

      {/* Requirements checklist */}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {requirements.map((req) => (
          <div key={req.label} className="flex items-center gap-1.5">
            <div
              className={cn(
                'h-1 w-1 rounded-full transition-colors',
                req.met ? 'bg-green-500' : 'bg-muted-foreground/40'
              )}
            />
            <span
              className={cn(
                'text-[11px] transition-colors',
                req.met ? 'text-muted-foreground' : 'text-muted-foreground/60'
              )}
            >
              {req.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
