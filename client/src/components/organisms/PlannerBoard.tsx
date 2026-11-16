import { Fragment, useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import styled from 'styled-components';
import {
  DndContext, DragOverlay, closestCenter, pointerWithin, KeyboardSensor, MouseSensor, TouchSensor, useDroppable,
  useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MaterialIcon } from '../atoms/MaterialIcon.js';
import { usePagePan } from '../../hooks/usePagePan.js';
import { Kicker, CardTitle, Chip } from './KanbanBoard.js';
import { DEFAULT_PART, PLANNER_ROWS, partsCovered, spanLabel, type DayPart } from '../../utils/planner.js';

/* The week / day planner: an Unscheduled list beside a ruled grid — a column
   per day, a row per part of the day (Morning, Noon, Night) — like
   the roadmap: hairlines, no panels. Tasks are shaded cards. Drag one onto a
   day's Morning / Noon / Night, between days, up and down within
   a cell, or back to Unscheduled. Every card also has a small calendar button
   that sets its day without dragging (phones, keyboards). A card on a day can
   be stretched over more of it — drag the grip at its foot down through Noon
   and Night (or use the arrow keys on it): it then shows in every part it
   covers, the later ones as a short "continued" strip. No hours. Props only. */

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
  /** The last part it covers, when stretched past its own (none = just its part) */
  partEnd?: DayPart | '';
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

/** Holding a card this close (px) to the days' left / right edge pages them, after a moment */
const EDGE_ZONE = 56;
const EDGE_DWELL_MS = 650;
/** How far (px) past the days' left edge still counts as holding it there */
const EDGE_SLACK = 32;

const DaysArea = styled.div`
  position: relative;
  min-width: 0;
`;

/* While a card is held at an edge: a soft accent band with a chevron, the way it will go */
/* While a card is in hand: the two places to hold it to change week — faint
   until the card is over one, then a firmer accent band */
const EdgeHint = styled.div<{ $side: 'prev' | 'next'; $active: boolean; $width: number }>`
  position: absolute;
  top: 0;
  bottom: 0;
  ${({ $side }) => ($side === 'prev' ? 'left: 0;' : 'right: 0;')}
  z-index: 3;
  width: ${({ $width }) => $width}px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  pointer-events: none;
  font-family: var(--font-sans);
  font-size: 12px;
  text-align: center;
  color: var(--color-accent-soft, var(--color-accent));
  opacity: ${({ $active }) => ($active ? 1 : 0.55)};
  background: ${({ $active }) => `color-mix(in srgb, var(--color-accent) ${$active ? 16 : 6}%, transparent)`};
  border-${({ $side }) => ($side === 'prev' ? 'left' : 'right')}: 2px ${({ $active }) => ($active ? 'solid' : 'dashed')} var(--color-accent-line, var(--color-accent));
  transition: opacity 120ms, background 120ms;
`;

/* Drag empty space (mouse), swipe (touch) or scroll sideways (trackpad) to
   move a week / day — usePagePan. Up-and-down scrolling stays the page's. */
const Scroll = styled.div<{ $panning: boolean }>`
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-x: contain;
  cursor: ${({ $panning }) => ($panning ? 'grabbing' : 'auto')};
  user-select: ${({ $panning }) => ($panning ? 'none' : 'auto')};
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
const TaskCard = styled.article<{ $dragging?: boolean; $stretched?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 10px 8px;
  background: var(--bg-lane);
  border: 1px solid var(--border-subtle);
  ${({ $stretched }) => ($stretched ? 'border-left: 3px solid var(--border-strong);' : '')}
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

/* The grip at the foot of a card on a day: drag it down (or up) to stretch the
   task over more of the day. Drawn, not an icon; wide enough for a thumb */
const Grip = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: calc(100% + 20px);
  height: 14px;
  margin: -4px -10px -8px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: ns-resize;
  touch-action: none;
  &::before {
    content: '';
    width: 28px;
    height: 3px;
    border-radius: 2px;
    background: var(--text-faint, var(--border-strong));
    transition: background 120ms, width 120ms;
  }
  &:hover::before, &:focus-visible::before, &[data-active='true']::before { background: var(--color-accent-line, var(--color-accent)); width: 40px; }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: -2px; border-radius: 4px; }
`;

/* A stretched task in a later part of its day: a short strip that reads as
   the same card going on (the same fill, a firmer left edge on both) */
const Continued = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  background: var(--bg-lane);
  border: 1px solid var(--border-subtle);
  border-left: 3px solid var(--border-strong);
  border-radius: var(--r-lg, 6px);
  cursor: pointer;
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.35;
  color: var(--text-secondary);
  overflow-wrap: anywhere;
  user-select: none;
  small { font-size: 12px; color: var(--text-muted); }
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

/** Starts stretching a card (pointer), or moves its end one part (keys) */
interface Stretching {
  onGripDown: (card: PlannerCard, day: string, e: React.PointerEvent) => void;
  onGripKey: (card: PlannerCard, e: React.KeyboardEvent) => void;
  /** The card being stretched right now */
  activeId: number | null;
}

/* The grip. Inside a draggable card, so nothing it does may start a drag or open the card */
function StretchGrip({ card, day, stretch }: { card: PlannerCard; day: string; stretch: Stretching }) {
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const covers = spanLabel(card.part || DEFAULT_PART, card.partEnd);
  return (
    <Grip type="button" data-active={stretch.activeId === card.id}
      aria-label={`Stretch ${card.title} over more of the day${covers ? ` (now ${covers.toLowerCase()})` : ''}. Arrow down for more, arrow up for less`}
      title="Drag to cover more of the day"
      onPointerDown={e => stretch.onGripDown(card, day, e)}
      onMouseDown={stop} onTouchStart={stop} onClick={stop}
      onKeyDown={e => { e.stopPropagation(); stretch.onGripKey(card, e); }} />
  );
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
      {card.day && spanLabel(card.part || DEFAULT_PART, card.partEnd) && <Note>{spanLabel(card.part || DEFAULT_PART, card.partEnd)}</Note>}
      <DayBtn title={card.day ? 'Change the day' : 'Plan for a day'} {...quiet}>
        <MaterialIcon $size={18} aria-hidden="true">event</MaterialIcon>
        <input type="date" value={card.day} aria-label={`Day for ${card.title}`}
          onChange={e => onSchedule?.(card.id, e.target.value, null)}
          onClick={e => { e.stopPropagation(); try { e.currentTarget.showPicker?.(); } catch { /* not supported */ } }} />
      </DayBtn>
    </Foot>
  </>);
}

/* `grip`: the card is on a day and ends in this part, so its foot carries the stretch grip */
function SortableCard({ card, grip, ...actions }: { card: PlannerCard; grip?: { day: string; stretch: Stretching } } & CardActions) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  const stretched = !!card.day && partsCovered(card.part || DEFAULT_PART, card.partEnd).length > 1;
  return (
    <TaskCard ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} $dragging={isDragging} $stretched={stretched}
      {...attributes} {...listeners}
      onClick={() => actions.onOpen(card.id)}
      onKeyDown={e => { if (e.key === 'Enter') actions.onOpen(card.id); }}>
      <CardBody card={card} {...actions} />
      {grip && <StretchGrip card={card} day={grip.day} stretch={grip.stretch} />}
    </TaskCard>
  );
}

/* A stretched task where it goes on: opens the task; its last part carries the grip */
function ContinuedCard({ card, grip, onOpen }: { card: PlannerCard; grip?: { day: string; stretch: Stretching }; onOpen: (id: number) => void }) {
  return (
    <Continued role="button" tabIndex={0} aria-label={`${card.title}, continued`}
      onClick={() => onOpen(card.id)}
      onKeyDown={e => { if (e.key === 'Enter') onOpen(card.id); }}>
      <span>{card.title}<br /><small>continued</small></span>
      {grip && <StretchGrip card={card} day={grip.day} stretch={grip.stretch} />}
    </Continued>
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
  /** A card was stretched (or shortened) to end in `end` — its own part = one part again. Omitted = no grip */
  onSpan?: (id: number, end: DayPart) => void;
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
  /** The previous / next week (or day): dragging or swiping the days sideways */
  onPrev?: () => void;
  onNext?: () => void;
}

export function PlannerBoard({ lanes: givenLanes, overdue, open, tools, onOpen, onSchedule, onSpan, onOpenEvent, onAdd, onPickDay, folded = false, onFold, onPrev, onNext }: PlannerBoardProps) {
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
  // Stretching a card: while the grip is held, the card shows the length it would get
  const [stretching, setStretching] = useState<{ id: number; end: DayPart } | null>(null);
  const lanes = stretching
    ? givenLanes.map(l => ({ ...l, cards: l.cards.map(c => (c.id === stretching.id ? { ...c, partEnd: stretching.end } : c)) }))
    : givenLanes;
  const backlog = [...overdue, ...open];
  const all = [...backlog, ...lanes.flatMap(l => l.cards)];
  const [dragging, setDragging] = useState<number | null>(null);
  // The card in hand, kept from the start: paging to another week while holding
  // it takes its own day (and the card) off the screen
  const dragCard = useRef<{ card: PlannerCard; from: { day: string; part: DayPart | '' } } | null>(null);
  const floating = dragging === null ? undefined : (all.find(c => c.id === dragging) ?? dragCard.current?.card);

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

  // Sideways drags and swipes page the days — never while a card is dragged
  const pan = usePagePan(() => onPrev?.(), () => onNext?.(), () => !onPrev || Date.now() < dragUntil.current);
  const gridRef = useRef<HTMLDivElement | null>(null);
  // The new days slide in from the side they came from
  useEffect(() => {
    const grid = gridRef.current;
    if (!pan.entered || !grid?.animate) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const from = pan.entered.from === 'right' ? 48 : -48;
    grid.animate([{ transform: `translateX(${from}px)`, opacity: 0.35 }, { transform: 'none', opacity: 1 }], { duration: 220, easing: 'ease-out' });
  }, [pan.entered]);

  const handleDragStart = ({ active }: DragStartEvent) => {
    dragUntil.current = Number.POSITIVE_INFINITY;
    const id = Number(active.id);
    const card = all.find(c => c.id === id);
    const from = placeOf(id);
    dragCard.current = card && from ? { card, from } : null;
    setDragging(id);
  };

  // Holding a card at the left or right edge of the days moves to the previous /
  // next week (or day) after a moment, and on again while it's held there
  const [edge, setEdge] = useState<'prev' | 'next' | null>(null);
  const [leftWidth, setLeftWidth] = useState(EDGE_ZONE);
  const pageRef = useRef(pan.page);
  pageRef.current = pan.page;
  const scrollEl = pan.el;
  useEffect(() => {
    if (dragging === null || !scrollEl || !onPrev || !onNext) return;
    let pos: { x: number; y: number } | null = null;
    const track = (e: PointerEvent | TouchEvent) => {
      const p = 'touches' in e ? e.touches[0] : e;
      if (p) pos = { x: p.clientX, y: p.clientY };
    };
    document.addEventListener('pointermove', track, { passive: true });
    document.addEventListener('touchmove', track, { passive: true });
    // Going back: the whole Morning / Noon / Night column (it takes no drops), at least EDGE_ZONE
    const leftZone = Math.max(EDGE_ZONE, (scrollEl.querySelector('[role="rowheader"]') as HTMLElement | null)?.offsetWidth ?? 0);
    setLeftWidth(leftZone);
    let side: 'prev' | 'next' | null = null;
    let since = 0;
    const timer = setInterval(() => {
      const r = scrollEl.getBoundingClientRect();
      let now: 'prev' | 'next' | null = null;
      if (pos && pos.y >= r.top && pos.y <= r.bottom) {
        const max = scrollEl.scrollWidth - scrollEl.clientWidth;
        // A wide week scrolls first (dnd-kit's auto-scroll); only at its end does it page
        // A little past the left edge still counts (only the right side is open-ended otherwise)
        if (pos.x >= r.left - EDGE_SLACK && pos.x <= r.left + leftZone && scrollEl.scrollLeft <= 1) now = 'prev';
        else if (pos.x >= r.right - EDGE_ZONE && scrollEl.scrollLeft >= max - 1) now = 'next';
      }
      if (now !== side) { side = now; since = Date.now(); setEdge(now); return; }
      if (side && Date.now() - since >= EDGE_DWELL_MS) { pageRef.current(side); since = Date.now(); }
    }, 80);
    return () => {
      clearInterval(timer);
      document.removeEventListener('pointermove', track);
      document.removeEventListener('touchmove', track);
      setEdge(null);
    };
  }, [dragging, scrollEl, onPrev, onNext]);
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    dragUntil.current = Date.now() + 300;
    setDragging(null);
    if (!over) return;
    const id = Number(active.id);
    const from = placeOf(id) ?? (dragCard.current?.card.id === id ? dragCard.current.from : undefined);
    dragCard.current = null;
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

  const partAt = (i: number): DayPart => PLANNER_ROWS[Math.max(0, Math.min(PLANNER_ROWS.length - 1, i))].value;
  const rowOf = (part: DayPart | '' | undefined) => Math.max(0, PLANNER_ROWS.findIndex(r => r.value === (part || DEFAULT_PART)));
  const stretch: Stretching = {
    activeId: stretching?.id ?? null,
    // Hold the grip and move down or up: the card ends in whichever part of its
    // day the pointer is level with (never before its own part)
    onGripDown: (card, day, e) => {
      if (e.button > 0) return;
      e.preventDefault();
      e.stopPropagation();
      const first = rowOf(card.part);
      const was = partAt(Math.max(first, rowOf(card.partEnd || card.part)));
      let end = was;
      setStretching({ id: card.id, end });
      const endAt = (y: number): DayPart => {
        const cells = [...(gridRef.current?.querySelectorAll<HTMLElement>('[data-part]') ?? [])].filter(el => el.dataset.day === day);
        let row = first;
        for (const el of cells) {
          const r = el.getBoundingClientRect();
          const i = rowOf(el.dataset.part as DayPart);
          if (y >= r.top && i > row) row = i;
        }
        return partAt(Math.max(first, row));
      };
      const move = (ev: PointerEvent) => {
        const next = endAt(ev.clientY);
        if (next !== end) { end = next; setStretching({ id: card.id, end }); }
      };
      const done = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', done);
        window.removeEventListener('pointercancel', done);
        // The click this release fires must not open the card
        dragUntil.current = Date.now() + 300;
        setStretching(null);
        if (ev.type === 'pointerup' && end !== was) onSpan?.(card.id, end);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', done);
      window.addEventListener('pointercancel', done);
    },
    onGripKey: (card, e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const first = rowOf(card.part);
      const now = Math.max(first, rowOf(card.partEnd || card.part));
      const next = Math.max(first, Math.min(PLANNER_ROWS.length - 1, now + (e.key === 'ArrowDown' ? 1 : -1)));
      if (next !== now) onSpan?.(card.id, partAt(next));
    },
  };
  const actions = { onOpen: openCard, onSchedule };
  const single = lanes.length === 1;

  return (
    <DndContext sensors={sensors} collisionDetection={collisions} onDragStart={handleDragStart}
      onDragCancel={() => { dragUntil.current = Date.now() + 300; dragCard.current = null; setDragging(null); }} onDragEnd={handleDragEnd}>
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

        <DaysArea>
          {dragging !== null && onPrev && onNext && (['prev', 'next'] as const).map(side => (
            <EdgeHint key={side} $side={side} $active={edge === side} $width={side === 'prev' ? leftWidth : EDGE_ZONE} aria-hidden="true">
              <MaterialIcon $size={22}>{side === 'prev' ? 'chevron_left' : 'chevron_right'}</MaterialIcon>
              {side === 'prev' && leftWidth > 90 && (single ? 'Previous day' : 'Previous week')}
            </EdgeHint>
          ))}
          <Scroll ref={pan.ref} $panning={pan.panning} {...pan.bind}>
            <Grid ref={gridRef} $cols={lanes.length} $labels={!labelsFolded} role="table" aria-label="Planner"
              style={pan.pull ? { transform: `translateX(${pan.pull}px)` } : undefined}>
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
                    // Tasks stretched into this part from an earlier one
                    const going = lane.cards.filter(c => (c.part || DEFAULT_PART) !== row.value && partsCovered(c.part || DEFAULT_PART, c.partEnd).includes(row.value));
                    // The grip sits at the foot of a task's last part
                    const endsHere = (c: PlannerCard) => (c.partEnd || c.part || DEFAULT_PART) === row.value || partsCovered(c.part || DEFAULT_PART, c.partEnd).at(-1) === row.value;
                    const grip = onSpan ? { day: lane.day, stretch } : undefined;
                    const events = lane.events.filter(ev => (ev.part || DEFAULT_PART) === row.value);
                    if (foldedParts.includes(row.value)) {
                      const tasksHere = cards.length + going.length;
                      const summary = [tasksHere && plural(tasksHere, 'task'), events.length && plural(events.length, 'event')].filter(Boolean).join(' · ');
                      return (
                        <DropZone key={lane.day} id={cellId(lane.day, row.value)}>
                          {(over, ref) => (
                            <Cell ref={ref} $first={r === 0} $over={over} $folded role="cell" aria-label={`${lane.label}, ${row.label}, folded`} data-day={lane.day} data-part={row.value}>
                              {summary && <FoldedNote>{summary}</FoldedNote>}
                            </Cell>
                          )}
                        </DropZone>
                      );
                    }
                    return (
                      <DropZone key={lane.day} id={cellId(lane.day, row.value)}>
                        {(over, ref) => (
                          <Cell ref={ref} $first={r === 0} $over={over} role="cell" aria-label={`${lane.label}, ${row.label}`} data-day={lane.day} data-part={row.value}>
                            {going.map(c => <ContinuedCard key={c.id} card={c} grip={grip && endsHere(c) ? grip : undefined} onOpen={openCard} />)}
                            {events.map(ev => (
                              <EventRow key={ev.key} type="button" onClick={() => onOpenEvent(ev.id)}>
                                {ev.title}<small>{ev.when}</small>
                              </EventRow>
                            ))}
                            <SortableContext items={cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
                              {cards.map(c => <SortableCard key={c.id} card={c} grip={grip && endsHere(c) ? grip : undefined} {...actions} />)}
                            </SortableContext>
                            {cards.length === 0 && going.length === 0 && events.length === 0 && <Blank aria-hidden="true">{row.label}</Blank>}
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
        </DaysArea>
      </Wrap>
      <DragOverlay dropAnimation={null}>
        {floating ? <Floating as="div"><CardBody card={floating} /></Floating> : null}
      </DragOverlay>
    </DndContext>
  );
}
