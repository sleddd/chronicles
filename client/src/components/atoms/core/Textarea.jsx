import React from "react";

/* Multi-line text field. */
export function Textarea({ label, hint, error, id, className = "", ...rest }) {
  const fieldId = id || rest.name || undefined;
  return (
    <div className="ch-field">
      {label && <label className="ch-field__label" htmlFor={fieldId}>{label}</label>}
      <textarea
        id={fieldId}
        className={`ch-textarea ${className}`}
        aria-invalid={error ? "true" : undefined}
        {...rest}
      />
      {(error || hint) && (
        <span className={`ch-field__hint ${error ? "ch-field__hint--error" : ""}`}>{error || hint}</span>
      )}
    </div>
  );
}
