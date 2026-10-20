import styled from 'styled-components';
import { useRef, useCallback, type KeyboardEvent } from 'react';

/* Sub-sub tabs (All / Today / This week…): one outlined group; the chosen
   option is lifted onto --bg-tab-active in the standard text colour (no accent). */
const Row = styled.div<{ $flush?: boolean; $bordered?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  max-width: 100%;
  overflow-x: auto;
  padding: 4px;
  border: 1px solid var(--border-card);
  border-radius: 10px;
`;

const Label = styled.span`
  padding: 0 8px 0 6px;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-muted);
  white-space: nowrap;
  flex-shrink: 0;
`;

const Btn = styled.button<{ $active?: boolean; $flush?: boolean }>`
  flex: none;
  height: 30px;
  padding: 0 12px;
  border: none;
  border-radius: 7px;
  background: ${({ $active }) => ($active ? 'var(--bg-tab-active)' : 'transparent')};
  font-family: var(--font-sans);
  font-size: 14px;
  color: ${({ $active }) => ($active ? 'var(--text-primary)' : 'var(--text-muted)')};
  white-space: nowrap;
  cursor: pointer;
  transition: color 120ms ease, background 120ms ease;
  &:hover:not([aria-selected="true"]) { color: var(--text-secondary); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 1px; }
`;

interface FilterTabsProps<T extends string> {
  options: { value: T; label: string }[];
  active: T;
  onChange: (value: T) => void;
  label?: string;
  /** Align the first tab's text with the container's left edge (no row padding). */
  flush?: boolean;
  /** Show the bottom divider rule. Defaults to true. */
  bordered?: boolean;
}

export function FilterTabs<T extends string>({ options, active, onChange, label, flush, bordered = true }: FilterTabsProps<T>) {
  const safeOptions = options ?? [];
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = useCallback((e: KeyboardEvent, index: number) => {
    let nextIndex: number | null = null;
    if (e.key === 'ArrowRight') nextIndex = (index + 1) % safeOptions.length;
    else if (e.key === 'ArrowLeft') nextIndex = (index - 1 + safeOptions.length) % safeOptions.length;
    else if (e.key === 'Home') nextIndex = 0;
    else if (e.key === 'End') nextIndex = safeOptions.length - 1;

    if (nextIndex !== null) {
      e.preventDefault();
      btnRefs.current[nextIndex]?.focus();
      onChange(safeOptions[nextIndex].value);
    }
  }, [safeOptions, onChange]);

  return (
    <Row role="tablist" $flush={flush} $bordered={bordered}>
      {label && <Label>{label}</Label>}
      {safeOptions.map((opt, i) => (
        <Btn
          key={opt.value}
          ref={el => { btnRefs.current[i] = el; }}
          role="tab"
          aria-selected={active === opt.value}
          tabIndex={active === opt.value ? 0 : -1}
          $active={active === opt.value}
          $flush={flush}
          onClick={() => onChange(opt.value)}
          onKeyDown={e => handleKeyDown(e, i)}
        >
          {opt.label}
        </Btn>
      ))}
    </Row>
  );
}
