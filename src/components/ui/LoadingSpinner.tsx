'use client';

import { useAccentColor } from '@/lib/hooks/useAccentColor';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function LoadingSpinner({ size = 'md', className = '' }: LoadingSpinnerProps) {
  const { accentColor } = useAccentColor();

  const dimensions = {
    sm: 20,
    md: 32,
    lg: 48,
  };

  const strokeWidths = {
    sm: 2,
    md: 3,
    lg: 4,
  };

  const dim = dimensions[size];
  const strokeWidth = strokeWidths[size];
  const radius = (dim - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className={`inline-flex items-center justify-center ${className}`}>
      <svg
        width={dim}
        height={dim}
        viewBox={`0 0 ${dim} ${dim}`}
        className="animate-spin"
      >
        <circle
          cx={dim / 2}
          cy={dim / 2}
          r={radius}
          fill="none"
          stroke={accentColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`}
        />
      </svg>
    </div>
  );
}

interface LoadingOverlayProps {
  message?: string;
}

export function LoadingOverlay({ message = 'Loading...' }: LoadingOverlayProps) {
  return (
    <div className="fixed inset-0 backdrop-blur-sm bg-white/30/80 flex flex-col items-center justify-center z-50">
      <LoadingSpinner size="lg" />
      <p className="mt-4 text-gray-600">{message}</p>
    </div>
  );
}

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse backdrop-blur-sm bg-white/50 rounded ${className}`}
    />
  );
}

export function EntrySkeleton() {
  return (
    <div className="p-4 border-b border-border">
      <div className="flex items-start gap-3">
        <Skeleton className="w-10 h-10 rounded-full" />
        <div className="flex-1">
          <Skeleton className="h-4 w-24 mb-2" />
          <Skeleton className="h-3 w-full mb-1" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      </div>
    </div>
  );
}

export function CalendarSkeleton() {
  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-6 w-32" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-8" />
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 35 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    </div>
  );
}

interface AdaptiveLoadingTextProps {
  message?: string;
  className?: string;
}

export function AdaptiveLoadingText({ message = 'Loading...', className = '' }: AdaptiveLoadingTextProps) {
  const { backgroundImage, backgroundIsLight } = useAccentColor();

  // When there's a background image, adapt text color based on brightness
  // Light background = dark text, dark background = light text
  // No background image = default gray text
  const hasBackgroundImage = !!backgroundImage;
  const textColor = hasBackgroundImage
    ? (backgroundIsLight ? 'text-gray-700' : 'text-white/70')
    : 'text-gray-500';

  return (
    <div className={`${textColor} ${className}`}>{message}</div>
  );
}
