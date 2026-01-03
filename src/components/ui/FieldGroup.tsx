'use client';

import React from 'react';

interface FieldGroupProps {
  label: string;
  labelSize?: 'sm' | 'md';
  children: React.ReactNode;
  hint?: string;
  error?: string;
  inline?: boolean;
  horizontal?: boolean;
  className?: string;
}

export function FieldGroup({
  label,
  labelSize = 'md',
  children,
  hint,
  error,
  inline,
  horizontal,
  className = '',
}: FieldGroupProps) {
  const containerClass = inline
    ? 'field-group-inline'
    : horizontal
    ? 'field-group-horizontal'
    : 'field-group';

  const labelClass = labelSize === 'sm' ? 'field-label-sm' : 'field-label';

  return (
    <div className={`${containerClass} ${className}`}>
      <label className={labelClass}>{label}</label>
      <div className={horizontal ? 'field-input' : undefined}>{children}</div>
      {hint && !error && <p className="field-hint">{hint}</p>}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

// Checkbox field
interface CheckboxFieldProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export function CheckboxField({
  label,
  checked,
  onChange,
  disabled,
  className = '',
}: CheckboxFieldProps) {
  return (
    <label className={`checkbox-field ${className}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="checkbox"
      />
      <span className="checkbox-field-label">{label}</span>
    </label>
  );
}

// Range/slider field
interface RangeFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  showValue?: boolean;
  valueLabel?: (value: number) => string;
  className?: string;
}

export function RangeField({
  label,
  value,
  onChange,
  min = 0,
  max = 10,
  step = 1,
  showValue = true,
  valueLabel,
  className = '',
}: RangeFieldProps) {
  const displayValue = valueLabel ? valueLabel(value) : value.toString();

  return (
    <div className={`range-field ${className}`}>
      <div className="range-field-header">
        <label className="field-label">{label}</label>
        {showValue && <span className="range-field-value">{displayValue}</span>}
      </div>
      <input
        type="range"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="range-field-input"
      />
    </div>
  );
}
