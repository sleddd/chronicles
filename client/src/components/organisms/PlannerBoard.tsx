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
import { clampHours, hoursLabel, layoutDay } from '../../utils/planner.js';

/* The week / day planner: an Unscheduled list beside the days. Each day is ONE
   lane, with the hours marked down the left. Its tasks sit one after another
   in the day's order (new ones land by priority), each as tall as its length in
   hours, and never over an event or meeting, which sits at its own time. Drag a
   card onto another day (it lands by priority), onto a card (it takes that
   card's place), up or down within its day, or back to Unscheduled. The grip at
   a card's foot makes it longer or shorter, in half hours. Every card also has a
   small calendar button that sets its day without dragging. Props only. */

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
  /** How long it takes, in hours (its height on its day) */
  hours: number;
  /** Its own time on its day (minutes from midnight), when dragged to one on the dashboard */
  at?: number;
}

/** An event or meeting on the day. `start` / `end` in minutes from midnight; no start = all day */
export interface PlannerEvent { key: string; id: number; title: string; when: string; start?: number; end?: number }

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
const laneId = (day: string) => `day:${day}`;

/** One hour on the day's scale, in px */
const HOUR_PX = 60;
/** The scale runs at least from 8 AM to 10 PM (earlier or later when something on the days needs it) */
const DAY_START = 8 * 60;
const DAY_END = 22 * 60;
const px = (mins: number) => (mins / 60) * HOUR_PX;
const hourName = (h: number) => (h === 0 || h === 24 ? '12 AM' : h === 12 ? '12 PM' : h < 12 ? `${h} AM` : `${h - 12} PM`);

/* ── Styles ── */

const Wrap = styled.div<{ $day: boolean; $folded: boolean }>`
  display: grid;
  /* The days first, Unscheduled on the right (and under them on narrow screens) */
  grid-template-columns: minmax(0, 1fr) ${({ $day, $folded }) => ($folded ? '48px' : $day ? '320px' : '264px')};
  align-items: start;
  & > :first-child { order: 2; }
  @media (max-width: 900px) {
    grid-template-columns: minmax(0, 1fr);
    gap: 28px;
  }
`;

/* What's left to plan: a column on a slightly sunken ground, set apart from the days */
const Backlog = styled.section<{ $over: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  min-height: 200px;
  margin-left: 16px;
  padding: 14px 14px 16px 16px;
  border-radius: 14px;
  background: ${({ $over }) => ($over ? 'var(--bg-lane-over)' : 'color-mix(in srgb, var(--bg-sunken) 45%, transparent)')};
  transition: background 120ms ease;
  @media (max-width: 900px) { margin-left: 0; padding: 16px; }
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
  padding-left: 16px;
  border-left: 1px solid var(--border-subtle);
  background: ${({ $over }) => ($over ? 'var(--bg-lane-over)' : 'transparent')};
  transition: background 120ms ease;
  @media (max-width: 900px) {
    flex-direction: row;
    min-height: 0;
    height: auto;
    padding: 16px 0 0;
    border-left: none;
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

/* The grid: the hours down the left (they fold away to a slim strip), then a lane per day */
const Grid = styled.div<{ $cols: number; $labels: boolean }>`
  display: grid;
  grid-template-columns: ${({ $labels }) => ($labels ? '64px' : '40px')} ${({ $cols }) => ($cols > 1 ? `repeat(${$cols}, minmax(150px, 1fr))` : 'minmax(0, 1fr)')};
  @media (max-width: 768px) {
    grid-template-columns: ${({ $labels }) => ($labels ? '52px' : '36px')} ${({ $cols }) => ($cols > 1 ? `repeat(${$cols}, min(72vw, 260px))` : 'minmax(0, 1fr)')};
  }
`;

/* Over the hours: the button that folds them away (or brings them back) */
const Corner = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  padding: 2px 4px 0 0;
  border-bottom: 1px solid var(--border-default);
`;

/* Whether the hours show, remembered per browser */
const LABELS_FOLDED_KEY = 'planner-labels-folded-v1';
function loadLabelsFolded(): boolean {
  try { return localStorage.getItem(LABELS_FOLDED_KEY) === '1'; } catch { return false; }
}

/* A day's name over the firmer rule (its all-day events under it); today's in the soft accent */
const DayHead = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 44px;
  padding: 4px 10px 9px;
  border-bottom: 1px solid var(--border-default);
  border-left: 1px solid var(--border-subtle);
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--color-accent-soft);
`;

const DayNameRow = styled.div`
  display: flex;
  align-items: baseline;
  gap: 8px;
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

/* An all-day event under the day's name */
const AllDay = styled.button`
  padding: 1px 0 1px 8px;
  border: none;
  border-left: 2px solid var(--color-accent-line);
  background: transparent;
  text-align: left;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-secondary);
  overflow-wrap: anywhere;
  cursor: pointer;
  &:hover { color: var(--text-primary); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

/* The hours down the left: each hour's name at its line */
const Scale = styled.div`
  position: relative;
  @media (max-width: 768px) {
    position: sticky;
    left: 0;
    z-index: 2;
    background: var(--bg-app);
  }
`;

const HourMark = styled.span`
  position: absolute;
  right: 8px;
  transform: translateY(-50%);
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
`;

/* One day: a lane ruled every hour, where cards are dropped */
const Lane = styled.div<{ $over: boolean }>`
  position: relative;
  min-width: 0;
  border-left: 1px solid var(--border-subtle);
  background-image: repeating-linear-gradient(to bottom, var(--border-subtle) 0 1px, transparent 1px ${HOUR_PX}px);
  background-color: ${({ $over }) => ($over ? 'var(--bg-lane-over)' : 'transparent')};
  transition: background-color 120ms ease;
`;

/* An event or meeting at its time on the day: a quiet block with an accent left rule */
const EventBlock = styled.button`
  position: absolute;
  left: 6px;
  right: 6px;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 3px 6px 3px 10px;
  border: none;
  border-left: 2px solid var(--color-accent-line);
  border-radius: 0 4px 4px 0;
  background: color-mix(in srgb, var(--color-accent) 9%, transparent);
  text-align: left;
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.3;
  color: var(--text-secondary);
  overflow: hidden;
  cursor: pointer;
  small { font-size: 12px; color: var(--text-muted); }
  &:hover { color: var(--text-primary); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

/* An empty day says so, faintly */
const Blank = styled.span`
  position: absolute;
  top: 14px;
  left: 0;
  right: 0;
  text-align: center;
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
  /* Dark: frosted glass, a shade lighter than the page — a light veil with a blur */
  html[data-theme='dark'] & {
    background: rgba(255, 255, 255, 0.07);
    border-top-color: rgba(255, 255, 255, 0.09);
    border-right-color: rgba(255, 255, 255, 0.09);
    border-bottom-color: rgba(255, 255, 255, 0.09);
    border-left-color: rgba(255, 255, 255, 0.09);
    -webkit-backdrop-filter: blur(16px) saturate(1.1);
    backdrop-filter: blur(16px) saturate(1.1);
  }
  html[data-theme='dark'] &:hover {
    border-top-color: rgba(255, 255, 255, 0.2);
    border-right-color: rgba(255, 255, 255, 0.2);
    border-bottom-color: rgba(255, 255, 255, 0.2);
  }
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
  html[data-theme='dark'] &, html[data-theme='dark'] &:hover { border-color: var(--color-accent-line); }
`;

/* ── Pieces ── */

function DropZone({ id, children }: { id: string; children: (over: boolean, ref: (el: HTMLElement | null) => void) => ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return <>{children(isOver, setNodeRef)}</>;
}

/** Makes a card longer or shorter: its grip (pointer) or the arrow keys on it */
interface Resizing {
  onGripDown: (card: PlannerCard, e: React.PointerEvent) => void;
  onGripKey: (card: PlannerCard, e: React.KeyboardEvent) => void;
  /** The card being resized right now */
  activeId: number | null;
}

/* The grip. Inside a draggable card, so nothing it does may start a drag or open the card */
function ResizeGrip({ card, resize }: { card: PlannerCard; resize: Resizing }) {
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <Grip type="button" data-active={resize.activeId === card.id} data-grip={card.id}
      aria-label={`Length of ${card.title}: ${hoursLabel(card.hours)}. Arrow down for longer, arrow up for shorter`}
      title="Drag to make it longer or shorter"
      onPointerDown={e => resize.onGripDown(card, e)}
      onMouseDown={stop} onTouchStart={stop} onClick={stop}
      onKeyDown={e => { e.stopPropagation(); resize.onGripKey(card, e); }} />
  );
}

interface CardActions {
  onOpen: (id: number) => void;
  /** Plan a task for a day ('' = take it off). `overId`: the card it was dropped on; null = land it by priority */
  onSchedule: (id: number, day: string, overId: number | null) => void;
}

/* No tick on a planner card: a task is marked done where it lives (its board or the journal); a done one shows struck through.
   `compact`: a short card (under an hour and a half) shows just its title and length */
function CardBody({ card, onSchedule, compact }: { card: PlannerCard; compact?: boolean } & Partial<CardActions>) {
  // Controls inside a draggable card must not start a drag or open it
  const quiet = { onPointerDown: (e: React.SyntheticEvent) => e.stopPropagation(), onKeyDown: (e: React.SyntheticEvent) => e.stopPropagation(), onClick: (e: React.SyntheticEvent) => e.stopPropagation() };
  return (<>
    <Line>
      <Text>
        {card.kicker && !compact && <Kicker>{card.kicker}</Kicker>}
        <Title $done={card.done}>{card.title}</Title>
      </Text>
      {compact && card.day && <Note>{hoursLabel(card.hours)}</Note>}
    </Line>
    {!compact && (
      <Foot>
        {card.due && <Chip><MaterialIcon $size={15} aria-hidden="true">flag</MaterialIcon>{card.due}</Chip>}
        {card.note && <Note>{card.note}</Note>}
        {card.day && <Note>{hoursLabel(card.hours)}</Note>}
        <DayBtn title={card.day ? 'Change the day' : 'Plan for a day'} {...quiet}>
          <MaterialIcon $size={18} aria-hidden="true">event</MaterialIcon>
          <input type="date" value={card.day} aria-label={`Day for ${card.title}`}
            onChange={e => onSchedule?.(card.id, e.target.value, null)}
            onClick={e => { e.stopPropagation(); try { e.currentTarget.showPicker?.(); } catch { /* not supported */ } }} />
        </DayBtn>
      </Foot>
    )}
  </>);
}

/* A card: in Unscheduled (in the flow), or on a day at its place (`at`: top and height in px) with the resize grip at its foot */
function SortableCard({ card, at, resize, ...actions }: { card: PlannerCard; at?: { top: number; height: number }; resize?: Resizing } & CardActions) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  // On a day: placed at its time, as tall as its length, a little tighter inside
  const placed: React.CSSProperties = at ? { position: 'absolute', left: 6, right: 6, top: at.top, height: at.height, zIndex: 2, overflow: 'hidden', padding: '6px 10px 2px', gap: 4 } : {};
  return (
    <TaskCard ref={setNodeRef} style={{ ...placed, transform: CSS.Transform.toString(transform), transition }} $dragging={isDragging}
      {...attributes} {...listeners}
      onClick={() => actions.onOpen(card.id)}
      onKeyDown={e => { if (e.key === 'Enter') actions.onOpen(card.id); }}>
      <CardBody card={card} compact={!!at && card.hours < 1.5} {...actions} />
      {at && resize && <GripFoot><ResizeGrip card={card} resize={resize} /></GripFoot>}
    </TaskCard>
  );
}

/* The grip sits at the very foot of a card on a day, however tall it is */
const GripFoot = styled.div`
  margin-top: auto;
`;

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
  /** A card was made longer or shorter (hours). Omitted = no grip */
  onResize?: (id: number, hours: number) => void;
  lanes: PlannerLane[];
  /** Unfinished tasks whose day has passed */
  overdue: PlannerCard[];
  /** Tasks kept for later (Idea / Backlog) with no day: their own group under the rest */
  ideas?: PlannerCard[];
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

const NO_CARDS: PlannerCard[] = [];

export function PlannerBoard({ lanes: givenLanes, overdue, open, ideas = NO_CARDS, tools, onOpen, onSchedule, onResize, onOpenEvent, onAdd, onPickDay, folded = false, onFold, onPrev, onNext }: PlannerBoardProps) {
  const [labelsFolded, setLabelsFolded] = useState(loadLabelsFolded);
  const toggleLabels = () => setLabelsFolded(prev => {
    try { localStorage.setItem(LABELS_FOLDED_KEY, prev ? '0' : '1'); } catch { /* storage refused */ }
    return !prev;
  });
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  // Resizing a card: while the grip is held, the card (and the day after it) shows the length it would get
  const [resizing, setResizing] = useState<{ id: number; hours: number } | null>(null);
  const lanes = resizing
    ? givenLanes.map(l => ({ ...l, cards: l.cards.map(c => (c.id === resizing.id ? { ...c, hours: resizing.hours } : c)) }))
    : givenLanes;
  const backlog = [...overdue, ...open, ...ideas];
  const all = [...backlog, ...lanes.flatMap(l => l.cards)];
  const [dragging, setDragging] = useState<number | null>(null);
  // The card in hand, kept from the start: paging to another week while holding
  // it takes its own day (and the card) off the screen
  const dragCard = useRef<{ card: PlannerCard; from: string } | null>(null);
  const floating = dragging === null ? undefined : (all.find(c => c.id === dragging) ?? dragCard.current?.card);

  /* The scale: from 8 AM (or the earliest event) to 10 PM (or as far as the busiest day runs) */
  const timed = lanes.flatMap(l => l.events.filter(ev => ev.start !== undefined));
  const dayStart = Math.min(DAY_START, ...timed.map(ev => Math.floor(ev.start! / 60) * 60));
  const layouts = new Map(lanes.map(l => [l.day, layoutDay(
    l.cards.map(c => ({ id: c.id, hours: c.hours, at: c.at })),
    l.events.filter(ev => ev.start !== undefined).map(ev => ({ start: ev.start!, end: ev.end ?? ev.start! + 60 })),
    dayStart,
  )]));
  const lastEnd = Math.max(
    DAY_END,
    ...timed.map(ev => ev.end ?? ev.start! + 60),
    ...lanes.flatMap(l => l.cards.map(c => (layouts.get(l.day)?.get(c.id) ?? dayStart) + c.hours * 60)),
  );
  const dayEnd = Math.min(24 * 60, Math.ceil(lastEnd / 60) * 60);
  const height = px(dayEnd - dayStart) + 1;
  const hours: number[] = [];
  for (let h = dayStart / 60; h <= dayEnd / 60; h++) hours.push(h);

  // Where a card is showing: its day, or '' for Unscheduled
  const placeOf = (id: number): string | undefined => {
    if (backlog.some(c => c.id === id)) return '';
    return lanes.find(l => l.cards.some(x => x.id === id))?.day;
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
    dragCard.current = card && from !== undefined ? { card, from } : null;
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
    // Going back: the hours column (it takes no drops), at least EDGE_ZONE
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
        if (pos.x >= r.left - EDGE_SLACK && pos.x <= r.left + leftZone && scrollEl.scrollLeft <= 1) now = 'prev';
        else if (pos.x >= r.right - EDGE_ZONE && pos.x <= r.right && scrollEl.scrollLeft >= max - 1) now = 'next';
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
    if (from === undefined) return;
    const target = String(over.id);
    // Onto a card: it takes that card's place (in that card's day)
    if (typeof over.id === 'number') {
      if (over.id === active.id) return;
      const day = placeOf(over.id);
      if (day === undefined) return;
      if (day === '') { if (from !== '') onSchedule(id, '', null); return; }
      onSchedule(id, day, over.id);
      return;
    }
    if (target === UNSCHEDULED) { if (from !== '') onSchedule(id, '', null); return; }
    // Onto a day's free space: from another day (or Unscheduled) it lands by priority; within its own day nothing moves
    if (target.startsWith('day:')) {
      const day = target.slice(4);
      if (day !== from) onSchedule(id, day, null);
    }
  };

  // Keys on the grip move the card's end a half hour at a time
  const refocusGrip = useRef<number | null>(null);
  useEffect(() => {
    const id = refocusGrip.current;
    if (id === null) return;
    const el = gridRef.current?.querySelector<HTMLElement>(`[data-grip="${id}"]`);
    if (el && document.activeElement !== el) el.focus();
    if (el) refocusGrip.current = null;
  });
  const resize: Resizing = {
    activeId: resizing?.id ?? null,
    // Hold the grip and move down (longer) or up (shorter), in half hours
    onGripDown: (card, e) => {
      if (e.button > 0) return;
      e.preventDefault();
      e.stopPropagation();
      const y0 = e.clientY;
      const was = card.hours;
      let hrs = was;
      setResizing({ id: card.id, hours: hrs });
      const move = (ev: PointerEvent) => {
        const next = clampHours(was + (ev.clientY - y0) / HOUR_PX);
        if (next !== hrs) { hrs = next; setResizing({ id: card.id, hours: hrs }); }
      };
      const done = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', done);
        window.removeEventListener('pointercancel', done);
        // The click this release fires must not open the card
        dragUntil.current = Date.now() + 300;
        setResizing(null);
        if (ev.type === 'pointerup' && hrs !== was) onResize?.(card.id, hrs);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', done);
      window.addEventListener('pointercancel', done);
    },
    onGripKey: (card, e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const next = clampHours(card.hours + (e.key === 'ArrowDown' ? 0.5 : -0.5));
      if (next !== card.hours) { refocusGrip.current = card.id; onResize?.(card.id, next); }
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
                <MaterialIcon $size={20} aria-hidden="true">chevron_left</MaterialIcon>
              </FoldBtn>
              <FoldedName>Unscheduled</FoldedName>
            </Folded>
          ) : (
            <Backlog ref={ref} $over={over} aria-label="Unscheduled">
              <BacklogHead>
                <BacklogTitle>Unscheduled</BacklogTitle>
                {onFold && (
                  <FoldBtn type="button" aria-expanded aria-label="Hide unscheduled tasks" title="Hide unscheduled tasks" onClick={() => onFold(true)}>
                    <MaterialIcon $size={20} aria-hidden="true">chevron_right</MaterialIcon>
                  </FoldBtn>
                )}
              </BacklogHead>
              {tools}
              <SortableContext items={backlog.map(c => c.id)} strategy={verticalListSortingStrategy}>
                {overdue.length > 0 && <Group>Overdue</Group>}
                {overdue.map(c => <SortableCard key={c.id} card={c} {...actions} />)}
                {overdue.length > 0 && open.length > 0 && <Group>No day yet</Group>}
                {open.map(c => <SortableCard key={c.id} card={c} {...actions} />)}
                {ideas.length > 0 && <Group>Ideas / Backlog</Group>}
                {ideas.map(c => <SortableCard key={c.id} card={c} {...actions} />)}
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
              <Corner style={{ gridRow: 1, gridColumn: 1 }}>
                <FoldBtn type="button" aria-expanded={!labelsFolded}
                  aria-label={labelsFolded ? 'Show the hours' : 'Hide the hours'}
                  title={labelsFolded ? 'Show the hours' : 'Hide the hours'}
                  onClick={toggleLabels}>
                  <MaterialIcon $size={20} aria-hidden="true">{labelsFolded ? 'chevron_right' : 'chevron_left'}</MaterialIcon>
                </FoldBtn>
              </Corner>
              {lanes.map((lane, c) => (
                <DayHead key={lane.day} role="columnheader" style={{ gridRow: 1, gridColumn: c + 2 }}>
                  <DayNameRow>
                    <DayName type="button" $today={lane.today} disabled={!onPickDay} onClick={() => onPickDay?.(lane.day)}
                      title={onPickDay ? 'Open this day' : undefined}>
                      {lane.label}
                    </DayName>
                    {lane.today && <span>Today</span>}
                  </DayNameRow>
                  {lane.events.filter(ev => ev.start === undefined).map(ev => (
                    <AllDay key={ev.key} type="button" onClick={() => onOpenEvent(ev.id)} title={ev.when}>{ev.title}</AllDay>
                  ))}
                </DayHead>
              ))}

              {/* The hours down the left */}
              <Scale role="rowheader" aria-label="Hours" style={{ gridRow: 2, gridColumn: 1, height }}>
                {!labelsFolded && hours.map(h => (
                  <HourMark key={h} style={{ top: Math.max(8, px(h * 60 - dayStart)) }}>{hourName(h)}</HourMark>
                ))}
              </Scale>

              {lanes.map((lane, c) => {
                const at = layouts.get(lane.day) ?? new Map<number, number>();
                return (
                  <DropZone key={lane.day} id={laneId(lane.day)}>
                    {(over, ref) => (
                      <Lane ref={ref} $over={over} role="cell" aria-label={lane.label} data-day={lane.day}
                        style={{ gridRow: 2, gridColumn: c + 2, height, backgroundPosition: `0 ${px(Math.ceil(dayStart / 60) * 60 - dayStart)}px` }}>
                        {lane.events.filter(ev => ev.start !== undefined).map(ev => {
                          const end = ev.end ?? ev.start! + 60;
                          return (
                            <EventBlock key={ev.key} type="button" onClick={() => onOpenEvent(ev.id)}
                              style={{ top: px(ev.start! - dayStart) + 1, height: Math.max(22, px(end - ev.start!) - 3) }}>
                              {ev.title}<small>{ev.when}</small>
                            </EventBlock>
                          );
                        })}
                        <SortableContext items={lane.cards.map(x => x.id)} strategy={verticalListSortingStrategy}>
                          {lane.cards.map(x => (
                            <SortableCard key={x.id} card={x} resize={onResize ? resize : undefined} {...actions}
                              at={{ top: px((at.get(x.id) ?? dayStart) - dayStart) + 2, height: Math.max(26, px(x.hours * 60) - 4) }} />
                          ))}
                        </SortableContext>
                        {lane.cards.length === 0 && lane.events.length === 0 && <Blank aria-hidden="true">Nothing planned</Blank>}
                      </Lane>
                    )}
                  </DropZone>
                );
              })}

              <FootGap aria-hidden="true" style={{ gridRow: 3, gridColumn: 1 }} />
              {lanes.map((lane, c) => (
                <FootCell key={lane.day} style={{ gridRow: 3, gridColumn: c + 2 }}>
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
