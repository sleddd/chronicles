import React, { type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Button as DSButton } from './core/Button.jsx';
import type { ButtonProps as DSButtonProps } from './core/Button.d';

interface ButtonProps extends Omit<DSButtonProps, 'size'> {
  /** @deprecated Use size prop from design system ('sm' | 'md' | 'lg') */
  fullWidth?: boolean;
  /** Size override — 'sm' | 'md' (now supports 'lg' from design system) */
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Primary action button wrapping the core Button primitive (atoms/core).
 * Supports variants: primary, secondary, ghost, accentSoft, danger
 * Supports sizes: sm, md, lg
 */
export function Button({ fullWidth, size = 'md', ...props }: ButtonProps) {
  return <DSButton block={fullWidth} size={size} {...props} />;
}
