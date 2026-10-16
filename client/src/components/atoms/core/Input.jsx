import React from "react";
import { Icon } from "./Icon.jsx";

/* Text input with optional label, hint/error, and leading icon. */
export function Input({
  label,
  hint,
  error,
  icon,
  id,
  className = "",
  ...rest
}) {
  const fieldId = id || rest.name || undefined;
  const input = (
    <input
      id={fieldId}
      className={`ch-input ${className}`}
      aria-invalid={error ? "true" : undefined}
      {...rest}
    />
  );
  return (
    <div className="ch-field">
      {label && <label className="ch-field__label" htmlFor={fieldId}>{label}</label>}
      {icon ? (
        <div className="ch-input-group">
          <span className="ch-input-group__icon">{typeof icon === "string" ? <Icon name={icon} /> : icon}</span>
          {input}
        </div>
      ) : input}
      {(error || hint) && (
        <span className={`ch-field__hint ${error ? "ch-field__hint--error" : ""}`}>{error || hint}</span>
      )}
    </div>
  );
}
