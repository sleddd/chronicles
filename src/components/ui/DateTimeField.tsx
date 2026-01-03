'use client';

import React from 'react';

interface DateTimeFieldProps {
  label: string;
  date: string;
  time: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  glass?: boolean;
  required?: boolean;
}

export function DateTimeField({
  label,
  date,
  time,
  onDateChange,
  onTimeChange,
  glass,
  required,
}: DateTimeFieldProps) {
  const inputClass = glass ? 'input-glass' : 'input';

  return (
    <div className="datetime-field">
      <label className="datetime-field-label">{label}:</label>
      <div className="datetime-field-inputs">
        <input
          type="date"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
          className={`${inputClass} w-auto`}
          required={required}
        />
        <input
          type="time"
          value={time}
          onChange={(e) => onTimeChange(e.target.value)}
          className={`${inputClass} w-auto`}
          required={required}
        />
      </div>
    </div>
  );
}

// Date-only field
interface DateFieldProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  glass?: boolean;
  required?: boolean;
  className?: string;
}

export function DateField({
  label,
  value,
  onChange,
  glass,
  required,
  className = '',
}: DateFieldProps) {
  const inputClass = glass ? 'input-glass' : 'input';

  if (label) {
    return (
      <div className="field-group">
        <label className="field-label">{label}</label>
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} ${className}`}
          required={required}
        />
      </div>
    );
  }

  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${inputClass} ${className}`}
      required={required}
    />
  );
}

// Time-only field
interface TimeFieldProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  glass?: boolean;
  required?: boolean;
  className?: string;
}

export function TimeField({
  label,
  value,
  onChange,
  glass,
  required,
  className = '',
}: TimeFieldProps) {
  const inputClass = glass ? 'input-glass' : 'input';

  if (label) {
    return (
      <div className="field-group">
        <label className="field-label">{label}</label>
        <input
          type="time"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} ${className}`}
          required={required}
        />
      </div>
    );
  }

  return (
    <input
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${inputClass} ${className}`}
      required={required}
    />
  );
}
