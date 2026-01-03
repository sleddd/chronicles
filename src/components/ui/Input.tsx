'use client';

import React, { forwardRef } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  glass?: boolean;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, glass, error, hint, className = '', ...props }, ref) => {
    const inputClass = glass ? 'input-glass' : 'input';
    const errorClass = error ? 'input-error' : '';
    const classes = [inputClass, errorClass, className].filter(Boolean).join(' ');

    if (label) {
      return (
        <div className="field-group">
          <label className="field-label">{label}</label>
          <input ref={ref} className={classes} {...props} />
          {hint && !error && <p className="field-hint">{hint}</p>}
          {error && <p className="field-error">{error}</p>}
        </div>
      );
    }

    return <input ref={ref} className={classes} {...props} />;
  }
);

Input.displayName = 'Input';
