'use client';

import React, { forwardRef } from 'react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  glass?: boolean;
  error?: string;
  options: { value: string; label: string }[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, glass, error, options, className = '', ...props }, ref) => {
    const selectClass = glass ? 'select-glass' : 'select';
    const errorClass = error ? 'input-error' : '';
    const classes = [selectClass, errorClass, className].filter(Boolean).join(' ');

    if (label) {
      return (
        <div className="field-group">
          <label className="field-label">{label}</label>
          <select ref={ref} className={classes} {...props}>
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {error && <p className="field-error">{error}</p>}
        </div>
      );
    }

    return (
      <select ref={ref} className={classes} {...props}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }
);

Select.displayName = 'Select';
