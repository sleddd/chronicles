import type { CSSProperties, ReactNode } from 'react';
import styled from 'styled-components';
import { MaterialIcon } from '../atoms/MaterialIcon.js';
import { BlockedTag } from '../atoms/BlockedTag.js';
import { TickMark } from '../atoms/TickMark.js';
import { cardLabel } from '../../styles/cardLabel.js';
import { dueNote, plannedText, shortDay, type DueTone } from '../../utils/planTable.js';

/*
 * The Planning list view (Goals, Milestones, Tasks) as a table: column names
 * over the rows, rows under group headings ("Health · 2 goals", a goal with
 * its progress), a row's title opening it and the columns lined up across.
 * Goals and milestones open to what's under them. Props only.
 */

export interface PlanColumn {
  label: string;
  /** A CSS grid track: "120px", "minmax(0, 1fr)" */
  width: string;
  /** Right-aligned (counts, estimates) */
  end?: boolean;
  /** Stacked on a narrow screen, its value shows with no name before it (a progress ring says what it is) */
  unnamedWhenStacked?: boolean;
}

/* The title needs this much room beside the columns; with less, the table stacks */
const TITLE_ROOM = 320;
const COLUMN_GAP = 24;

/**
 * How wide the table must be to keep its columns side by side: the fixed
 * columns, their gaps and room for the title. Under it every row stacks.
 */
export function stackWidth(columns: PlanColumn[]): number {
  const fixed = columns.slice(1).reduce((n, c) => n + (/^\d+(\.\d+)?px$/.test(c.width) ? parseFloat(c.width) : 120), 0);
  return Math.round(fixed + COLUMN_GAP * Math.max(0, columns.length - 1) + TITLE_ROOM);
}

/* A label before each value once the row is stacked ("Deadline Nov 9"), from the column names */
const cellLabels = (columns: PlanColumn[]) => columns.slice(1).map((c, i) => (c.unnamedWhenStacked ? '' :
  `[data-plan-cells] > [data-plan-cell]:nth-child(${i + 1}):not(:empty)::before { content: ${JSON.stringify(c.label)}; margin-right: 6px; color: var(--text-soft); font-weight: 500; }`),
).join('\n');

/*
 * The table measures itself (a container query), not the window: it stacks
 * wherever it is too narrow for its columns — a phone, a tablet, a narrow
 * window — so a title is never squeezed to a sliver beside them. Stacked,
 * each row is its title on a line of its own (wrapping, never cut off) over
 * its columns as a muted line, each named; the column names are hidden from
 * view (still read out).
 */
const Frame = styled.div<{ $stackAt: number; $labels: string }>`
  container: plantable / inline-size;
  margin-top: 8px;
  @container plantable (max-width: ${({ $stackAt }) => $stackAt}px) {
    [data-plan-head] {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    /* Two columns: the tick / chevron, then the title with its values under
       it, so the values line up with the title's text, never under the tick */
    [data-plan-row] {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      column-gap: 12px;
      row-gap: 14px;
      align-items: start;
      padding: 14px 0 20px calc(var(--plan-indent, 0) * 28px);
    }
    [data-plan-row][data-plan-bare] { grid-template-columns: minmax(0, 1fr); }
    [data-plan-lead] { display: contents; }
    [data-plan-mark] { display: flex; align-items: center; gap: 12px; min-height: 22px; }
    [data-plan-lead] button[data-plan-title] { white-space: normal; }
    /* The muted note after the title (a task's milestone or type) on a line of
       its own, lined up with the title's text, with room above it */
    [data-plan-lead] button[data-plan-title] small { display: block; margin: 12px 0 0; }
    [data-plan-cells] {
      grid-column: -2 / -1;
      display: flex;
      flex-wrap: wrap;
      /* Centred, not on the baseline: a progress ring would sit above the line */
      align-items: center;
      column-gap: 18px;
      row-gap: 8px;
    }
    [data-plan-cell] {
      text-align: left;
      font-size: 13px;
      font-style: italic;
      color: var(--text-muted);
    }
    [data-plan-cell]:empty { display: none; }
    /* The progress ring level with its percentage and the values beside it */
    [data-plan-cell] svg { display: block; }
    [data-plan-cell] > div { gap: 8px; }
    ${({ $labels }) => $labels}
  }
`;

const Table = styled.div`
  /* The first column is the title; the rest come from the columns given */
  --plan-cols: minmax(0, 1fr);
`;

const RowGrid = styled.div`
  display: grid;
  grid-template-columns: var(--plan-cols);
  column-gap: ${COLUMN_GAP}px;
  align-items: center;
`;

const HeadRow = styled(RowGrid)`
  padding: 0 0 14px;
  border-bottom: 1px solid var(--border-default);
`;

const ColName = styled.span<{ $end?: boolean }>`
  ${cardLabel}
  text-align: ${({ $end }) => ($end ? 'right' : 'left')};
`;

/** The table: its column names, then whatever groups and rows go in it */
export function PlanTable({ label, columns, children }: { label: string; columns: PlanColumn[]; children: ReactNode }) {
  const cols = ['minmax(0, 1fr)', ...columns.slice(1).map(c => c.width)].join(' ');
  return (
    <Frame $stackAt={stackWidth(columns)} $labels={cellLabels(columns)}>
      <Table role="table" aria-label={label} style={{ '--plan-cols': cols } as CSSProperties}>
        <HeadRow role="row" data-plan-head="">
          {columns.map(c => <ColName key={c.label} role="columnheader" $end={c.end}>{c.label}</ColName>)}
        </HeadRow>
        {children}
      </Table>
    </Frame>
  );
}

/* ── Group headings ── */

const GroupRow = styled.div<{ $shaded?: boolean; $open?: boolean }>`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 30px 0 14px;
  border-bottom: 1px solid var(--border-subtle);
  /* The Tasks list's goal / milestone rows: rows like any other — the same
     width and left edge as the task rows, flush one under the next with a
     hairline between — with more room and a smaller name */
  ${({ $shaded, $open }) => ($shaded ? `
    padding: 18px 0;
    /* The name smaller than a plain group heading's 22px */
    h2 { font-size: 20px; }
    /* Open, much more room above it and a firmer hairline under it mark where
       its tasks begin; folded, the plain row */
    ${$open ? `
    padding-top: 44px;
    border-bottom-color: color-mix(in srgb, var(--border-strong) 70%, var(--border-default));
    ` : ''}
    /* A little room before an open group's first task (none when folded:
       there's nothing after it then, so the rows stay flush) */
    & + * { margin-top: 10px; }
    /* And the last task is a little taller at its foot, with room under its
       line before the next group */
    & ~ *:last-child { padding-bottom: 20px; margin-bottom: 16px; }
  ` : '')}
`;

const GroupTitle = styled.h2`
  margin: 0;
  min-width: 0;
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 300;
  line-height: 1.3;
  color: var(--text-primary);
  overflow-wrap: anywhere;
`;

const Aside = styled.span`
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
  white-space: nowrap;
`;

const GroupEnd = styled.span`
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 18px;
`;

const FoldBtn = styled.button<{ $open: boolean }>`
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 50%;
  > span { transition: transform 160ms ease; transform: rotate(${({ $open }) => ($open ? 90 : 0)}deg); }
  &:hover { color: var(--text-primary); }
  &:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
`;

/** A group's heading: its name, a muted note ("Career", "3 tasks"), and on the right its progress and/or a fold chevron */
export function PlanGroup({ title, aside, progress, open, onToggle, shaded, children }: {
  title: string;
  /** The heading on a darker band (the Tasks list's goal / milestone groups) */
  shaded?: boolean;
  aside?: string;
  /** Done of total: "16 of 20" */
  progress?: { done: number; total: number };
  /** With onToggle: the chevron that folds the group */
  open?: boolean;
  onToggle?: () => void;
  children: ReactNode;
}) {
  const shown = open ?? true;
  return (
    <section aria-label={title}>
      <GroupRow $shaded={shaded} $open={shown}>
        <GroupTitle>{title}</GroupTitle>
        {aside && <Aside>{aside}</Aside>}
        <GroupEnd>
          {progress && progress.total > 0 && <Aside>{progress.done} of {progress.total}</Aside>}
          {onToggle && (
            <FoldBtn type="button" $open={shown} aria-expanded={shown} aria-label={`${shown ? 'Fold' : 'Open'} ${title}`} onClick={onToggle}>
              <MaterialIcon $size={20} aria-hidden="true">chevron_right</MaterialIcon>
            </FoldBtn>
          )}
        </GroupEnd>
      </GroupRow>
      {shown && children}
    </section>
  );
}

/* ── Rows ── */

/** Code in a list row: the system's monospace face (no code font is bundled) */
const CODE_FONT = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

const Row = styled(RowGrid)<{ $child: boolean }>`
  min-height: 64px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-subtle);
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-primary);
  ${({ $child }) => ($child ? 'min-height: 56px;' : '')}
`;

/* Outside the stacked layout these wrappers step aside: their children are the row's own */
const Contents = styled.div`
  display: contents;
`;

const Lead = styled.div<{ $indent: number }>`
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding-left: ${({ $indent }) => $indent * 56}px;
`;

const TitleBtn = styled.button<{ $done: boolean; $oneLine?: boolean; $blocked?: boolean }>`
  min-width: 0;
  padding: 0;
  border: none;
  background: transparent;
  text-align: left;
  font-family: var(--font-sans);
  font-size: 16px;
  line-height: 1.4;
  color: ${({ $done }) => ($done ? 'var(--text-muted)' : 'var(--text-primary)')};
  text-decoration: ${({ $done }) => ($done ? 'line-through' : 'none')};
  overflow-wrap: anywhere;
  cursor: pointer;
  &:hover { color: var(--color-accent-link); }
  &:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; border-radius: 2px; }
  small { margin-left: 12px; font-size: 14px; color: var(--text-muted); text-decoration: none; display: inline-block; }
  /* Waiting on something (Blocked by): the title struck through, its Blocked tag after it */
  ${({ $blocked }) => ($blocked ? '& > span:first-child { text-decoration: line-through; }' : '')}
  .blocked { display: inline-flex; margin-left: 12px; vertical-align: middle; text-decoration: none; max-width: 100%; }
  /* A line of code (a code snippet's first line), in a monospace face */
  .code { font-family: ${CODE_FONT}; font-size: 0.9em; }
  /* One line, cut off with "…" (a text entry's title and its next line) */
  ${({ $oneLine }) => ($oneLine ? 'white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; small { display: inline; }' : '')}
`;

const Cell = styled.div<{ $end?: boolean; $done?: boolean }>`
  min-width: 0;
  text-align: ${({ $end }) => ($end ? 'right' : 'left')};
  color: ${({ $done }) => ($done ? 'var(--text-muted)' : 'inherit')};
`;

export interface PlanRowProps {
  /** What sits before the title: a tick, a chevron and progress mark, a milestone mark */
  lead?: ReactNode;
  title: string;
  /** Muted after the title (its milestone, its category, a text entry's next line) */
  note?: string;
  /** The title / the note is a line of code: set in a monospace face */
  titleCode?: boolean;
  noteCode?: boolean;
  /** Keep the title and note to one line, cut off with "…" */
  oneLine?: boolean;
  /** What it's waiting on ("Call the plumber +1"): the title struck through, a Blocked tag after it */
  blocked?: string;
  done?: boolean;
  /** 0 = a top row, 1 = under a goal or milestone */
  indent?: number;
  onOpen: () => void;
  /** One per column after the title, in order */
  cells: ReactNode[];
  /** Which of those cells are right-aligned */
  endCells?: boolean[];
}

export function PlanRow({ lead, title, note, titleCode, noteCode, oneLine, blocked, done = false, indent = 0, onOpen, cells, endCells = [] }: PlanRowProps) {
  return (
    <Row role="row" $child={indent > 0} data-plan-row="" data-plan-bare={lead ? undefined : ''} style={indent ? { '--plan-indent': indent } as CSSProperties : undefined}>
      <Lead role="cell" $indent={indent} data-plan-lead="">
        {lead && <Contents role="presentation" data-plan-mark="">{lead}</Contents>}
        <TitleBtn type="button" data-plan-title="" $done={done} $blocked={!done && !!blocked} $oneLine={oneLine} onClick={onOpen} title={oneLine ? [title, note].filter(Boolean).join(' · ') : undefined}>
          <span className={titleCode ? 'code' : undefined}>{title}</span>
          {note && <small className={noteCode ? 'code' : undefined}>{note}</small>}
          {blocked && !done && <span className="blocked"><BlockedTag by={blocked} /></span>}
        </TitleBtn>
      </Lead>
      <Contents role="presentation" data-plan-cells="">
        {cells.map((c, i) => <Cell key={i} role="cell" data-plan-cell="" $end={endCells[i]} $done={done}>{c}</Cell>)}
      </Contents>
    </Row>
  );
}

/* ── Leads ── */

const BareBtn = styled.button`
  display: grid;
  place-items: center;
  flex: none;
  width: 28px;
  height: 28px;
  margin: -5px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 50%;
  &:hover { color: var(--text-primary); }
  &:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
`;

/** The tick before a task: marks it done or not */
export function PlanTick({ done, title, onToggle }: { done: boolean; title: string; onToggle: () => void }) {
  return (
    <BareBtn type="button" role="checkbox" aria-checked={done} aria-label={`${title}: done`} onClick={onToggle}>
      <TickMark checked={done} size={16} />
    </BareBtn>
  );
}

const Turn = styled(BareBtn)<{ $open: boolean }>`
  width: 24px;
  margin: 0 -4px 0 -6px;
  > span { transition: transform 160ms ease; transform: rotate(${({ $open }) => ($open ? 90 : 0)}deg); }
`;

/** The chevron that opens a goal to its milestones, or a milestone to its tasks */
export function PlanOpen({ open, title, onToggle, hidden }: { open: boolean; title: string; onToggle: () => void; hidden?: boolean }) {
  if (hidden) return <span aria-hidden="true" style={{ width: 18, flex: 'none' }} />;
  return (
    <Turn type="button" $open={open} aria-expanded={open} aria-label={`${open ? 'Close' : 'Open'} ${title}`} onClick={onToggle}>
      <MaterialIcon $size={20} aria-hidden="true">chevron_right</MaterialIcon>
    </Turn>
  );
}

/** Progress as a ring: a faint track with the done part drawn round it in the accent, from the top */
export function ProgressRing({ percent, size = 22 }: { percent: number; size?: number }) {
  const p = Math.max(0, Math.min(100, percent));
  const r = 9;
  const length = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden="true" style={{ flex: 'none', transform: 'rotate(-90deg)' }}>
      <circle cx="11" cy="11" r={r} fill="none" stroke="var(--progress-track, var(--border-subtle))" strokeWidth="2.5" />
      {p > 0 && (
        <circle cx="11" cy="11" r={r} fill="none" stroke="var(--color-accent-fill, var(--color-accent))" strokeWidth="2.5"
          strokeLinecap="round" strokeDasharray={`${(p / 100) * length} ${length}`} />
      )}
    </svg>
  );
}

/** A milestone's mark: a diamond, filled in the accent once it's done */
export function MilestoneMark({ done }: { done: boolean }) {
  return (
    <svg width={18} height={18} viewBox="0 0 18 18" aria-hidden="true" style={{ flex: 'none' }}>
      <rect x="4" y="4" width="10" height="10" rx="1" transform="rotate(45 9 9)"
        fill={done ? 'var(--color-accent)' : 'none'} stroke={done ? 'var(--color-accent)' : 'var(--text-muted)'} strokeWidth="1.5" />
    </svg>
  );
}

/* ── Cells ── */

const Muted = styled.span`
  color: var(--text-muted);
`;

const ToneNote = styled.span<{ $tone: DueTone }>`
  margin-left: 12px;
  font-size: 14px;
  color: ${({ $tone }) => ($tone === 'late' ? 'var(--color-danger)' : $tone === 'soon' ? 'var(--chart-amber)' : 'var(--text-muted)')};
`;

/** A deadline: "Nov 9  12 days late", or "No deadline" muted */
export function DueCell({ day, today, done, none = 'No deadline' }: { day: string; today: string; done: boolean; none?: string }) {
  if (!day) return <Muted>{none}</Muted>;
  const note = dueNote(day, today, done);
  return <>{shortDay(day, today)}<ToneNote $tone={note.tone}>{note.text}</ToneNote></>;
}

/** A plain date, or a muted word for none ("Not set", "Unplanned") */
export function DayCell({ day, today, none }: { day: string; today: string; none: string }) {
  return day ? <>{shortDay(day, today)}</> : <Muted>{none}</Muted>;
}

const TodayText = styled.span`
  color: var(--color-accent-soft);
`;

/** The day a task is planned for: "Today" in the accent, "Mon, Nov 23", or "Unplanned" muted */
export function PlannedCell({ day, today, done }: { day: string; today: string; done: boolean }) {
  if (!day) return <Muted>Unplanned</Muted>;
  const p = plannedText(day, today, done);
  return p.today ? <TodayText>{p.text}</TodayText> : <>{p.text}</>;
}

const Bar = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

/** A progress ring with its percentage */
export function ProgressCell({ percent }: { percent: number }) {
  return <Bar><ProgressRing percent={percent} />{percent}%</Bar>;
}

const Signal = styled.span<{ $level: number; $hot: string }>`
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
  height: 12px;
  margin-right: 10px;
  vertical-align: -1px;
  > i { width: 3px; border-radius: 1px; background: var(--border-default); }
  > i:nth-child(1) { height: 5px; }
  > i:nth-child(2) { height: 8px; }
  > i:nth-child(3) { height: 12px; }
  > i:nth-child(-n + ${({ $level }) => $level}) { background: ${({ $hot }) => $hot}; }
`;

const PRIORITY: Record<string, { label: string; level: number; color?: string }> = {
  urgent: { label: 'Urgent', level: 3, color: 'var(--color-danger)' },
  high: { label: 'High', level: 3, color: 'var(--chart-amber)' },
  medium: { label: 'Medium', level: 2 },
  low: { label: 'Low', level: 1 },
};

/** A task's priority: three small bars filled to its level and its name — High in amber, Urgent in red */
export function PriorityCell({ priority }: { priority: string }) {
  const p = PRIORITY[priority];
  if (!p) return <Muted>None</Muted>;
  return (
    <span style={p.color ? { color: p.color } : undefined}>
      <Signal $level={p.level} $hot={p.color ?? 'var(--text-secondary)'} aria-hidden="true"><i /><i /><i /></Signal>
      {p.label}
    </span>
  );
}

export { Muted as PlanMuted };
