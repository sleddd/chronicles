import React, { type TextareaHTMLAttributes } from 'react';
import { Textarea as DSTextarea } from './core/Textarea.jsx';
import type { TextareaProps as DSTextareaProps } from './core/Textarea.d';

interface TextareaProps extends Omit<DSTextareaProps, 'error'> {
  /** @deprecated Use error prop as string message */
  error?: boolean | string;
}

/**
 * Multi-line text area wrapping the core Textarea primitive (atoms/core).
 * Supports optional label, hint, and error message.
 */
export function Textarea({ error, ...props }: TextareaProps) {
  const errorMessage = typeof error === 'string' ? error : error ? 'Error' : undefined;
  return <DSTextarea error={errorMessage} {...props} />;
}
