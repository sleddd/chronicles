import React from "react";

/* Native select with Chronicles styling and custom chevron. */
export function Select({ label, hint, id, className = "", children, ...rest }) {
  const fieldId = id || rest.name || undefined;
  return (
    <div className="ch-field">
      {label && <label className="ch-field__label" htmlFor={fieldId}>{label}</label>}
      <select id={fieldId} className={`ch-select ${className}`} {...rest}>
        {children}
      </select>
      {hint && <span className="ch-field__hint">{hint}</span>}
    </div>
  );
}
