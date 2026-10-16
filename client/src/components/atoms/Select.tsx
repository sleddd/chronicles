import React, { type SelectHTMLAttributes } from 'react';
import { Select as DSSelect } from './core/Select.jsx';
import type { SelectProps as DSSelectProps } from './core/Select.d';

/**
 * Select field wrapping the core Select primitive (atoms/core).
 * Supports optional label, hint, and pass-through children (option elements).
 */
export function Select(props: DSSelectProps) {
  return <DSSelect {...props} />;
}
