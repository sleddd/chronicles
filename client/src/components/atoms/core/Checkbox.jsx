import React from "react";

/* Checkbox with label. Controlled or uncontrolled. */
export function Checkbox({ label, className = "", ...rest }) {
  return (
    <label className={`ch-check ${className}`}>
      <input type="checkbox" {...rest} />
      <span className="ch-check__box">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <path d="M22 4 12 14.01l-3-3" />
        </svg>
      </span>
      {label && <span className="ch-check__label">{label}</span>}
    </label>
  );
}
