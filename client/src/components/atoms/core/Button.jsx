import React from "react";
import { Icon } from "./Icon.jsx";

/* Chronicles primary action element. */
export function Button({
  variant = "primary",
  size = "md",
  block = false,
  icon,
  iconRight,
  children,
  className = "",
  ...rest
}) {
  const cls = [
    "ch-btn",
    `ch-btn--${variant}`,
    `ch-btn--${size}`,
    block ? "ch-btn--block" : "",
    className,
  ].filter(Boolean).join(" ");
  return (
    <button className={cls} {...rest}>
      {icon && <span className="ch-btn__icon">{typeof icon === "string" ? <Icon name={icon} /> : icon}</span>}
      {children && <span>{children}</span>}
      {iconRight && <span className="ch-btn__icon">{typeof iconRight === "string" ? <Icon name={iconRight} /> : iconRight}</span>}
    </button>
  );
}
