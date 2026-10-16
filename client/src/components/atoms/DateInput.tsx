import type { InputHTMLAttributes } from 'react';
import { Input as DSInput } from './core/Input.jsx';

interface DateInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  hint?: string;
  error?: boolean | string;
}

export function DateInput({ error, label, hint, ...props }: DateInputProps) {
  const errorMessage = typeof error === 'string' ? error : error ? 'Error' : undefined;
  return (
    <DSInput
      type="date"
      label={label}
      hint={hint}
      error={errorMessage}
      {...props}
    />
  );
}
