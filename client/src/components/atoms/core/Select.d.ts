import React from "react";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  children?: React.ReactNode;
}

/** Styled native select with custom chevron. Pass <option> children. */
export function Select(props: SelectProps): JSX.Element;
