import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import styled from 'styled-components';
import { Icon } from '../atoms/core/Icon.jsx';
import {
  barSpan, draggedDates, dragDays, fractionOf, shortDay, timelineTicks,
  type BarDates, type DragMode, type TimelineScale, type TimelineWindow,
} from '../../utils/planTimeline.js';

/* The roadmap: goals as bars on a timeline, grouped under their categories,
   each opening to its milestones as thinner bars. A bar's fill is how far
   along it is. Drag a bar to move it, drag an end to change one date; with
   the keyboard, ← → move a focused bar a week (Shift a day) and Alt + ← →
   move its end. Read-only (tap to open) when `readOnly`. Props only. */

export interface TimelineRow {
  id: number;
  title: string;
  dates: BarDates;
  /** 0–1 filled; undefined = nothing to measure yet */
  progress?: number;
  done?: boolean;
  /** Muted words after the name ("2 of 5") */
  note?: string;
  children?: TimelineRow[];
}

export interface TimelineGroup { key: string; label: string; rows: TimelineRow[] }

const NAME_COL = '280px';
const NAME_COL_PHONE = '132px';

const Scroll = styled.div`
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
`;

const Grid = styled.div`
  position: relative;
  min-width: 720px;
  --name-col: ${NAME_COL};
  @media (max-width: 768px) { --name-col: ${NAME_COL_PHONE}; }
`;

/* Month lines and the today line, drawn once behind every row */
const Lines = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: var(--name-col);
  right: 0;
  pointer-events: none;
`;

const Line = styled.span<{ $year: boolean }>`
  position: absolute;
  top: 34px;
  bottom: 0;
  width: 1px;
  background: ${({ $year }) => ($year ? 'var(--border-default)' : 'var(--border-subtle)')};
`;

const Today = styled.span`
  position: absolute;
  top: 26px;
  bottom: 0;
  width: 2px;
  margin-left: -1px;
  background: var(--color-accent);
  &::before {
    content: '';
    position: absolute;
    top: -3px;
    left: -3px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-accent);
  }
`;

const HeadRow = styled.div`
  display: grid;
  grid-template-columns: var(--name-col) minmax(0, 1fr);
  height: 34px;
  border-bottom: 1px solid var(--border-default);
`;

const Months = styled.div`
  position: relative;
`;

const MonthLabel = styled.span`
  position: absolute;
  top: 6px;
  padding-left: 8px;
  overflow: hidden;
  white-space: nowrap;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-muted);
`;

const GroupHead = styled.h2`
  position: relative;
  margin: 0;
  padding: 26px 0 10px;
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 300;
  color: var(--text-secondary);
  /* The heading sits in the name column; the month lines carry on beside it */
  width: var(--name-col);
`;

const Row = styled.div<{ $child?: boolean }>`
  display: grid;
  grid-template-columns: var(--name-col) minmax(0, 1fr);
  align-items: center;
  min-height: ${({ $child }) => ($child ? '38px' : '52px')};
  border-top: 1px solid var(--border-subtle);
`;

const NameCell = styled.div<{ $child?: boolean }>`
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  padding: 0 14px 0 ${({ $child }) => ($child ? '30px' : '0')};
  /* Phones scroll the track sideways: the names stay put */
  @media (max-width: 768px) {
    position: sticky;
    left: 0;
    z-index: 2;
    align-self: stretch;
    background: var(--bg-app);
    padding-right: 8px;
  }
`;

const Fold = styled.button`
  flex: none;
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  &:hover { color: var(--text-primary); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 1px; }
`;

const FoldGap = styled.span`
  flex: none;
  width: 26px;
`;

const Name = styled.button<{ $child?: boolean; $done?: boolean }>`
  min-width: 0;
  padding: 0;
  border: none;
  background: transparent;
  text-align: left;
  font-family: var(--font-sans);
  font-size: ${({ $child }) => ($child ? '14px' : '16px')};
  color: ${({ $child }) => ($child ? 'var(--text-soft)' : 'var(--text-secondary)')};
  text-decoration: ${({ $done }) => ($done ? 'line-through' : 'none')};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  &:hover { color: var(--text-primary); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  small { margin-left: 8px; font-size: 13px; color: var(--text-muted); text-decoration: none; display: inline-block; }
`;

const Track = styled.div`
  position: relative;
  align-self: stretch;
  min-height: inherit;
`;

const Bar = styled.div<{ $child?: boolean; $open: boolean; $cutLeft: boolean; $cutRight: boolean; $drag: boolean; $static: boolean }>`
  position: absolute;
  top: 50%;
  height: ${({ $child }) => ($child ? '10px' : '18px')};
  margin-top: ${({ $child }) => ($child ? '-5px' : '-9px')};
  min-width: 6px;
  border-radius: ${({ $cutLeft, $cutRight }) => `${$cutLeft ? 0 : 6}px ${$cutRight ? 0 : 6}px ${$cutRight ? 0 : 6}px ${$cutLeft ? 0 : 6}px`};
  background: ${({ $open }) => ($open ? 'transparent' : 'var(--progress-track, var(--bg-row-hover))')};
  border: ${({ $open }) => ($open ? '1px dashed var(--border-dashed, var(--border-strong))' : 'none')};
  overflow: hidden;
  cursor: ${({ $static, $drag }) => ($static ? 'pointer' : $drag ? 'grabbing' : 'grab')};
  touch-action: ${({ $static }) => ($static ? 'auto' : 'none')};
  outline: none;
  &:focus-visible { box-shadow: 0 0 0 2px var(--bg-app), 0 0 0 4px var(--color-accent); }
  ${({ $drag }) => ($drag ? 'box-shadow: 0 0 0 2px var(--bg-app), 0 0 0 3px var(--color-accent-line);' : '')}
`;

const Fill = styled.span`
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--color-accent-fill, var(--color-accent));
`;

/* The two ends: grab one to change just that date */
const Edge = styled.span<{ $side: 'start' | 'end' }>`
  position: absolute;
  top: 0;
  bottom: 0;
  ${({ $side }) => ($side === 'start' ? 'left: 0;' : 'right: 0;')}
  width: 8px;
  cursor: ew-resize;
`;

const When = styled.span`
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  margin-left: 10px;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-muted);
  white-space: nowrap;
  pointer-events: none;
`;

const Outside = styled.button<{ $side: 'left' | 'right' }>`
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  ${({ $side }) => ($side === 'left' ? 'left: 10px;' : 'right: 10px;')}
  padding: 0;
  border: none;
  background: transparent;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-muted);
  cursor: pointer;
  &:hover { color: var(--text-primary); }
`;

interface Dragging { id: number; mode: DragMode; x: number; delta: number; moved: boolean }

interface PlanTimelineProps {
  scale: TimelineScale;
  window: TimelineWindow;
  today: string;
  groups: TimelineGroup[];
  /** Goal ids whose milestones show */
  open: Set<number>;
  onToggle: (id: number) => void;
  onOpen: (id: number) => void;
  /** A bar was moved or resized */
  onChange: (id: number, dates: BarDates) => void;
  /** Bring a bar that's outside the window into view */
  onReveal: (day: string) => void;
  readOnly?: boolean;
}

export function PlanTimeline({ scale, window: w, today, groups, open, onToggle, onOpen, onChange, onReveal, readOnly }: PlanTimelineProps) {
  const [drag, setDrag] = useState<Dragging | null>(null);
  const trackWidth = useRef(0);
  // The click a finished drag fires must not open the entry
  const dragEnded = useRef(0);
  const ticks = timelineTicks(scale, w);
  const todayAt = fractionOf(today, w);

  const begin = (e: PointerEvent<HTMLElement>, row: TimelineRow, mode: DragMode) => {
    if (readOnly || e.button !== 0) return;
    const track = (e.currentTarget.closest('[data-track]') as HTMLElement | null);
    trackWidth.current = track?.getBoundingClientRect().width ?? 0;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.stopPropagation();
    setDrag({ id: row.id, mode, x: e.clientX, delta: 0, moved: false });
  };
  const move = (e: PointerEvent<HTMLElement>) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const delta = dragDays(dx, trackWidth.current, w);
    if (delta !== drag.delta || (!drag.moved && Math.abs(dx) > 4)) setDrag({ ...drag, delta, moved: drag.moved || Math.abs(dx) > 4 });
  };
  const end = (row: TimelineRow) => {
    if (!drag) return;
    if (drag.moved) dragEnded.current = Date.now();
    if (drag.delta) onChange(row.id, draggedDates(row.dates, drag.delta, drag.mode, w));
    setDrag(null);
  };
  const click = (id: number) => { if (Date.now() - dragEnded.current > 300) onOpen(id); };

  const key = (e: KeyboardEvent<HTMLElement>, row: TimelineRow) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(row.id); return; }
    if (readOnly || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    const step = (e.shiftKey ? 1 : 7) * (e.key === 'ArrowLeft' ? -1 : 1);
    onChange(row.id, draggedDates(row.dates, step, e.altKey ? 'end' : 'move', w));
  };

  const renderRow = (row: TimelineRow, child: boolean) => {
    const dates = drag?.id === row.id ? draggedDates(row.dates, drag.delta, drag.mode, w) : row.dates;
    const span = barSpan(dates, w);
    const kids = row.children ?? [];
    const isOpen = open.has(row.id);
    const range = dates.end ? `${shortDay(dates.start, today)} to ${shortDay(dates.end, today)}` : `from ${shortDay(dates.start, today)}, no target date`;
    const before = !span && dates.start < w.from;
    return (
      <div key={row.id}>
        <Row $child={child} role="row">
          <NameCell $child={child} role="rowheader">
            {!child && (kids.length > 0 ? (
              <Fold type="button" aria-expanded={isOpen} aria-label={`${isOpen ? 'Hide' : 'Show'} milestones of ${row.title}`} onClick={() => onToggle(row.id)}>
                <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} size={16} strokeWidth={2} />
              </Fold>
            ) : <FoldGap />)}
            <Name type="button" $child={child} $done={row.done} title={row.title} onClick={() => onOpen(row.id)}>
              {row.title}{row.note && <small>{row.note}</small>}
            </Name>
          </NameCell>
          <Track data-track role="cell">
            {span ? (<>
              <Bar
                role="button" tabIndex={0} $child={child} $open={span.open} $cutLeft={span.cutLeft} $cutRight={span.cutRight}
                $drag={drag?.id === row.id && drag.moved} $static={!!readOnly}
                style={{ left: `${span.left * 100}%`, width: `${span.width * 100}%` }}
                aria-label={`${row.title}, ${range}${readOnly ? '' : '. Arrow keys move it a week, with Shift a day, with Alt its end.'}`}
                title={`${row.title} · ${dates.end ? `${shortDay(dates.start, today)} – ${shortDay(dates.end, today)}` : 'No target date'}`}
                onPointerDown={e => begin(e, row, 'move')} onPointerMove={move} onPointerUp={() => end(row)} onPointerCancel={() => setDrag(null)}
                onClick={() => click(row.id)} onKeyDown={e => key(e, row)}
              >
                {!span.open && <Fill style={{ width: `${Math.round((row.done ? 1 : row.progress ?? 0) * 100)}%` }} />}
                {!readOnly && !span.cutLeft && <Edge $side="start" onPointerDown={e => begin(e, row, 'start')} />}
                {!readOnly && !span.cutRight && <Edge $side="end" onPointerDown={e => begin(e, row, 'end')} />}
              </Bar>
              {!span.cutRight && span.left + span.width < 0.86 && (
                <When style={{ left: `${(span.left + span.width) * 100}%` }}>
                  {dates.end ? shortDay(dates.end, today) : 'No target date'}
                </When>
              )}
            </>) : (
              <Outside type="button" $side={before ? 'left' : 'right'} onClick={() => onReveal(dates.start)}
                aria-label={`${row.title} is ${before ? 'earlier' : 'later'}, ${range}. Show it.`}>
                {before ? `‹ ${shortDay(dates.end || dates.start, today)}` : `${shortDay(dates.start, today)} ›`}
              </Outside>
            )}
          </Track>
        </Row>
        {!child && isOpen && kids.map(k => renderRow(k, true))}
      </div>
    );
  };

  return (
    <Scroll>
      <Grid role="table" aria-label="Roadmap">
        <Lines aria-hidden="true">
          {ticks.map(t => <Line key={t.day} $year={t.year} style={{ left: `${t.left * 100}%` }} />)}
          {todayAt >= 0 && todayAt <= 1 && <Today style={{ left: `${todayAt * 100}%` }} />}
        </Lines>
        <HeadRow aria-hidden="true">
          <span />
          <Months>
            {ticks.map(t => <MonthLabel key={t.day} style={{ left: `${t.left * 100}%`, width: `${t.width * 100}%` }}>{t.label}</MonthLabel>)}
          </Months>
        </HeadRow>
        {groups.map(g => (
          <section key={g.key} aria-label={g.label} role="rowgroup">
            <GroupHead>{g.label}</GroupHead>
            {g.rows.map(r => renderRow(r, false))}
          </section>
        ))}
      </Grid>
    </Scroll>
  );
}
