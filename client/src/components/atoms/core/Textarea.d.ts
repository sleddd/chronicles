import React from "react";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}

/** Labeled multi-line text field. */
export function Textarea(props: TextareaProps): JSX.Element;
