import React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style. */
  variant?: "primary" | "secondary" | "ghost" | "accentSoft" | "danger";
  /** Control height. */
  size?: "sm" | "md" | "lg";
  /** Stretch to full width of container. */
  block?: boolean;
  /** Leading icon — an IconName string or a React node. */
  icon?: string | React.ReactNode;
  /** Trailing icon — an IconName string or a React node. */
  iconRight?: string | React.ReactNode;
  children?: React.ReactNode;
}

/**
 * Primary action button. Five variants, three sizes, optional icons.
 * @startingPoint section="Core" subtitle="Buttons, fields & form primitives" viewport="700x260"
 */
export function Button(props: ButtonProps): JSX.Element;
