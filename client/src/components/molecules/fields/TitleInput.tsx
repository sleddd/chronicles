import { useLayoutEffect, useRef, type ChangeEvent, type KeyboardEvent, type TextareaHTMLAttributes } from 'react';
import styled from 'styled-components';

/* A big borderless title field ("What did you eat?"). A one-line title that
   wraps and grows to show all of its text instead of scrolling sideways:
   a textarea sized to its content, Enter never adds a line break (pasted
   line breaks become spaces). Props only. */

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
    font-size: 34px;
    font-weight: 300;
    line-height: 1.32;
    color: var(--text-primary);
  }
  &::placeholder { color: var(--text-hint); }
`;

type TitleInputProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'rows'>;

export function TitleInput({ value, onChange, onKeyDown, ...rest }: TitleInputProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

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

  return <Area ref={ref} rows={1} value={value} onChange={change} onKeyDown={keyDown} {...rest} />;
}
