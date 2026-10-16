import type { ReactNode } from 'react';
import { Badge as DSBadge } from './core/Badge.jsx';

type BadgeVariant = 'default' | 'ink' | 'accent' | 'danger' | 'success' | 'warning';

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantToTone: Record<Exclude<BadgeVariant, 'default' | 'ink'>, 'accent' | 'success' | 'warning' | 'danger'> = {
  accent: 'accent',
  danger: 'danger',
  success: 'success',
  warning: 'warning',
};

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  const tone = variant === 'default' || variant === 'ink' ? 'neutral' : variantToTone[variant];
  return (
    <DSBadge tone={tone} className={className}>
      {children}
    </DSBadge>
  );
}
