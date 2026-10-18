import React from "react";

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Label shown beside the box (text, or text with links). */
  label?: React.ReactNode;
}

/** Accessible checkbox with animated check and optional label. */
export function Checkbox(props: CheckboxProps): JSX.Element;
