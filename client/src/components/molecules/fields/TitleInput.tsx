import { useId, useLayoutEffect, useRef, type ChangeEvent, type KeyboardEvent, type TextareaHTMLAttributes } from 'react';
import styled from 'styled-components';

/* The title field of an entry, edited in place ("What did you eat?"):
   no label above — the field's name is its aria-label and, with no placeholder of its own, its placeholder — the text in thin Work Sans at
   a normal size and a faint rule under it that turns accent while editing, so
   it reads as a field like the rows below. A one-line title that wraps and
   grows to show all of its text instead of scrolling sideways: a textarea
   sized to its content, Enter never adds a line break (pasted line breaks
   become spaces). Props only. */

const Field = styled.div`
  display: flex;
  flex-direction: column;
  padding-bottom: 20px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--border-subtle);
  transition: border-color 120ms ease;
  &:focus-within { border-bottom-color: var(--color-accent-line); }
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
    /* Room for about two lines before it starts to grow */
    min-height: calc(2 * 1.32em);
    color: var(--text-primary);
  }
  /* No label above: the placeholder names the field, so it reads a step firmer */
  &::placeholder { color: var(--text-secondary); font-style: italic; opacity: 1; }
  html[data-theme='light'] &::placeholder { color: var(--text-muted); }
`;

type TitleInputProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'rows'> & {
  /** The label shown above — defaults to the aria-label, else "Title" */
  label?: string;
  /** Kept for callers; no label is ever shown above now (the placeholder says it) */
  hideLabel?: boolean;
};

export function TitleInput({ value, onChange, onKeyDown, label, hideLabel: _hideLabel, id, 'aria-label': ariaLabel, placeholder, style, className, ...rest }: TitleInputProps) {
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
    // style / className place the whole field (its spacing), never the text box inside
    <Field style={style} className={className}>
      <Area ref={ref} id={fieldId} rows={1} value={value} onChange={change} onKeyDown={keyDown}
        aria-label={label ?? ariaLabel ?? 'Title'} placeholder={placeholder ?? label ?? ariaLabel} {...rest} />
    </Field>
  );
}
