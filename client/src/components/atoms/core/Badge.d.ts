import React from "react";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Color tone. */
  tone?: "neutral" | "accent" | "success" | "warning" | "danger";
  /** Show a leading status dot. */
  dot?: boolean;
  children?: React.ReactNode;
}

/** Compact status or category label. */
export function Badge(props: BadgeProps): JSX.Element;
