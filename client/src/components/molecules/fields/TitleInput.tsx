import { useId, useLayoutEffect, useRef, type ChangeEvent, type KeyboardEvent, type TextareaHTMLAttributes } from 'react';
import styled from 'styled-components';

/* The title field of an entry, edited in place ("What did you eat?"): a small
   label above (the field's name, else "Title"), the text in thin Work Sans at
   a normal size and a faint rule under it that turns accent while editing, so
   it reads as a field like the rows below. A one-line title that wraps and
   grows to show all of its text instead of scrolling sideways: a textarea
   sized to its content, Enter never adds a line break (pasted line breaks
   become spaces). Props only. */

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-subtle);
  transition: border-color 120ms ease;
  &:focus-within { border-bottom-color: var(--color-accent-line); }
`;

const Label = styled.label`
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-muted);
`;

const Area = styled.textarea`
  && {
    display: block;
    width: 100%;
    padding: 0;
    border: none !important;
    background: transparent !important;
    outline: none;
    resize: none;
    overflow: hidden;
    font-family: var(--font-display);
    font-size: 22px;
    font-weight: 300;
    line-height: 1.32;
    color: var(--text-primary);
  }
  &::placeholder { color: var(--text-hint); }
`;

type TitleInputProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'rows'> & {
  /** The label shown above — defaults to the aria-label, else "Title" */
  label?: string;
  /** No label above (the placeholder says it); the aria-label still names the field */
  hideLabel?: boolean;
};

export function TitleInput({ value, onChange, onKeyDown, label, hideLabel = false, id, 'aria-label': ariaLabel, ...rest }: TitleInputProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const autoId = useId();
  const fieldId = id ?? autoId;

  // Fit the height to the text — on every change and whenever the width changes
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; };
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [value]);

  const change = (e: ChangeEvent<HTMLTextAreaElement>) => {
    if (e.target.value.includes('\n')) e.target.value = e.target.value.replace(/\s*\n+\s*/g, ' ');
    onChange?.(e);
  };

  const keyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(e);
    if (e.key === 'Enter') e.preventDefault();
  };

  return (
    <Field>
      {!hideLabel && <Label htmlFor={fieldId}>{label ?? ariaLabel ?? 'Title'}</Label>}
      <Area ref={ref} id={fieldId} rows={1} value={value} onChange={change} onKeyDown={keyDown}
        aria-label={hideLabel ? (label ?? ariaLabel ?? 'Title') : undefined} {...rest} />
    </Field>
  );
}
