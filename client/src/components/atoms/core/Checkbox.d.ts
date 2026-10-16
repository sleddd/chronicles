import React from "react";

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Text label shown beside the box. */
  label?: string;
}

/** Accessible checkbox with animated check and optional label. */
export function Checkbox(props: CheckboxProps): JSX.Element;
