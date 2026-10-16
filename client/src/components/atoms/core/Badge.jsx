import React from "react";

/* Small status/label pill. */
export function Badge({ tone = "neutral", dot = false, children, className = "", ...rest }) {
  return (
    <span className={`ch-badge ch-badge--${tone} ${className}`} {...rest}>
      {dot && <span className="ch-badge__dot" />}
      {children}
    </span>
  );
}
