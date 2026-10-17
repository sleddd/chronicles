import { useEffect, useRef, useState, type ReactNode } from 'react';
import styled, { css } from 'styled-components';
import { filledInputs } from '../../styles/filledInputs.js';
import { entryRowPlain } from '../../styles/entryRow.js';
import { formatCents } from '../../utils/finance.js';
import { PillButton } from '../atoms/PillButton.js';

/*
 * Shared Finance building blocks (pure, props only): flat sections with a top
 * rule + tracked label, a quiet stat strip, spreadsheet-style rows, compact
 * filled inputs for inline add rows, small 4px utility buttons and chips.
 */

export const Section = styled.section`
  margin-top: 40px;
  border-top: 1px solid var(--border-subtle);
  padding-top: 14px;
`;

export const SectionHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px 16px;
  margin-bottom: 14px;
  min-height: 32px;
`;

export const SectionLabel = styled.h2`
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-secondary);
  margin: 0;
`;

export const Note = styled.p`
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-tertiary);
  margin: 0;
`;

export const ErrorNote = styled.p`
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--color-danger);
  margin: 8px 0 0;
`;

/** Accent text action for section heads. */
export const TextAction = styled.button`
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-accent);
  background: transparent;
  border: none;
  padding: 4px 0;
  cursor: pointer;
  &:hover:not(:disabled) { opacity: 0.7; }
  &:disabled { color: var(--text-disabled); cursor: not-allowed; }
`;

/* ── Stat strip ── */

export const StatStrip = styled.div<{ $cols?: number }>`
  display: grid;
  grid-template-columns: repeat(${({ $cols }) => $cols ?? 3}, minmax(0, 1fr));
  gap: 24px;
  @media (max-width: 768px) { grid-template-columns: repeat(2, minmax(0, 1fr)); row-gap: 20px; }
`;

const StatBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
`;

export const StatLabel = styled.span`
  font-family: var(--font-label);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-tertiary);
`;

export type Tone = 'default' | 'accent' | 'success' | 'danger' | 'muted';

const toneColor = (tone: Tone | undefined) => ({
  accent: 'var(--color-accent)',
  success: 'var(--color-success)',
  danger: 'var(--color-danger)',
  muted: 'var(--text-tertiary)',
  default: 'var(--text-primary)',
}[tone ?? 'default']);

const StatValue = styled.span<{ $tone?: Tone }>`
  font-family: var(--font-display);
  font-size: 32px;
  font-weight: 200;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
  color: ${({ $tone }) => toneColor($tone)};
  overflow-wrap: anywhere;
  @media (max-width: 480px) { font-size: 26px; }
`;

const StatSub = styled.span`
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--text-tertiary);
`;

export function Stat({ label, cents, sub, tone }: { label: string; cents: number; sub?: ReactNode; tone?: Tone }) {
  return (
    <StatBox>
      <StatLabel>{label}</StatLabel>
      <StatValue $tone={tone}>{formatCents(cents)}</StatValue>
      {sub && <StatSub>{sub}</StatSub>}
    </StatBox>
  );
}

/* ── Progress rule ── */

const Track = styled.div`
  height: 3px;
  background: var(--border-subtle);
  border-radius: var(--r-full, 999px);
  overflow: hidden;
`;

const Fill = styled.div<{ $pct: number; $tone: Tone }>`
  height: 100%;
  width: ${({ $pct }) => $pct}%;
  background: ${({ $tone }) => ($tone === 'default' ? 'var(--color-accent)' : toneColor($tone))};
  transition: width 300ms ease-out;
  @media (prefers-reduced-motion: reduce) { transition: none; }
`;

export function ProgressRule({ fraction, tone = 'default' }: { fraction: number; tone?: Tone }) {
  const pct = Math.max(0, Math.min(100, Math.round(fraction * 100)));
  return <Track role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><Fill $pct={pct} $tone={tone} /></Track>;
}

/** Progress as a small circle outline that fills clockwise (budget used). */
export function ProgressRing({ fraction, tone = 'default', size = 24, label }: { fraction: number; tone?: Tone; size?: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(fraction * 100)));
  const stroke = 2.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = tone === 'default' ? 'var(--color-accent)' : toneColor(tone);
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      style={{ flexShrink: 0, transform: 'rotate(-90deg)' }}
    >
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border-default)" strokeWidth={stroke} />
      {pct > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
        />
      )}
    </svg>
  );
}

/* ── Money text ── */

const MoneySpan = styled.span<{ $out: boolean; $strike?: boolean }>`
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: ${({ $out }) => ($out ? 'var(--text-secondary)' : 'var(--text-primary)')};
  ${({ $strike }) => $strike && css`text-decoration: line-through; color: var(--text-tertiary);`}
`;

/** Money out shows a minus in the secondary tone; money in in body text. */
export function Money({ cents, out = false, strike }: { cents: number; out?: boolean; strike?: boolean }) {
  return <MoneySpan $out={out} $strike={strike}>{out ? `−${formatCents(Math.abs(cents))}` : formatCents(cents)}</MoneySpan>;
}

/* ── Spreadsheet rows ── */

export const Table = styled.div`
  display: flex;
  flex-direction: column;
`;

/** One list row: page-colour, sinks on hover (the shared plain-list style). */
export const Row = styled.div<{ $cols: string; $active?: boolean; $muted?: boolean }>`
  ${entryRowPlain}
  display: grid;
  grid-template-columns: ${({ $cols }) => $cols};
  align-items: center;
  gap: 12px;
  padding: 10px 8px;
  border-top: 1px solid var(--border-subtle);
  font-family: var(--font-sans);
  font-size: 15px;
  color: ${({ $muted }) => ($muted ? 'var(--text-tertiary)' : 'var(--text-primary)')};
  min-width: 0;
  &:last-child { border-bottom: 1px solid var(--border-subtle); }
  & > * { min-width: 0; }
`;

/** Footer/totals row — no hover. */
export const TotalRow = styled.div<{ $cols: string }>`
  display: grid;
  grid-template-columns: ${({ $cols }) => $cols};
  align-items: center;
  gap: 12px;
  padding: 12px 8px;
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-secondary);
  & > * { min-width: 0; }
`;

export const Cell = styled.span<{ $right?: boolean; $muted?: boolean; $small?: boolean }>`
  text-align: ${({ $right }) => ($right ? 'right' : 'left')};
  color: ${({ $muted }) => ($muted ? 'var(--text-tertiary)' : 'inherit')};
  font-size: ${({ $small }) => ($small ? '13px' : 'inherit')};
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const SubText = styled.span`
  display: block;
  font-size: 12.5px;
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

/** Small uppercase tag ("Subscription", "Review"). */
export const Tag = styled.span<{ $tone?: Tone }>`
  display: inline-block;
  font-family: var(--font-label);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${({ $tone }) => toneColor($tone ?? 'muted')};
  margin-left: 6px;
  white-space: nowrap;
`;

/* ── Inline add / edit forms ── */

/** A wrapping row of compact filled fields + a button. */
export const InlineForm = styled.form`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 10px 12px;
  ${filledInputs}
  input, select {
    font-family: var(--font-sans);
    font-size: 14px;
    color: var(--text-primary);
    border: none;
    width: 100%;
  }
`;

export const Field = styled.label<{ $w?: string; $grow?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: ${({ $grow }) => ($grow ? '1 1 200px' : '0 0 auto')};
  width: ${({ $w, $grow }) => ($grow ? 'auto' : $w ?? '140px')};
  min-width: 0;
  @media (max-width: 480px) { flex: 1 1 100%; width: auto; }
  & > span {
    font-family: var(--font-label);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-tertiary);
  }
`;

/** Bare filled input for use inside table rows. */
export const CellInput = styled.input`
  width: 100%;
  min-height: 32px;
  padding: 0 8px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-primary);
  background-color: var(--bg-sunken) !important;
  border: none;
  border-radius: var(--r-md, 1px);
  &:focus { outline: 1px solid var(--color-accent) !important; outline-offset: -1px; }
`;

/** Compact pill for a section/card title row (Add bill, New goal). */
export const SmallPill = styled(PillButton)`
  min-width: 0;
  padding: 4px 14px;
  font-size: 10px;
  letter-spacing: 0.12em;
`;

/* ── Small utility buttons & chips (4px radius) ── */

export const SmallBtn = styled.button<{ $danger?: boolean; $on?: boolean }>`
  padding: 5px 10px;
  font-family: var(--font-label);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
  color: ${({ $danger, $on }) => ($danger ? 'var(--color-danger)' : $on ? 'var(--on-accent)' : 'var(--text-secondary)')};
  background: ${({ $on }) => ($on ? 'var(--color-accent)' : 'transparent')};
  border: 1px solid ${({ $danger, $on }) => ($danger ? 'var(--color-danger)' : $on ? 'var(--color-accent)' : 'var(--border-default)')};
  border-radius: 4px;
  cursor: pointer;
  &:hover:not(:disabled) { background: ${({ $on }) => ($on ? 'var(--color-accent-hover)' : 'var(--bg-hover)')}; }
  &:disabled { color: var(--text-disabled); border-color: var(--border-subtle); cursor: not-allowed; }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

export const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

export const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
`;

/** Delete with an inline "Delete? Yes / No" (never window.confirm). */
export function ConfirmDelete({ onConfirm, label = 'Delete' }: { onConfirm: () => void; label?: string }) {
  const [asking, setAsking] = useState(false);
  if (!asking) return <SmallBtn type="button" onClick={() => setAsking(true)}>{label}</SmallBtn>;
  return (
    <>
      <SmallBtn type="button" $danger onClick={() => { setAsking(false); onConfirm(); }}>Yes, delete</SmallBtn>
      <SmallBtn type="button" onClick={() => setAsking(false)}>No</SmallBtn>
    </>
  );
}

/** A native checkbox styled as the "cleared ✓" box. */
export const ClearBox = styled.input.attrs({ type: 'checkbox' })`
  appearance: none;
  width: 20px;
  height: 20px;
  margin: 0;
  border: 1.5px solid var(--border-strong);
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  display: grid;
  place-content: center;
  &::after {
    content: '';
    width: 10px;
    height: 6px;
    border-left: 2px solid var(--on-accent);
    border-bottom: 2px solid var(--on-accent);
    transform: rotate(-45deg) translate(1px, -1px);
    opacity: 0;
  }
  &:checked { background: var(--color-accent); border-color: var(--color-accent); }
  &:checked::after { opacity: 1; }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  &:disabled { cursor: not-allowed; opacity: 0.6; }
`;

/* ── Row "⋯" menu: secondary actions tucked behind one button ── */

const MenuWrap = styled.div`
  position: relative;
  display: inline-flex;
`;

const MenuButton = styled(SmallBtn)`
  min-width: 32px;
  padding: 3px 8px;
  font-size: 14px;
  line-height: 1;
  letter-spacing: 0.1em;
`;

/* A floating overlay — the one place a shadow is allowed */
const MenuList = styled.div`
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 20;
  min-width: 180px;
  padding: 4px 0;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  box-shadow: var(--shadow-lg);
`;

const MenuItem = styled.button<{ $danger?: boolean }>`
  display: block;
  width: 100%;
  padding: 8px 14px;
  text-align: left;
  font-family: var(--font-sans);
  font-size: 13.5px;
  color: ${({ $danger }) => ($danger ? 'var(--color-danger)' : 'var(--text-primary)')};
  background: transparent;
  border: none;
  cursor: pointer;
  &:hover, &:focus-visible { background: var(--bg-hover); outline: none; }
`;

export interface RowMenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  /** Needs a second click with this label before it runs (e.g. "Yes, delete"). */
  confirmLabel?: string;
}

/** "⋯" button opening a small menu of secondary row actions. */
export function RowMenu({ items, label }: { items: RowMenuItem[]; label: string }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) { setOpen(false); setConfirming(null); }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); setConfirming(null); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (items.length === 0) return null;
  return (
    <MenuWrap ref={wrap}>
      <MenuButton type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => { setOpen(o => !o); setConfirming(null); }}>
        ⋯
      </MenuButton>
      {open && (
        <MenuList role="menu">
          {items.map(item => (
            <MenuItem
              key={item.label}
              type="button"
              role="menuitem"
              $danger={item.danger}
              onClick={() => {
                if (item.confirmLabel && confirming !== item.label) { setConfirming(item.label); return; }
                setOpen(false);
                setConfirming(null);
                item.onSelect();
              }}
            >
              {confirming === item.label && item.confirmLabel ? item.confirmLabel : item.label}
            </MenuItem>
          ))}
        </MenuList>
      )}
    </MenuWrap>
  );
}
