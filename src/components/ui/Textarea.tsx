'use client';

import React, { forwardRef } from 'react';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  glass?: boolean;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, glass, error, hint, className = '', ...props }, ref) => {
    const textareaClass = glass ? 'textarea-glass' : 'textarea';
    const errorClass = error ? 'input-error' : '';
    const classes = [textareaClass, errorClass, className].filter(Boolean).join(' ');

    if (label) {
      return (
        <div className="field-group">
          <label className="field-label">{label}</label>
          <textarea ref={ref} className={classes} {...props} />
          {hint && !error && <p className="field-hint">{hint}</p>}
          {error && <p className="field-error">{error}</p>}
        </div>
      );
    }

    return <textarea ref={ref} className={classes} {...props} />;
  }
);

Textarea.displayName = 'Textarea';
