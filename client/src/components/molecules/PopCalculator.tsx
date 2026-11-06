import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { Icon } from '../atoms/core/Icon.jsx';
import { CALC_START, calcKeyFor, pressCalc, showCalc, type CalcKey } from '../../utils/calculator.js';

/** A round calculator button that opens a small four-function calculator under it. */

const Wrap = styled.div`
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
`;

/* The pickers' 40px round outline; open = accent icon, never a darker fill */
const Toggle = styled.button<{ $open: boolean }>`
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid ${({ $open }) => ($open ? 'var(--color-accent-line)' : 'var(--border-card)')};
  border-radius: 999px;
  background: transparent;
  color: ${({ $open }) => ($open ? 'var(--color-accent-soft)' : 'var(--text-muted)')};
  cursor: pointer;
  &:hover { color: ${({ $open }) => ($open ? 'var(--color-accent-soft)' : 'var(--text-primary)')}; }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

/* A floating overlay, the one place a shadow is allowed */
const Panel = styled.div`
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 30;
  width: 248px;
  padding: 14px;
  background: var(--bg-tile);
  border: 1px solid var(--border-pop);
  border-radius: 10px;
  box-shadow: var(--shadow-lg);
`;

const Screen = styled.output`
  display: block;
  padding: 4px 6px 12px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--border-subtle);
  text-align: right;
  small {
    display: block;
    min-height: 18px;
    font-family: var(--font-sans);
    font-size: 12px;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  b {
    display: block;
    font-family: var(--font-display);
    font-size: 30px;
    font-weight: 300;
    line-height: 1.2;
    color: var(--text-primary);
    font-variant-numeric: tabular-nums;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const Keys = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
`;

const Key = styled.button<{ $kind?: 'op' | 'eq' | 'fn'; $wide?: boolean }>`
  grid-column: ${({ $wide }) => ($wide ? 'span 2' : 'auto')};
  height: 42px;
  border: 1px solid ${({ $kind }) => ($kind === 'eq' ? 'var(--color-accent-line)' : 'var(--border-card)')};
  border-radius: 4px;
  background: transparent;
  font-family: var(--font-sans);
  font-size: 16px;
  font-weight: ${({ $kind }) => ($kind ? 500 : 400)};
  color: ${({ $kind }) => ($kind === 'op' || $kind === 'eq' ? 'var(--color-accent-soft)' : $kind === 'fn' ? 'var(--text-muted)' : 'var(--text-secondary)')};
  cursor: pointer;
  &:hover { color: ${({ $kind }) => ($kind === 'op' || $kind === 'eq' ? 'var(--color-accent-link)' : 'var(--text-primary)')}; border-color: var(--control-border); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 1px; }
`;

const LAYOUT: { key: CalcKey; kind?: 'op' | 'eq' | 'fn'; wide?: boolean; label?: string }[] = [
  { key: 'C', kind: 'fn' }, { key: '⌫', kind: 'fn', label: 'Backspace' }, { key: '%', kind: 'fn' }, { key: '÷', kind: 'op' },
  { key: '7' }, { key: '8' }, { key: '9' }, { key: '×', kind: 'op' },
  { key: '4' }, { key: '5' }, { key: '6' }, { key: '-', kind: 'op' },
  { key: '1' }, { key: '2' }, { key: '3' }, { key: '+', kind: 'op' },
  { key: '0', wide: true }, { key: '.' }, { key: '=', kind: 'eq' },
];

export function PopCalculator() {
  const [open, setOpen] = useState(false);
  const [calc, setCalc] = useState(CALC_START);
  const wrap = useRef<HTMLDivElement>(null);
  const press = (key: CalcKey) => setCalc(s => pressCalc(s, key));

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); return; }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Leave typing in other fields alone
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      // Enter on a focused calculator key presses that key
      if (e.key === 'Enter' && t?.tagName === 'BUTTON' && wrap.current?.contains(t)) return;
      const key = calcKeyFor(e.key);
      if (!key) return;
      e.preventDefault();
      press(key);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <Wrap ref={wrap}>
      <Toggle type="button" $open={open} aria-label="Calculator" title="Calculator" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(o => !o)}>
        <Icon name="calculator" size={18} strokeWidth={2} />
      </Toggle>
      {open && (
        <Panel role="dialog" aria-label="Calculator">
          <Screen aria-live="polite">
            <small>{calc.trail}</small>
            <b>{showCalc(calc.display)}</b>
          </Screen>
          <Keys>
            {LAYOUT.map(k => (
              <Key key={k.key} type="button" $kind={k.kind} $wide={k.wide} aria-label={k.label ?? (k.key === '-' ? 'Minus' : k.key)} onClick={() => press(k.key)}>
                {k.key === '-' ? '−' : k.key}
              </Key>
            ))}
          </Keys>
        </Panel>
      )}
    </Wrap>
  );
}
