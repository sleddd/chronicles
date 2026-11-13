import { Fragment, useCallback, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import styled from 'styled-components';
import {
  DndContext, DragOverlay, closestCenter, pointerWithin, KeyboardSensor, MouseSensor, TouchSensor, useDroppable,
  useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MaterialIcon } from '../atoms/MaterialIcon.js';
import { Kicker, CardTitle, Chip } from './KanbanBoard.js';
import { DEFAULT_PART, PLANNER_ROWS, type DayPart } from '../../utils/planner.js';

/* The week / day planner: an Unscheduled list beside a ruled grid — a column
   per day, a row per part of the day (Morning, Noon, Night) — like
   the roadmap: hairlines, no panels. Tasks are shaded cards. Drag one onto a
   day's Morning / Noon / Night, between days, up and down within
   a cell, or back to Unscheduled. Every card also has a small calendar button
   that sets its day without dragging (phones, keyboards). No hours. Props only. */

export interface PlannerCard {
  id: number;
  title: string;
  /** Small accent line above the title (its goal or milestone) */
  kicker?: string;
  /** "Due Nov 14" */
  due?: string;
  /** A quiet note ("From Nov 10" on a task that rolled forward) */
  note?: string;
  done: boolean;
  /** The day it is planned for ('' = none) — the calendar button's value */
  day: string;
  /** The part of that day (none given = Morning) */
  part?: DayPart | '';
}

/** An event or meeting on the day: shown at the top of its part of the day, not draggable */
export interface PlannerEvent { key: string; id: number; title: string; when: string; part?: DayPart | '' }

export interface PlannerLane {
  day: string;
  label: string;
  today: boolean;
  events: PlannerEvent[];
  cards: PlannerCard[];
  /** Anything else the day shows under its tasks (habits due) */
  extra?: ReactNode;
}

const UNSCHEDULED = 'unscheduled';
const cellId = (day: string, part: DayPart) => `cell:${day}:${part}`;

/* ── Styles ── */

const Wrap = styled.div<{ $day: boolean; $folded: boolean }>`
  display: grid;
  grid-template-columns: ${({ $day, $folded }) => ($folded ? '48px' : $day ? '320px' : '264px')} minmax(0, 1fr);
  align-items: start;
  @media (max-width: 900px) {
    grid-template-columns: minmax(0, 1fr);
    gap: 28px;
    /* The days first, what's left to plan under them */
    & > :first-child { order: 2; }
  }
`;

/* What's left to plan: a plain column, ruled off from the days */
const Backlog = styled.section<{ $over: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  min-height: 200px;
  padding: 0 16px 12px 0;
  border-right: 1px solid var(--border-subtle);
  background: ${({ $over }) => ($over ? 'var(--bg-lane-over)' : 'transparent')};
  transition: background 120ms ease;
  @media (max-width: 900px) { padding-right: 0; border-right: none; border-top: 1px solid var(--border-default); padding-top: 20px; }
`;

/* The column's name and its fold button */
const BacklogHead = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
`;

const FoldBtn = styled.button`
  flex: none;
  width: 30px;
  height: 30px;
  margin-top: 2px;
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

/* Folded: a narrow strip — the button to open it over its name read sideways (still somewhere to drop a card) */
const Folded = styled.section<{ $over: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  min-height: 200px;
  height: 100%;
  padding-right: 16px;
  border-right: 1px solid var(--border-subtle);
  background: ${({ $over }) => ($over ? 'var(--bg-lane-over)' : 'transparent')};
  transition: background 120ms ease;
  @media (max-width: 900px) {
    flex-direction: row;
    min-height: 0;
    height: auto;
    padding: 16px 0 0;
    border-right: none;
    border-top: 1px solid var(--border-default);
  }
`;

/* Its name read sideways. A component of its own: a bare "span" rule here would also
   restyle the fold button's icon (a span), which then prints its glyph name as text */
const FoldedName = styled.p`
  margin: 0;
  writing-mode: vertical-rl;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-muted);
  white-space: nowrap;
  @media (max-width: 900px) { writing-mode: horizontal-tb; }
`;

const BacklogTitle = styled.h3`
  margin: 0;
  font-family: var(--font-display);
  font-size: 19px;
  font-weight: 300;
  line-height: 34px;
  color: var(--text-primary);
`;

const Scroll = styled.div`
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
`;

/* The grid: a narrow column naming the parts of the day, then a column per day.
   The names fold away (`$labels` false) to a slim strip holding the button that
   brings them back */
const Grid = styled.div<{ $cols: number; $labels: boolean }>`
  display: grid;
  grid-template-columns: ${({ $labels }) => ($labels ? '120px' : '40px')} repeat(${({ $cols }) => $cols}, minmax(${({ $cols }) => ($cols > 1 ? '150px' : '0')}, 1fr));
  @media (max-width: 768px) {
    grid-template-columns: ${({ $labels }) => ($labels ? '96px' : '36px')} repeat(${({ $cols }) => $cols}, ${({ $cols }) => ($cols > 1 ? 'min(72vw, 260px)' : 'minmax(0, 1fr)')});
  }
`;

/* Over the names: the button that folds them away (or brings them back) */
const Corner = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  padding: 2px 4px 0 0;
  border-bottom: 1px solid var(--border-default);
`;

/* Hidden from sight, still read out (a folded row keeps its name for screen readers) */
const SrOnly = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
`;

/* Whether the names of the parts of the day show, remembered per browser */
const LABELS_FOLDED_KEY = 'planner-labels-folded-v1';
function loadLabelsFolded(): boolean {
  try { return localStorage.getItem(LABELS_FOLDED_KEY) === '1'; } catch { return false; }
}

/* A day's name over the firmer rule; today's in the soft accent over an accent rule */
const DayHead = styled.div<{ $today: boolean }>`
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-height: 44px;
  padding: 4px 10px 9px;
  border-bottom: ${({ $today }) => ($today ? '2px solid var(--color-accent)' : '1px solid var(--border-default)')};
  border-left: 1px solid var(--border-subtle);
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--color-accent-soft);
`;

const DayName = styled.button<{ $today: boolean }>`
  padding: 0;
  border: none;
  background: transparent;
  text-align: left;
  font-family: var(--font-display);
  font-size: 19px;
  font-weight: 300;
  line-height: 1.25;
  color: ${({ $today }) => ($today ? 'var(--color-accent-soft)' : 'var(--text-primary)')};
  cursor: ${({ disabled }) => (disabled ? 'default' : 'pointer')};
  &:hover:not(:disabled) { color: var(--color-accent-link); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

/* "Morning" over "Before 12 PM" at the start of its row — a button that folds
   the row (a chevron before the name, turned down while open) */
const PartLabel = styled.button<{ $first: boolean }>`
  position: relative;
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  align-content: start;
  column-gap: 4px;
  row-gap: 2px;
  margin: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
  > span:first-child { color: var(--text-muted); transition: transform 150ms ease; }
  &[aria-expanded='true'] > span:first-child { transform: rotate(90deg); }
  > small { grid-column: 2; }
  &:hover, &:hover > span:first-child { color: var(--text-primary); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: -2px; }
  @media (prefers-reduced-motion: reduce) { > span:first-child { transition: none; } }
  /* Room on the left, so the names don't sit against the rule beside Unscheduled */
  padding: 12px 10px 0 10px;
  border-top: ${({ $first }) => ($first ? 'none' : '1px solid var(--border-subtle)')};
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: 500;
  color: var(--text-secondary);
  small { font-size: 12px; font-weight: 400; color: var(--text-muted); }
  @media (max-width: 768px) {
    position: sticky;
    left: 0;
    z-index: 2;
    padding-left: 4px;
    background: var(--bg-app);
  }
`;

/* One part of one day: where cards are dropped (still a drop target while its
   row is folded, just short, with a muted count of what's in it) */
const Cell = styled.div<{ $first: boolean; $over: boolean; $folded?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  min-height: ${({ $folded }) => ($folded ? '48px' : '92px')};
  padding: ${({ $folded }) => ($folded ? '14px 10px' : '10px 8px 12px')};
  border-top: ${({ $first }) => ($first ? 'none' : '1px solid var(--border-subtle)')};
  border-left: 1px solid var(--border-subtle);
  background: ${({ $over }) => ($over ? 'var(--bg-lane-over)' : 'transparent')};
  transition: background 120ms ease;
`;

/* A folded row's cell: what it holds, muted ("2 tasks · 1 event") */
const FoldedNote = styled.span`
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--text-muted);
`;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/* Folded rows, remembered per browser */
const FOLDED_PARTS_KEY = 'planner-parts-folded-v1';
function loadFoldedParts(): DayPart[] {
  try {
    const raw = JSON.parse(localStorage.getItem(FOLDED_PARTS_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((v): v is DayPart => PLANNER_ROWS.some(r => r.value === v)) : [];
  } catch { return []; }
}

/* An empty space says what it is ("Morning"), so a blank week still reads */
const Blank = styled.span`
  margin: auto;
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--text-faint, var(--text-disabled));
  pointer-events: none;
`;

const FootCell = styled.div`
  min-width: 0;
  padding: 10px 8px 4px;
  border-top: 1px solid var(--border-subtle);
  border-left: 1px solid var(--border-subtle);
`;

const FootGap = styled.span`
  border-top: 1px solid var(--border-subtle);
`;

const EventRow = styled.button`
  display: flex;
  flex-direction: column;
  gap: 1px;
  width: 100%;
  padding: 2px 4px 2px 10px;
  border: none;
  border-left: 2px solid var(--color-accent-line);
  background: transparent;
  text-align: left;
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.35;
  color: var(--text-secondary);
  overflow-wrap: anywhere;
  cursor: pointer;
  small { font-size: 12px; color: var(--text-muted); }
  &:hover { color: var(--text-primary); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

const Group = styled.h4`
  margin: 6px 0 0;
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
`;

const Empty = styled.div`
  padding: 14px 8px;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-disabled);
  text-align: center;
`;

/* A task: a shaded card on the ruled grid */
const TaskCard = styled.article<{ $dragging?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 10px 8px;
  background: var(--bg-lane);
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-lg, 6px);
  cursor: pointer;
  opacity: ${({ $dragging }) => ($dragging ? 0.4 : 1)};
  touch-action: manipulation;
  /* Press-and-hold picks the card up — no iOS callout or text selection */
  -webkit-touch-callout: none;
  user-select: none;
  transition: border-color 120ms;
  &:hover { border-color: var(--border-strong); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

const Line = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 8px;
`;

const Text = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
`;

const Title = styled(CardTitle)`
  font-size: 15px;
`;

const Foot = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-height: 26px;
`;

const Note = styled.span`
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--text-muted);
`;

/* The calendar button: the day picker lies invisibly over it */
const DayBtn = styled.label`
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 26px;
  margin-left: auto;
  border-radius: 50%;
  color: var(--text-tertiary);
  cursor: pointer;
  &:hover { color: var(--text-primary); }
  &:focus-within { outline: 2px solid var(--color-accent); outline-offset: 1px; }
  input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    padding: 0;
    opacity: 0;
    cursor: pointer;
  }
`;

/* "Add a task": the border is on the wrapper (inputs are flat app-wide) */
const AddBox = styled.label`
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 10px;
  border: 1px dashed var(--border-dashed, var(--border-default));
  border-radius: var(--r-lg, 6px);
  color: var(--text-tertiary);
  &:hover { border-color: var(--border-strong); }
  &:focus-within { border-style: solid; border-color: var(--color-accent-line); }
  input {
    flex: 1;
    min-width: 0;
    height: 32px;
    padding: 0;
    border: none !important;
    background: transparent !important;
    outline: none;
    font-family: var(--font-sans);
    font-size: 14px;
    color: var(--text-primary);
  }
  input::placeholder { color: var(--text-placeholder, var(--text-muted)); }
`;

const Floating = styled(TaskCard)`
  cursor: grabbing;
  box-shadow: var(--shadow-lg);
  border-color: var(--color-accent-line);
`;

/* ── Pieces ── */

function DropZone({ id, children }: { id: string; children: (over: boolean, ref: (el: HTMLElement | null) => void) => ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return <>{children(isOver, setNodeRef)}</>;
}

interface CardActions {
  onOpen: (id: number) => void;
  /** Plan a task for a day ('' = take it off). `part` is where in the day it was dropped; undefined = leave that as it is */
  onSchedule: (id: number, day: string, overId: number | null, part?: DayPart | '') => void;
}

/* No tick on a planner card: a task is marked done where it lives (its board or the journal); a done one shows struck through */
function CardBody({ card, onSchedule }: { card: PlannerCard } & Partial<CardActions>) {
  // Controls inside a draggable card must not start a drag or open it
  const quiet = { onPointerDown: (e: React.SyntheticEvent) => e.stopPropagation(), onKeyDown: (e: React.SyntheticEvent) => e.stopPropagation(), onClick: (e: React.SyntheticEvent) => e.stopPropagation() };
  return (<>
    <Line>
      <Text>
        {card.kicker && <Kicker>{card.kicker}</Kicker>}
        <Title $done={card.done}>{card.title}</Title>
      </Text>
    </Line>
    <Foot>
      {card.due && <Chip><MaterialIcon $size={15} aria-hidden="true">flag</MaterialIcon>{card.due}</Chip>}
      {card.note && <Note>{card.note}</Note>}
      <DayBtn title={card.day ? 'Change the day' : 'Plan for a day'} {...quiet}>
        <MaterialIcon $size={18} aria-hidden="true">event</MaterialIcon>
        <input type="date" value={card.day} aria-label={`Day for ${card.title}`}
          onChange={e => onSchedule?.(card.id, e.target.value, null)}
          onClick={e => { e.stopPropagation(); try { e.currentTarget.showPicker?.(); } catch { /* not supported */ } }} />
      </DayBtn>
    </Foot>
  </>);
}

function SortableCard({ card, ...actions }: { card: PlannerCard } & CardActions) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  return (
    <TaskCard ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} $dragging={isDragging}
      {...attributes} {...listeners}
      onClick={() => actions.onOpen(card.id)}
      onKeyDown={e => { if (e.key === 'Enter') actions.onOpen(card.id); }}>
      <CardBody card={card} {...actions} />
    </TaskCard>
  );
}

function AddTask({ label, onAdd }: { label: string; onAdd: (text: string) => void }) {
  const [text, setText] = useState('');
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && text.trim()) { e.preventDefault(); onAdd(text.trim()); setText(''); }
    if (e.key === 'Escape') setText('');
  };
  return (
    <AddBox>
      <MaterialIcon $size={18} aria-hidden="true">add</MaterialIcon>
      <input value={text} onChange={e => setText(e.target.value)} onKeyDown={onKey} placeholder="Add a task" aria-label={label} maxLength={200} />
    </AddBox>
  );
}

/* A card under the pointer wins over the lane behind it; the keyboard (no pointer) falls back to the nearest */
const collisions: CollisionDetection = args => {
  const hits = pointerWithin(args);
  if (!hits.length) return closestCenter(args);
  const cards = hits.filter(h => typeof h.id === 'number');
  return cards.length ? cards : hits;
};

/* ── Board ── */

interface PlannerBoardProps extends CardActions {
  lanes: PlannerLane[];
  /** Unfinished tasks whose day has passed */
  overdue: PlannerCard[];
  /** Unfinished tasks with no day */
  open: PlannerCard[];
  /** Search / filters over the Unscheduled list */
  tools?: ReactNode;
  onOpenEvent: (id: number) => void;
  /** A new task typed under a day ('' = Unscheduled) */
  onAdd: (day: string, text: string) => void;
  /** A day's name was pressed (the week view opens that day); omitted = plain text */
  onPickDay?: (day: string) => void;
  /** Unscheduled folded down to a narrow strip (false when left out) */
  folded?: boolean;
  /** Fold or open Unscheduled; omitted = no fold button */
  onFold?: (folded: boolean) => void;
}

export function PlannerBoard({ lanes, overdue, open, tools, onOpen, onSchedule, onOpenEvent, onAdd, onPickDay, folded = false, onFold }: PlannerBoardProps) {
  const [labelsFolded, setLabelsFolded] = useState(loadLabelsFolded);
  const [foldedParts, setFoldedParts] = useState<DayPart[]>(loadFoldedParts);
  const toggleFoldedPart = (part: DayPart) => setFoldedParts(prev => {
    const next = prev.includes(part) ? prev.filter(p => p !== part) : [...prev, part];
    try { localStorage.setItem(FOLDED_PARTS_KEY, JSON.stringify(next)); } catch { /* storage refused */ }
    return next;
  });
  const toggleLabels = () => setLabelsFolded(prev => {
    try { localStorage.setItem(LABELS_FOLDED_KEY, prev ? '0' : '1'); } catch { /* storage refused */ }
    return !prev;
  });
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const backlog = [...overdue, ...open];
  const all = [...backlog, ...lanes.flatMap(l => l.cards)];
  const [dragging, setDragging] = useState<number | null>(null);
  const floating = dragging === null ? undefined : all.find(c => c.id === dragging);

  // Where a card is showing: its day and part of the day, or day '' for Unscheduled
  const placeOf = (id: number): { day: string; part: DayPart | '' } | undefined => {
    if (backlog.some(c => c.id === id)) return { day: '', part: '' };
    for (const l of lanes) {
      const c = l.cards.find(x => x.id === id);
      if (c) return { day: l.day, part: c.part || DEFAULT_PART };
    }
    return undefined;
  };

  // The click a drop fires must not open the card
  const dragUntil = useRef(0);
  const openCard = useCallback((id: number) => { if (Date.now() >= dragUntil.current) onOpen(id); }, [onOpen]);

  const handleDragStart = ({ active }: DragStartEvent) => { dragUntil.current = Number.POSITIVE_INFINITY; setDragging(Number(active.id)); };
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    dragUntil.current = Date.now() + 300;
    setDragging(null);
    if (!over) return;
    const id = Number(active.id);
    const from = placeOf(id);
    const onCard = typeof over.id === 'number';
    const overId = String(over.id);
    let to: { day: string; part: DayPart | '' } | undefined;
    if (onCard) to = placeOf(Number(over.id));
    else if (overId === UNSCHEDULED) to = { day: '', part: '' };
    else if (overId.startsWith('cell:')) {
      const [, day, part] = overId.split(':');
      to = { day, part: part as DayPart | '' };
    }
    if (!from || !to) return;
    if (to.day === '') { if (from.day !== '') onSchedule(id, '', null, ''); return; }
    if (from.day === to.day && from.part === to.part && (!onCard || over.id === active.id)) return;
    onSchedule(id, to.day, onCard ? Number(over.id) : null, to.part);
  };

  const actions = { onOpen: openCard, onSchedule };
  const single = lanes.length === 1;

  return (
    <DndContext sensors={sensors} collisionDetection={collisions} onDragStart={handleDragStart}
      onDragCancel={() => { dragUntil.current = Date.now() + 300; setDragging(null); }} onDragEnd={handleDragEnd}>
      <Wrap $day={single} $folded={folded}>
        <DropZone id={UNSCHEDULED}>
          {(over, ref) => (folded ? (
            <Folded ref={ref} $over={over} aria-label="Unscheduled">
              <FoldBtn type="button" aria-expanded={false} aria-label="Show unscheduled tasks" title="Show unscheduled tasks" onClick={() => onFold?.(false)}>
                <MaterialIcon $size={20} aria-hidden="true">chevron_right</MaterialIcon>
              </FoldBtn>
              <FoldedName>Unscheduled</FoldedName>
            </Folded>
          ) : (
            <Backlog ref={ref} $over={over} aria-label="Unscheduled">
              <BacklogHead>
                <BacklogTitle>Unscheduled</BacklogTitle>
                {onFold && (
                  <FoldBtn type="button" aria-expanded aria-label="Hide unscheduled tasks" title="Hide unscheduled tasks" onClick={() => onFold(true)}>
                    <MaterialIcon $size={20} aria-hidden="true">chevron_left</MaterialIcon>
                  </FoldBtn>
                )}
              </BacklogHead>
              {tools}
              <SortableContext items={backlog.map(c => c.id)} strategy={verticalListSortingStrategy}>
                {overdue.length > 0 && <Group>Overdue</Group>}
                {overdue.map(c => <SortableCard key={c.id} card={c} {...actions} />)}
                {overdue.length > 0 && open.length > 0 && <Group>No day yet</Group>}
                {open.map(c => <SortableCard key={c.id} card={c} {...actions} />)}
                {backlog.length === 0 && <Empty>Nothing left to plan</Empty>}
              </SortableContext>
              <AddTask label="Add a task with no day" onAdd={text => onAdd('', text)} />
            </Backlog>
          ))}
        </DropZone>

        <div>
          <Scroll>
            <Grid $cols={lanes.length} $labels={!labelsFolded} role="table" aria-label="Planner">
              <Corner>
                <FoldBtn type="button" aria-expanded={!labelsFolded}
                  aria-label={labelsFolded ? 'Show morning, noon and night' : 'Hide morning, noon and night'}
                  title={labelsFolded ? 'Show morning, noon and night' : 'Hide morning, noon and night'}
                  onClick={toggleLabels}>
                  <MaterialIcon $size={20} aria-hidden="true">{labelsFolded ? 'chevron_right' : 'chevron_left'}</MaterialIcon>
                </FoldBtn>
              </Corner>
              {lanes.map(lane => (
                <DayHead key={lane.day} $today={lane.today} role="columnheader">
                  <DayName type="button" $today={lane.today} disabled={!onPickDay} onClick={() => onPickDay?.(lane.day)}
                    title={onPickDay ? 'Open this day' : undefined}>
                    {lane.label}
                  </DayName>
                  {lane.today && <span>Today</span>}
                </DayHead>
              ))}

              {PLANNER_ROWS.map((row, r) => (
                <Fragment key={row.value}>
                  {labelsFolded
                    ? <PartLabel as="div" $first={r === 0} role="rowheader"><SrOnly>{row.label}</SrOnly></PartLabel>
                    : (
                      <PartLabel type="button" $first={r === 0} role="rowheader" aria-expanded={!foldedParts.includes(row.value)}
                        title={`${foldedParts.includes(row.value) ? 'Show' : 'Hide'} ${row.label.toLowerCase()}`}
                        onClick={() => toggleFoldedPart(row.value)}>
                        <MaterialIcon $size={18} aria-hidden="true">chevron_right</MaterialIcon>
                        {row.label}<small>{row.hours}</small>
                      </PartLabel>
                    )}
                  {lanes.map(lane => {
                    const cards = lane.cards.filter(c => (c.part || DEFAULT_PART) === row.value);
                    const events = lane.events.filter(ev => (ev.part || DEFAULT_PART) === row.value);
                    if (foldedParts.includes(row.value)) {
                      const summary = [cards.length && plural(cards.length, 'task'), events.length && plural(events.length, 'event')].filter(Boolean).join(' · ');
                      return (
                        <DropZone key={lane.day} id={cellId(lane.day, row.value)}>
                          {(over, ref) => (
                            <Cell ref={ref} $first={r === 0} $over={over} $folded role="cell" aria-label={`${lane.label}, ${row.label}, folded`}>
                              {summary && <FoldedNote>{summary}</FoldedNote>}
                            </Cell>
                          )}
                        </DropZone>
                      );
                    }
                    return (
                      <DropZone key={lane.day} id={cellId(lane.day, row.value)}>
                        {(over, ref) => (
                          <Cell ref={ref} $first={r === 0} $over={over} role="cell" aria-label={`${lane.label}, ${row.label}`}>
                            {events.map(ev => (
                              <EventRow key={ev.key} type="button" onClick={() => onOpenEvent(ev.id)}>
                                {ev.title}<small>{ev.when}</small>
                              </EventRow>
                            ))}
                            <SortableContext items={cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
                              {cards.map(c => <SortableCard key={c.id} card={c} {...actions} />)}
                            </SortableContext>
                            {cards.length === 0 && events.length === 0 && <Blank aria-hidden="true">{row.label}</Blank>}
                          </Cell>
                        )}
                      </DropZone>
                    );
                  })}
                </Fragment>
              ))}

              <FootGap aria-hidden="true" />
              {lanes.map(lane => (
                <FootCell key={lane.day}>
                  <AddTask label={`Add a task on ${lane.label}`} onAdd={text => onAdd(lane.day, text)} />
                </FootCell>
              ))}
            </Grid>
          </Scroll>
          {lanes.map(lane => lane.extra && <Fragment key={lane.day}>{lane.extra}</Fragment>)}
        </div>
      </Wrap>
      <DragOverlay dropAnimation={null}>
        {floating ? <Floating as="div"><CardBody card={floating} /></Floating> : null}
      </DragOverlay>
    </DndContext>
  );
}
