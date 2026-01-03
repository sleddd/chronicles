'use client';

import React from 'react';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info';
  size?: 'sm' | 'md';
}

export function Badge({
  variant = 'default',
  size = 'md',
  className = '',
  children,
  ...props
}: BadgeProps) {
  const variantClass = {
    default: 'badge',
    primary: 'badge badge-primary',
    success: 'badge badge-success',
    warning: 'badge badge-warning',
    danger: 'badge badge-danger',
    info: 'badge badge-info',
  }[variant];

  const sizeClass = size === 'sm' ? 'badge-sm' : '';

  return (
    <span className={`${variantClass} ${sizeClass} ${className}`} {...props}>
      {children}
    </span>
  );
}

// Entry type badge with predefined colors
interface EntryTypeBadgeProps {
  type: string;
  className?: string;
}

export function EntryTypeBadge({ type, className = '' }: EntryTypeBadgeProps) {
  const typeClasses: Record<string, string> = {
    task: 'entry-type-badge entry-type-task',
    goal: 'entry-type-badge entry-type-goal',
    meeting: 'entry-type-badge entry-type-meeting',
    event: 'entry-type-badge entry-type-event',
    milestone: 'entry-type-badge entry-type-milestone',
    medication: 'entry-type-badge entry-type-medication',
    exercise: 'entry-type-badge entry-type-exercise',
    food: 'entry-type-badge entry-type-food',
    symptom: 'entry-type-badge entry-type-symptom',
  };

  const badgeClass = typeClasses[type] || 'entry-type-badge';

  return (
    <span className={`${badgeClass} ${className}`}>
      {type.charAt(0).toUpperCase() + type.slice(1)}
    </span>
  );
}
