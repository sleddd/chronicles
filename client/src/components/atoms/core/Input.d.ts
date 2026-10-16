import React from "react";

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  /** Field label rendered above the input. */
  label?: string;
  /** Helper text below the input. */
  hint?: string;
  /** Error message — sets aria-invalid and danger styling. Overrides hint. */
  error?: string;
  /** Leading icon — IconName string or node. */
  icon?: string | React.ReactNode;
}

/** Labeled text input with hint/error states and optional leading icon. */
export function Input(props: InputProps): JSX.Element;
