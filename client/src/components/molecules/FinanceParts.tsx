import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import styled, { css } from 'styled-components';
import { filledInputs } from '../../styles/filledInputs.js';
import { entryRowPlain } from '../../styles/entryRow.js';
import { formatCents } from '../../utils/finance.js';
import { PillButton } from '../atoms/PillButton.js';
import { columnRules } from '../../styles/columnRules.js';

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

/* A spreadsheet table. With $cols it owns the column tracks (and $phoneCols below
   $phoneAt px) and every Row / TotalRow inside shares them through subgrid — so
   headers, rows and totals line up even with auto-sized columns, and the column
   rules run unbroken from the first row to the last. Rows' own $cols are then
   ignored, and so are their mobile grid-template-columns. */
interface TableProps { $cols?: string; $phoneCols?: string; $phoneAt?: number }

const TableBase = styled.div<TableProps>`
  display: ${({ $cols }) => ($cols ? 'grid' : 'flex')};
  flex-direction: column;
  /* Every child spans the table (inline edit forms too); rows then take its tracks */
  ${({ $cols }) => ($cols ? `grid-template-columns: ${$cols}; column-gap: 0; & > * { grid-column: 1 / -1; }` : '')}
  ${({ $phoneCols, $phoneAt = 640 }) => ($phoneCols ? `@media (max-width: ${$phoneAt}px) { grid-template-columns: ${$phoneCols}; }` : '')}
`;

export function Table(props: ComponentProps<typeof TableBase>) {
  return <TableBase data-grid={props.$cols ? '' : undefined} {...props} />;
}

/* Inside a column-owning Table: span it and take its tracks (beats any row's own
   or mobile grid-template-columns). */
const subgridRow = css`
  ${TableBase}[data-grid] > & {
    grid-column: 1 / -1;
    grid-template-columns: subgrid;
  }
`;

/** One list row: page-colour, sinks on hover (the shared plain-list style). */
export const Row = styled.div<{ $cols: string; $active?: boolean; $muted?: boolean }>`
  ${entryRowPlain}
  /* No fill at rest — rows sit on whatever card or page they're in; hover still sinks */
  background: transparent;
  display: grid;
  grid-template-columns: ${({ $cols }) => $cols};
  align-items: center;
  gap: 12px;
  padding: 10px 8px;
  ${columnRules('10px')}
  ${subgridRow}
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
  ${columnRules('12px')}
  ${subgridRow}
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
  width: 18px;
  height: 18px;
  margin: 0;
  border: 1.5px solid var(--control-border);
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  display: grid;
  place-content: center;
  &::after {
    content: '';
    width: 8px;
    height: 4px;
    border-left: 2px solid var(--bg-sunken);
    border-bottom: 2px solid var(--bg-sunken);
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

/* A quiet ⋯ — no outline, muted until hovered */
const MenuButton = styled(SmallBtn)`
  min-width: 32px;
  padding: 4px 8px;
  border: none;
  font-size: 16px;
  line-height: 1;
  letter-spacing: 0.1em;
  color: var(--text-muted);
  &:hover:not(:disabled) { background: transparent; color: var(--text-primary); }
`;

/* A floating overlay — the one place a shadow is allowed */
const MenuList = styled.div`
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 20;
  min-width: 200px;
  padding: 6px;
  background: var(--bg-tile);
  border: 1px solid var(--border-pop);
  border-radius: 10px;
  box-shadow: var(--shadow-lg);
`;

const MenuItem = styled.button<{ $danger?: boolean }>`
  display: block;
  width: 100%;
  padding: 8px 14px;
  text-align: left;
  font-family: var(--font-sans);
  font-size: 14px;
  border-radius: 6px;
  color: ${({ $danger }) => ($danger ? 'var(--color-danger)' : 'var(--text-secondary)')};
  background: transparent;
  border: none;
  cursor: pointer;
  &:hover, &:focus-visible { background: var(--bg-row-hover); outline: none; }
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

/* ── Sheet look (Budget & bills): thin headings, outlined boxes on the canvas ── */

/** "Budget · October 2026", "Log spending", "Bills & subscriptions" */
export const SheetHeading = styled.h2`
  margin: 0;
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 300;
  line-height: 1.2;
  color: var(--text-secondary);
  @media (max-width: 480px) { font-size: 22px; }
  padding-left: 16px;
`;

export const SheetHead = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 20px;
  margin-bottom: 20px;
`;

/** One outlined box (no fill) holding a sheet's rows */
export const SheetBox = styled.div`
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  overflow: hidden;
`;

/** Faint rule between sheet rows */
export const SHEET_RULE = 'color-mix(in srgb, var(--border-subtle) 55%, var(--bg-app))';

/** Accent link in sentence case ("Manage categories") */
export const SheetLink = styled.button`
  padding: 0;
  border: none;
  background: none;
  font-family: var(--font-sans);
  font-size: 14px;
  font-weight: 600;
  color: var(--color-accent-link);
  cursor: pointer;
  &:hover { text-decoration: underline; }
`;

/** One outlined group of options; the chosen one lifted onto --bg-active */
export const Seg = styled.div`
  display: flex;
  gap: 2px;
  max-width: 100%;
  overflow-x: auto;
  padding: 4px;
  border: 1px solid var(--border-card);
  border-radius: 10px;
`;

export const SegBtn = styled.button<{ $active: boolean }>`
  flex: none;
  height: 30px;
  padding: 0 12px;
  border: none;
  border-radius: 7px;
  background: ${({ $active }) => ($active ? 'var(--bg-active)' : 'transparent')};
  font-family: var(--font-sans);
  font-size: 14px;
  color: ${({ $active }) => ($active ? 'var(--color-accent-soft)' : 'var(--text-muted)')};
  cursor: pointer;
  &:hover { color: ${({ $active }) => ($active ? 'var(--color-accent-soft)' : 'var(--text-secondary)')}; }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 1px; }
`;

/** Quiet outlined button in a sheet row ("Mark paid") */
export const RowBtn = styled.button`
  height: 30px;
  padding: 0 12px;
  border: 1px solid var(--border-card);
  border-radius: 8px;
  background: transparent;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-soft);
  white-space: nowrap;
  cursor: pointer;
  &:hover:not(:disabled) { border-color: var(--control-border); color: var(--text-primary); }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

/** Status pill on a bill: overdue (rose) or due today / tomorrow (amber) */
export const DueBadge = styled.span<{ $tone: 'overdue' | 'soon' }>`
  display: inline-flex;
  align-items: center;
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  font-family: var(--font-sans);
  font-size: 13px;
  white-space: nowrap;
  background: ${({ $tone }) => ($tone === 'overdue'
    ? 'color-mix(in srgb, var(--mood-1) 14%, var(--bg-app))'
    : 'color-mix(in srgb, var(--chart-amber) 14%, var(--bg-app))')};
  color: ${({ $tone }) => ($tone === 'overdue'
    ? 'color-mix(in srgb, var(--mood-1), white 12%)'
    : 'color-mix(in srgb, var(--chart-amber), white 20%)')};
`;

/** Muted amber note under an amount ("$155.00 unpaid") */
export const UNPAID_COLOR = 'color-mix(in oklab, var(--chart-amber) 70%, var(--text-muted))';

/* ‹ October 2026 › in one outlined pill (Budget, in the Finance title row) */
const MonthPillBox = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 40px;
  padding: 0 8px;
  border: 1px solid var(--border-card);
  border-radius: 999px;
  span {
    min-width: 120px;
    text-align: center;
    font-family: var(--font-sans);
    font-size: 15px;
    font-weight: 500;
    color: var(--text-secondary);
  }
`;

const MonthCaret = styled.button`
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  font-size: 18px;
  line-height: 1;
  color: var(--text-muted);
  cursor: pointer;
  &:hover { color: var(--text-primary); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 1px; }
`;

export function MonthPill({ label, onPrev, onNext }: { label: string; onPrev: () => void; onNext: () => void }) {
  return (
    <MonthPillBox>
      <MonthCaret type="button" aria-label="Previous month" onClick={onPrev}>‹</MonthCaret>
      <span aria-live="polite">{label}</span>
      <MonthCaret type="button" aria-label="Next month" onClick={onNext}>›</MonthCaret>
    </MonthPillBox>
  );
}

/* One outlined --bg-panel strip of stat cells split by rules (Budget's totals) */
export const StatBoxRow = styled.div<{ $cols: number }>`
  display: grid;
  grid-template-columns: repeat(${({ $cols }) => $cols}, minmax(0, 1fr));
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  overflow: hidden;
  @media (max-width: 760px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
`;

const StatCellBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  padding: 18px 22px 20px;
  box-shadow: -1px 0 0 var(--border-subtle), 0 -1px 0 var(--border-subtle);
`;

const StatCellLabel = styled.span`
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-soft);
`;

const StatCellValue = styled.span<{ $tone?: Tone }>`
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 300;
  line-height: 1.05;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
  color: ${({ $tone }) => ($tone === 'accent' ? 'var(--color-accent-link)' : $tone === 'danger' ? 'var(--color-danger)' : 'var(--text-secondary)')};
  @media (max-width: 480px) { font-size: 22px; }
`;

const StatCellSub = styled.span`
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-muted);
`;

export function StatCell({ label, cents, sub, tone }: { label: string; cents: number; sub?: ReactNode; tone?: Tone }) {
  return (
    <StatCellBox>
      <StatCellLabel>{label}</StatCellLabel>
      <StatCellValue $tone={tone}>{formatCents(cents)}</StatCellValue>
      {sub && <StatCellSub>{sub}</StatCellSub>}
    </StatCellBox>
  );
}

/** Sentence-case outline button (Add to fund / Take out): accent or neutral */
export const OutlineBtn = styled.button<{ $tone?: 'accent' | 'neutral' }>`
  height: 36px;
  padding: 0 16px;
  border: 1px solid ${({ $tone }) => ($tone === 'neutral' ? 'var(--border-card)' : 'var(--color-accent)')};
  border-radius: 10px;
  background: transparent;
  font-family: var(--font-sans);
  font-size: 14px;
  font-weight: 500;
  color: ${({ $tone }) => ($tone === 'neutral' ? 'var(--text-soft)' : 'var(--color-accent-link)')};
  white-space: nowrap;
  cursor: pointer;
  &:hover:not(:disabled) { border-color: ${({ $tone }) => ($tone === 'neutral' ? 'var(--control-border)' : 'var(--color-accent-hover)')}; color: ${({ $tone }) => ($tone === 'neutral' ? 'var(--text-primary)' : 'var(--color-accent-soft)')}; }
  &:disabled { opacity: 0.45; cursor: not-allowed; }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

/** A --bg-panel card (Savings funds, Goals) */
export const PanelCard = styled.div`
  min-width: 0;
  padding: 20px 22px 22px;
  background: var(--bg-panel);
  border-radius: 12px;
`;

export const CardTitle = styled.h3`
  margin: 0;
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 300;
  line-height: 1.2;
  color: var(--text-secondary);
`;

/** One outlined row of bare fields split by rules (date | amount | note) */
export const FieldRow = styled.div<{ $cols: string }>`
  display: grid;
  grid-template-columns: ${({ $cols }) => $cols};
  border: 1px solid var(--border-card);
  border-radius: 10px;
  overflow: hidden;
  & > label { display: flex; align-items: center; min-width: 0; height: 38px; padding: 0 12px; }
  & > label + label { border-left: 1px solid var(--border-card); }
  &:focus-within { border-color: var(--control-border); }
  input, select {
    flex: 1;
    width: 100%;
    min-width: 0;
    padding: 0;
    border: none !important;
    background: transparent !important;
    outline: none;
    font-family: var(--font-sans);
    font-size: 14px;
    color: var(--text-secondary);
    color-scheme: light dark;
  }
  input::placeholder { color: var(--text-hint); }
  input::-webkit-calendar-picker-indicator { opacity: 0.55; cursor: pointer; }
  .pre { margin-right: 3px; font-family: var(--font-sans); font-size: 14px; color: var(--text-hint); }
`;

