import { Fragment, useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import styled from 'styled-components';
import {
  DndContext, DragOverlay, closestCenter, pointerWithin, KeyboardSensor, MouseSensor, TouchSensor, useDroppable,
  useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { BlockedTag } from '../atoms/BlockedTag.js';
import { TickMark } from '../atoms/TickMark.js';
import { MaterialIcon } from '../atoms/MaterialIcon.js';
import { usePagePan } from '../../hooks/usePagePan.js';
import { Kicker, CardTitle, Chip } from './KanbanBoard.js';
import { MAX_HOURS, MIN_HOURS, clampHours, hoursLabel, layoutDay, overlapColumns, sameLength } from '../../utils/planner.js';
import { BOARD_KEYS, boardCardKey } from '../../utils/pressable.js';

/* The week / day planner: an Unscheduled list beside the days. Each day is ONE
   lane, with the hours marked down the left. Its tasks sit one after another
   in the day's order (new ones land by priority), each as tall as its length in
   hours, and never over an event or meeting, which sits at its own time. Drag a
   card onto another day (it lands by priority), onto a card (it takes that
   card's place), up or down within its day, or back to Unscheduled. The grip at
   a card's foot makes it longer or shorter, in five-minute steps. Every card also has a
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
  /** What it's waiting on ("Call the plumber +1"): struck through with a Blocked tag */
  blocked?: string;
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
/** The smallest a task card is drawn, resting or being stretched (still big enough to hold) */
const MIN_CARD_PX = 22;
/** A task card is drawn this far inside its slot, top and bottom */
const CARD_INSET = 6;
/** The longest and shortest a card can be stretched to, in minutes */
const MAX_LENGTH_MINS = MAX_HOURS * 60;
const MIN_LENGTH_MINS = Math.round(MIN_HOURS * 60);
/** Arrow keys on a grip save once, this long after the last press (never once per key repeat) */
const KEY_SAVE_MS = 400;
/** How long a new length shows while its save hasn't answered */
const PENDING_MS = 4000;
/** The scale runs at least from 8 AM to 10 PM (earlier or later when something on the days shown needs it) — the same on every day */
const DAY_START = 8 * 60;
const DAY_END = 22 * 60;
const hourName = (h: number) => (h === 0 || h === 24 ? '12 AM' : h === 12 ? '12 PM' : h < 12 ? `${h} AM` : `${h - 12} PM`);

/* ── Styles ── */

const Wrap = styled.div<{ $day: boolean; $folded: boolean; $solo?: boolean }>`
  display: grid;
  /* The days first, Unscheduled on the right (and under them on narrow screens); just the days without it */
  grid-template-columns: minmax(0, 1fr) ${({ $day, $folded, $solo }) => ($solo ? '' : $folded ? '48px' : $day ? '320px' : '264px')};
  /* Unscheduled runs the days' height (it scrolls inside), so it never reaches past them */
  align-items: stretch;
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
  /* As tall as the days and no taller: its own height doesn't count toward the row
     (height 0), it fills the row the days set (min-height 100%) and its list scrolls */
  height: 0;
  min-height: max(100%, 360px);
  margin-left: 16px;
  padding: 14px 14px 16px 16px;
  border-radius: 14px;
  background: ${({ $over }) => ($over ? 'var(--bg-lane-over)' : 'color-mix(in srgb, var(--bg-sunken) 45%, transparent)')};
  transition: background 120ms ease;
  /* Light: no fill at rest, just the cards' edge (a ring, so nothing moves); the lane colour while a card is dragged over */
  html[data-theme='light'] & { background: ${({ $over }) => ($over ? 'var(--bg-lane-over)' : 'transparent')}; box-shadow: 0 0 0 1px var(--edge-card); }
  @media (max-width: 900px) { margin-left: 0; padding: 16px; height: auto; min-height: 200px; }
`;

/* Unscheduled's cards: the part that scrolls, so a long list stays beside the days */
const BacklogList = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: 10px;
  /* Room for the cards' outlines and focus rings at the edges */
  margin: 0 -6px;
  padding: 2px 6px 4px;
  @media (max-width: 900px) { overflow: visible; }
`;

/* The column's name and its fold button */
const BacklogHead = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  /* A hairline under the name */
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-subtle);
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
  &:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 1px; }
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
/** Held at the edge with a card: the first page comes quickly, then one a while apart (time to drop it) */
const EDGE_DWELL_MS = 450;
const EDGE_REPEAT_MS = 1200;
/** How far (px) past the days' left edge still counts as holding it there */
const EDGE_SLACK = 32;

const DaysArea = styled.div`
  position: relative;
  min-width: 0;
`;

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

/* The grid: the hours down the left, then a lane per day */
const Grid = styled.div<{ $cols: number }>`
  display: grid;
  grid-template-columns: 64px ${({ $cols }) => ($cols > 1 ? `repeat(${$cols}, minmax(150px, 1fr))` : 'minmax(0, 1fr)')};
  @media (max-width: 768px) {
    grid-template-columns: 52px ${({ $cols }) => ($cols > 1 ? `repeat(${$cols}, min(72vw, 260px))` : 'minmax(0, 1fr)')};
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

/* Whether Unscheduled's search and filters show (hidden to start), remembered per browser */
const FILTERS_OPEN_KEY = 'planner-filters-open-v1';
function loadFiltersOpen(): boolean {
  try { return localStorage.getItem(FILTERS_OPEN_KEY) === '1'; } catch { return false; }
}

/* The head's buttons: Filters, then the fold */
const HeadButtons = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
`;

/* Filters: shows or hides the search and pickers; accent while open, and while folded with one set */
const FiltersBtn = styled(FoldBtn)<{ $on: boolean }>`
  color: ${({ $on }) => ($on ? 'var(--color-accent-soft)' : 'var(--text-muted)')};
`;

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
  &:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
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
  &:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
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
  background-color: ${({ $over }) => ($over ? 'var(--bg-lane-over)' : 'transparent')};
  transition: background-color 120ms ease;
`;

/* An hour's line across a day */
const HourLine = styled.i`
  position: absolute;
  left: 0;
  right: 0;
  height: 0;
  border-top: 1px solid var(--border-subtle);
  pointer-events: none;
`;

/* An event or meeting at its time on the day: a quiet block with an accent left rule */
const EventBlock = styled.button`
  position: absolute;
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
  &:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
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
  &:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
  /* Light: the planner's cards on their own warm tone; in the Unscheduled list a near-white */
  html[data-theme='light'] & { background: #f2ede9; }
  html[data-theme='light'] ${BacklogList} & { background: #f9f4ef; }
  /* A short card: one line, the title shortened (the full title is its tooltip) */
  &[data-tiny] { justify-content: center; }
  &[data-tiny] .card-line { flex-wrap: nowrap; align-items: center; }
  &[data-tiny] .card-text { min-width: 0; }
  &[data-tiny] h4 { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 13px; line-height: 1.2; }
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

/* The grip at the foot of a card on a day: drag it down (or up) to make the
   task longer (or shorter). Drawn, not an icon; wide enough for a thumb */
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
  &:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: -2px; border-radius: 4px; }
`;

/* The title and, on a short card, its length — which drops under the title when a word won't fit beside it */
const Line = styled.div.attrs({ className: 'card-line' })`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 4px 8px;
`;

const Text = styled.div.attrs({ className: 'card-text' })`
  flex: 1 1 0;
  min-width: min-content;
  max-width: 100%;
  /* The goal line above the title is cut with an ellipsis: it mustn't widen the card */
  & > ${Kicker} { contain: inline-size; }
  display: flex;
  flex-direction: column;
  gap: 5px;
`;

/* The tick and the title side by side (never wrapped apart) */
const TickRow = styled.div`
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: 6px;
`;

/* A card's tick, left of its title: an 18px circle in a 30px target (small, easy to tap) */
const CardTick = styled.button`
  flex: none;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  margin: -6px -2px -6px -6px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  touch-action: manipulation;
  &:hover { background: var(--bg-hover); }
  &:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 1px; }
`;

const Title = styled(CardTitle)`
  font-size: 15px;
  /* Words wrap whole; a word breaks only when it can't fit a line on its own */
  overflow-wrap: break-word;
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
  &:focus-within { outline: 2px solid var(--focus-ring); outline-offset: 1px; }
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
      aria-label={`Length of ${card.title}: ${hoursLabel(card.hours)}. Arrow down for five minutes longer, arrow up for shorter, with Shift for half an hour`}
      title="Drag to make it longer or shorter"
      onPointerDown={e => resize.onGripDown(card, e)}
      onMouseDown={stop} onTouchStart={stop} onClick={stop}
      onKeyDown={e => { e.stopPropagation(); resize.onGripKey(card, e); }} />
  );
}

interface CardActions {
  onOpen: (id: number) => void;
  /** Plan a task for a day ('' = take it off). `overId`: the card it was dropped on; null = land it by priority.
      `at`: the time it was dropped at on the day (minutes from midnight) — it stays there.
      `keep`: the other cards on the days it left and joined, at the times they show now, so none slides up */
  onSchedule: (id: number, day: string, overId: number | null, at?: number, keep?: { id: number; at: number }[]) => void;
  /** Mark it done, or not done again (the tick left of its title) */
  onToggleDone?: (id: number) => void;
}

/* A tick left of the title marks it done (a done one stays, ticked and struck through, so a tap undoes it).
   `compact`: a short card (under an hour and a half) shows just its title and length */
function CardBody({ card, onSchedule, onToggleDone, compact }: { card: PlannerCard; compact?: boolean } & Partial<CardActions>) {
  // Controls inside a draggable card must not start a drag or open it
  const quiet = { onPointerDown: (e: React.SyntheticEvent) => e.stopPropagation(), onKeyDown: (e: React.SyntheticEvent) => e.stopPropagation(), onClick: (e: React.SyntheticEvent) => e.stopPropagation() };
  return (<>
    <Line>
      <TickRow>
        {onToggleDone && (
          <CardTick type="button" role="checkbox" aria-checked={card.done} {...quiet}
            aria-label={card.done ? `Mark “${card.title}” not done` : `Mark “${card.title}” done`}
            onClick={e => { e.stopPropagation(); onToggleDone(card.id); }}>
            <TickMark checked={card.done} size={18} />
          </CardTick>
        )}
        <Text>
          {card.kicker && !compact && <Kicker>{card.kicker}</Kicker>}
          <Title $done={card.done || !!card.blocked}>{card.title}</Title>
        </Text>
      </TickRow>
      {compact && card.blocked && <BlockedTag by={card.blocked} compact />}
      {compact && card.day && <Note data-len>{hoursLabel(card.hours)}</Note>}
    </Line>
    {!compact && card.blocked && <BlockedTag by={card.blocked} />}
    {!compact && (
      <Foot>
        {card.due && <Chip><MaterialIcon $size={15} aria-hidden="true">flag</MaterialIcon>{card.due}</Chip>}
        {card.note && <Note>{card.note}</Note>}
        {card.day && <Note data-len>{hoursLabel(card.hours)}</Note>}
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
function SortableCard({ card, at, resize, ...actions }: { card: PlannerCard; at?: CardPlace; resize?: Resizing } & CardActions) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  // On a day: placed at its time, as tall as its length, a little tighter inside
  // A short card (under about 45 minutes' height) is one line: tick, title shortened with "…", length
  const tiny = !!at && at.height < 44;
  const placed: React.CSSProperties = at ? { position: 'absolute', left: at.left, width: at.width, top: at.top, height: at.height, zIndex: 2, overflow: 'hidden', padding: tiny ? '1px 8px' : '6px 10px 2px', gap: 4 } : {};
  return (
    <TaskCard ref={setNodeRef} data-plan-card={card.id} data-tiny={tiny || undefined} title={tiny ? card.title : undefined} style={{ ...placed, transform: CSS.Transform.toString(transform), transition }} $dragging={isDragging}
      {...attributes} {...listeners}
      onClick={() => actions.onOpen(card.id)}
      onKeyDown={boardCardKey(listeners?.onKeyDown, isDragging, () => actions.onOpen(card.id))}>
      <CardBody card={card} compact={!!at && card.hours < 1.5} {...actions} />
      {at && resize && <GripFoot><ResizeGrip card={card} resize={resize} /></GripFoot>}
    </TaskCard>
  );
}

/** Where a card or event sits on its day: its time down the lane, its column across it */
interface CardPlace { top: number; height: number; left: string; width: string }

/** The left edge and width of an item in its column, 4px in from either side of it */
function across({ col, cols }: { col: number; cols: number }): Pick<CardPlace, 'left' | 'width'> {
  return { left: `calc(${(col * 100) / cols}% + 4px)`, width: `calc(${100 / cols}% - 8px)` };
}

/* The grip sits at the very foot of a card on a day, however tall it is. On a one-line card it is
   a thin strip, so the tick and the title above it can still be pressed */
const GripFoot = styled.div`
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  & > button { width: 100%; height: 14px; margin: 0; }
  [data-tiny] & > button { height: 6px; }
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
  /** A card was made longer or shorter (hours). Omitted = no grip. May answer whether it saved:
      on false the card goes back to the length it had */
  onResize?: (id: number, hours: number) => void | Promise<boolean>;
  lanes: PlannerLane[];
  /** Unfinished tasks whose day has passed */
  overdue: PlannerCard[];
  /** Tasks kept for later (Idea / Backlog) with no day: their own group under the rest */
  ideas?: PlannerCard[];
  /** Unfinished tasks with no day */
  open: PlannerCard[];
  /** Search / filters over the Unscheduled list */
  tools?: ReactNode;
  /** How many of the search / filters are set (the Filters button says so while they're hidden) */
  toolsSet?: number;
  onOpenEvent: (id: number) => void;
  /** The tick on each card: mark the task done, or not done again */
  onToggleDone?: (id: number) => void;
  /** A new task typed under a day ('' = Unscheduled) */
  onAdd: (day: string, text: string) => void;
  /** A day's name was pressed (the week view opens that day); omitted = plain text */
  onPickDay?: (day: string) => void;
  /** Unscheduled folded down to a narrow strip (false when left out) */
  folded?: boolean;
  /** Fold or open Unscheduled; omitted = no fold button */
  onFold?: (folded: boolean) => void;
  /** No Unscheduled list at all, just the days (the dashboard's Your Agenda) */
  hideUnscheduled?: boolean;
  /** A selector for an element outside the board (Your Agenda's tasks-with-no-day list): a card let go
   *  over it leaves its day. Marked `data-over` while a card is over it */
  dropOffTo?: string;
  /** The previous / next week (or day): dragging or swiping the days sideways */
  onPrev?: () => void;
  onNext?: () => void;
}

const NO_CARDS: PlannerCard[] = [];

export function PlannerBoard({ lanes: givenLanes, overdue, open, ideas = NO_CARDS, tools, toolsSet = 0, onOpen, onSchedule, onToggleDone, onResize, onOpenEvent, onAdd, onPickDay, folded = false, onFold, hideUnscheduled = false, dropOffTo, onPrev, onNext }: PlannerBoardProps) {
  const [filtersOpen, setFiltersOpen] = useState(loadFiltersOpen);
  const toggleFilters = () => setFiltersOpen(v => {
    try { localStorage.setItem(FILTERS_OPEN_KEY, v ? '0' : '1'); } catch { /* per browser only */ }
    return !v;
  });
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    // Space picks a card up and drops it (Enter drops it too); Enter on a resting card opens it
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes: BOARD_KEYS }),
  );
  /* Resizing a card: while the grip is held the card follows the pointer pixel by pixel (drawn
     straight on the card, no re-layout, so it's smooth), its length shown live to the nearest five
     minutes. Let go, the day takes the new length at once (`pending`) until the save comes back */
  const [resizingId, setResizingId] = useState<number | null>(null);
  // Each card's new length, keyed by card id: several can wait on their saves at once
  const [pending, setPending] = useState<ReadonlyMap<number, number>>(() => new Map());
  /** Forget a card's waiting length (only `hours`, when given: a newer one for that card stays) */
  const dropPending = useCallback((id: number, hours?: number) => setPending(p => {
    if (!p.has(id) || (hours !== undefined && p.get(id) !== hours)) return p;
    const next = new Map(p);
    next.delete(id);
    return next;
  }), []);
  // A save that never answers: back to what's saved after a while, card by card
  const pendingTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const showPending = (id: number, hours: number) => {
    setPending(p => new Map(p).set(id, hours));
    clearTimeout(pendingTimers.current.get(id));
    pendingTimers.current.set(id, setTimeout(() => { pendingTimers.current.delete(id); dropPending(id, hours); }, PENDING_MS));
  };
  useEffect(() => { const timers = pendingTimers.current; return () => timers.forEach(clearTimeout); }, []);
  // Done with once the saved length shows (or the card has gone)
  useEffect(() => {
    if (!pending.size) return;
    const cards = new Map(givenLanes.flatMap(l => l.cards).map(c => [c.id, c]));
    for (const [id, hours] of pending) {
      const now = cards.get(id);
      if (!now || sameLength(now.hours, hours)) dropPending(id, hours);
    }
  }, [pending, givenLanes, dropPending]);
  /** Give a card its new length: shown at once, saved, and put back if the save fails */
  const applyLength = (id: number, hours: number) => {
    showPending(id, hours);
    // Only this length goes back: a newer one for the same card (a second key press) stays
    const undo = () => dropPending(id, hours);
    void Promise.resolve()
      .then((): void | boolean | Promise<boolean> => onResize?.(id, hours))
      .then(ok => { if (ok === false) undo(); }, undo);
  };
  // A length set with the arrow keys, waiting for the keys to rest before it is saved
  const keySave = useRef<{ id: number; hours: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const flushKeySave = () => {
    const waiting = keySave.current;
    if (!waiting) return;
    clearTimeout(waiting.timer);
    keySave.current = null;
    applyLength(waiting.id, waiting.hours);
  };
  // Leaving the planner mid-wait still saves it
  const flushKeySaveRef = useRef(flushKeySave);
  flushKeySaveRef.current = flushKeySave;
  useEffect(() => () => flushKeySaveRef.current(), []);
  const lanes = pending.size
    ? givenLanes.map(l => ({ ...l, cards: l.cards.map(c => (pending.has(c.id) ? { ...c, hours: pending.get(c.id)! } : c)) }))
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
  const ownTimes = lanes.flatMap(l => l.cards.flatMap(c => (c.at === undefined ? [] : [c.at])));
  const dayStart = Math.min(DAY_START, ...[...timed.map(ev => ev.start!), ...ownTimes].map(start => Math.floor(start / 60) * 60));
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

  /* One fixed scale for every day, like a calendar: an hour is HOUR_PX tall everywhere, so a card is
     exactly as tall as its time (down to MIN_CARD_PX) and empty time stays empty. What overlaps on a
     day sits side by side and shares the width (`overlapColumns`). */
  const yAt = (mins: number) => ((Math.max(dayStart, Math.min(dayEnd, mins)) - dayStart) / 60) * HOUR_PX;
  // The other way round: the time at a height down the day. Not kept inside the day — callers do —
  // so a card can be stretched or dropped past the last hour line
  const minsAt = (y: number) => dayStart + (y / HOUR_PX) * 60;
  // The least time an item takes on screen: a 5-minute card is drawn taller than its time
  const minMins = (MIN_CARD_PX / HOUR_PX) * 60;
  // Each item's place on its day: its top and height from its times, its column among what it overlaps
  const slot = new Map<string, { top: number; height: number; col: number; cols: number }>();
  for (const l of lanes) {
    const at = layouts.get(l.day) ?? new Map<number, number>();
    const items = [
      ...l.events.filter(ev => ev.start !== undefined).map(ev => ({ key: `e:${l.day}:${ev.key}`, start: ev.start!, end: ev.end ?? ev.start! + 60 })),
      ...l.cards.map(c => { const st = at.get(c.id) ?? dayStart; return { key: `t:${c.id}`, start: st, end: st + Math.round(c.hours * 60) }; }),
    ];
    const cols = overlapColumns(items, minMins);
    for (const it of items) {
      const top = yAt(it.start);
      slot.set(it.key, { top, height: yAt(it.end) - top, ...(cols.get(it.key) ?? { col: 0, cols: 1 }) });
    }
  }
  const height = yAt(dayEnd) + 1;
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
  const gridRef = useRef<HTMLDivElement | null>(null);
  const pan = usePagePan(gridRef, () => onPrev?.(), () => onNext?.(), () => !onPrev || Date.now() < dragUntil.current);
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
  const canPage = !!onPrev && !!onNext;
  const pageRef = useRef(pan.page);
  pageRef.current = pan.page;
  const scrollEl = pan.el;
  useEffect(() => {
    if (dragging === null || !scrollEl || !canPage) return;
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
    let paged = false;
    const timer = setInterval(() => {
      const r = scrollEl.getBoundingClientRect();
      let now: 'prev' | 'next' | null = null;
      if (pos && pos.y >= r.top && pos.y <= r.bottom) {
        const max = scrollEl.scrollWidth - scrollEl.clientWidth;
        // A wide week scrolls first (dnd-kit's auto-scroll); only at its end does it page
        if (pos.x >= r.left - EDGE_SLACK && pos.x <= r.left + leftZone && scrollEl.scrollLeft <= 1) now = 'prev';
        else if (pos.x >= r.right - EDGE_ZONE && pos.x <= r.right && scrollEl.scrollLeft >= max - 1) now = 'next';
      }
      if (now !== side) { side = now; since = Date.now(); paged = false; setEdge(now); return; }
      if (side && Date.now() - since >= (paged ? EDGE_REPEAT_MS : EDGE_DWELL_MS)) { pageRef.current(side); since = Date.now(); paged = true; }
    }, 50);
    return () => {
      clearInterval(timer);
      document.removeEventListener('pointermove', track);
      document.removeEventListener('touchmove', track);
      setEdge(null);
    };
    // Not onPrev / onNext themselves: they're new each render, and paging re-renders — that restarted
    // this timer on every page, so a held card raced through the weeks instead of waiting
  }, [dragging, scrollEl, canPage]);

  /** Is the dragged card's centre over the `dropOffTo` element? (marks it while it is) */
  const overDropOff = (rect: { left: number; top: number; width: number; height: number } | null | undefined) => {
    const el = dropOffTo ? document.querySelector<HTMLElement>(dropOffTo) : null;
    if (!el || !rect) return false;
    const r = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    const inside = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    el.toggleAttribute('data-over', inside);
    return inside;
  };
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    dragUntil.current = Date.now() + 300;
    setDragging(null);
    const id = Number(active.id);
    const held = dragCard.current;
    const from = placeOf(id) ?? (held?.card.id === id ? held.from : undefined);
    // Let go over the list outside the board: off its day
    if (dropOffTo && overDropOff(active.rect.current.translated)) {
      document.querySelector(dropOffTo)?.removeAttribute('data-over');
      dragCard.current = null;
      if (from) onSchedule(id, '', null);
      return;
    }
    dragCard.current = null;
    if (!over || from === undefined) return;
    const target = String(over.id);
    // Onto a day — its free space or a card on it — the card goes to the time where its top was let go
    // (to the nearest five minutes, on that day's own scale) and stays there
    const dropDay = typeof over.id === 'number' ? (over.id === active.id ? from : placeOf(over.id)) : target.startsWith('day:') ? target.slice(4) : undefined;
    const top = active.rect.current.translated?.top;
    const laneEl = dropDay ? gridRef.current?.querySelector<HTMLElement>(`[data-day="${dropDay}"]`) : null;
    if (dropDay && top !== undefined && laneEl) {
      const card = all.find(c => c.id === id) ?? held?.card;
      const len = Math.round((card?.hours ?? 1) * 60);
      // The card's top is drawn a little under its time: take that off, or every drop lands late
      const y = top - (laneEl.getBoundingClientRect().top + laneEl.clientTop) - CARD_INSET;
      // Dropped on another card: it takes that card's time and its place in the stack there
      // (before it dragged up, after it dragged down), so cards sharing a time keep the order they're put in
      const onCard = typeof over.id === 'number' && over.id !== active.id ? over.id : null;
      const at = onCard !== null
        ? (layouts.get(dropDay)?.get(onCard) ?? dayStart)
        : Math.max(dayStart, Math.min(24 * 60 - len, Math.round(minsAt(y) / 5) * 5));
      if (onCard === null && dropDay === from && card?.at === at) return;
      // Cards with no time of their own are packed from the top of the day: give them the times they
      // show now, or the 8 AM slot would never stay empty (the next card would slide up into it)
      const keep = lanes.filter(l => l.day === dropDay || l.day === from).flatMap(l => l.cards
        .filter(c => c.id !== id && c.at === undefined && !c.done)
        .map(c => ({ id: c.id, at: layouts.get(l.day)?.get(c.id) ?? dayStart })));
      onSchedule(id, dropDay, onCard, at, keep);
      return;
    }
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

  // After a key on the grip changes the card's length, the grip keeps the focus
  const refocusGrip = useRef<number | null>(null);
  useEffect(() => {
    const id = refocusGrip.current;
    if (id === null) return;
    const el = gridRef.current?.querySelector<HTMLElement>(`[data-grip="${id}"]`);
    if (el && document.activeElement !== el) el.focus();
    if (el) refocusGrip.current = null;
  });
  // A stretch still held when the board goes away: its window listeners go with it
  const stopResize = useRef<(() => void) | null>(null);
  useEffect(() => () => stopResize.current?.(), []);
  const resize: Resizing = {
    activeId: resizingId,
    // Hold the grip and move down (longer) or up (shorter): smooth, any length from five minutes
    onGripDown: (card, e) => {
      if (e.button > 0) return;
      e.preventDefault();
      e.stopPropagation();
      const el = (e.currentTarget as HTMLElement).closest<HTMLElement>('[data-plan-card]');
      const laneEl = el?.closest<HTMLElement>('[data-day]');
      const day = laneEl?.dataset.day;
      if (!el || !day) return;
      const pointer = e.pointerId;
      const was = Math.round(card.hours * 60);
      const start = layouts.get(day)?.get(card.id) ?? card.at ?? dayStart;
      // Where the card's time ends on this day's scale. The length changes by how far that point
      // moves, and the card is drawn down to it — as it will be once let go. (Never read from the
      // card's own foot: a short card is taller than its time, and one in a crowded hour sits lower)
      const endY = yAt(start + was);
      const cardTop = el.offsetTop;
      const h0 = el.offsetHeight;
      const longest = Math.min(MAX_LENGTH_MINS, 24 * 60 - start);
      const y0 = e.clientY;
      let mins = was;
      const prev = { height: el.style.height, zIndex: el.style.zIndex, transition: el.style.transition };
      el.style.zIndex = '60';
      el.style.transition = 'none';
      setResizingId(card.id);
      let frame = 0;
      let lastY = y0;
      const draw = () => {
        frame = 0;
        const dy = lastY - y0;
        // Down to where its time ends — and while it's being made longer never shorter than it is
        // now (a card stacked low in a crowded hour is already taller than its time)
        const toEnd = Math.max(MIN_CARD_PX, endY + dy - CARD_INSET - cardTop);
        el.style.height = `${dy > 0 ? Math.max(h0, toEnd) : toEnd}px`;
        const end = dy === 0 ? start + was : minsAt(endY + dy);
        mins = Math.max(MIN_LENGTH_MINS, Math.min(longest, Math.round((end - start) / 5) * 5));
        el.querySelectorAll<HTMLElement>('[data-len]').forEach(n => { n.textContent = hoursLabel(mins / 60); });
      };
      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== pointer) return;
        lastY = ev.clientY;
        if (!frame) frame = requestAnimationFrame(draw);
      };
      const unlisten = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', done);
        window.removeEventListener('pointercancel', done);
        if (frame) cancelAnimationFrame(frame);
        stopResize.current = null;
      };
      const done = (ev: PointerEvent) => {
        // Another finger lifting doesn't end the stretch
        if (ev.pointerId !== pointer) return;
        const waiting = frame !== 0;
        unlisten();
        if (waiting) draw();
        // The click this release fires must not open the card
        dragUntil.current = Date.now() + 300;
        Object.assign(el.style, prev);
        setResizingId(null);
        if (ev.type === 'pointerup' && mins !== was) {
          applyLength(card.id, mins / 60);
        } else {
          el.querySelectorAll<HTMLElement>('[data-len]').forEach(n => { n.textContent = hoursLabel(card.hours); });
        }
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', done);
      window.addEventListener('pointercancel', done);
      stopResize.current = unlisten;
    },
    // Arrow keys on the grip: five minutes at a time (Shift: half an hour). Each press shows at
    // once, and the length is saved once the keys rest — a held key repeats thirty times a second
    onGripKey: (card, e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const step = e.shiftKey ? 0.5 : MIN_HOURS;
      const next = clampHours(card.hours + (e.key === 'ArrowDown' ? step : -step));
      if (sameLength(next, card.hours)) return;
      refocusGrip.current = card.id;
      if (keySave.current && keySave.current.id !== card.id) flushKeySave();
      clearTimeout(keySave.current?.timer);
      showPending(card.id, next);
      keySave.current = { id: card.id, hours: next, timer: setTimeout(flushKeySave, KEY_SAVE_MS) };
    },
  };
  const actions = { onOpen: openCard, onSchedule, onToggleDone };
  const single = lanes.length === 1;

  return (
    <DndContext sensors={sensors} collisionDetection={collisions} onDragStart={handleDragStart}
      onDragMove={dropOffTo ? ({ active }) => { overDropOff(active.rect.current.translated); } : undefined}
      onDragCancel={() => { if (dropOffTo) document.querySelector(dropOffTo)?.removeAttribute('data-over'); dragUntil.current = Date.now() + 300; dragCard.current = null; setDragging(null); }} onDragEnd={handleDragEnd}>
      <Wrap $day={single} $folded={folded} $solo={hideUnscheduled}>
        {!hideUnscheduled && <DropZone id={UNSCHEDULED}>
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
                <HeadButtons>
                  {tools && (
                    <FiltersBtn type="button" $on={filtersOpen || toolsSet > 0} aria-expanded={filtersOpen}
                      aria-label={filtersOpen ? 'Hide search and filters' : `Show search and filters${toolsSet ? ` (${toolsSet} set)` : ''}`}
                      title={filtersOpen ? 'Hide search and filters' : 'Show search and filters'} onClick={toggleFilters}>
                      <MaterialIcon $size={20} aria-hidden="true">tune</MaterialIcon>
                    </FiltersBtn>
                  )}
                  {onFold && (
                    <FoldBtn type="button" aria-expanded aria-label="Hide unscheduled tasks" title="Hide unscheduled tasks" onClick={() => onFold(true)}>
                      <MaterialIcon $size={20} aria-hidden="true">chevron_right</MaterialIcon>
                    </FoldBtn>
                  )}
                </HeadButtons>
              </BacklogHead>
              {filtersOpen && tools}
              <BacklogList>
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
              </BacklogList>
            </Backlog>
          ))}
        </DropZone>}

        <DaysArea>
          {dragging !== null && onPrev && onNext && (['prev', 'next'] as const).map(side => (
            <EdgeHint key={side} $side={side} $active={edge === side} $width={side === 'prev' ? leftWidth : EDGE_ZONE} aria-hidden="true">
              <MaterialIcon $size={22}>{side === 'prev' ? 'chevron_left' : 'chevron_right'}</MaterialIcon>
              {side === 'prev' && leftWidth > 90 && (single ? 'Previous day' : lanes.length === 7 ? 'Previous week' : 'Earlier days')}
            </EdgeHint>
          ))}
          <Scroll ref={pan.ref} $panning={pan.panning} {...pan.bind}>
            <Grid ref={gridRef} $cols={lanes.length} role="table" aria-label="Planner">
              {/* The hours always show (no fold) */}
              <Corner style={{ gridRow: 1, gridColumn: 1 }} />
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
                {hours.map(h => (
                  <HourMark key={h} style={{ top: Math.max(8, yAt(h * 60)) }}>{hourName(h)}</HourMark>
                ))}
              </Scale>

              {lanes.map((lane, c) => {
                const at = layouts.get(lane.day) ?? new Map<number, number>();
                // An item's place on this day (its laid-out one, else straight from its times, full width)
                const slotOf = (key: string, start: number, end: number) =>
                  slot.get(key) ?? { top: yAt(start), height: yAt(end) - yAt(start), col: 0, cols: 1 };
                return (
                  <DropZone key={lane.day} id={laneId(lane.day)}>
                    {(over, ref) => (
                      <Lane ref={ref} $over={over} role="cell" aria-label={lane.label} data-day={lane.day}
                        style={{ gridRow: 2, gridColumn: c + 2, height }}>
                        {hours.map(h => <HourLine key={h} data-hour-line aria-hidden="true" style={{ top: yAt(h * 60) }} />)}
                        {lane.events.filter(ev => ev.start !== undefined).map(ev => {
                          const key = `e:${lane.day}:${ev.key}`;
                          const sl = slotOf(key, ev.start!, ev.end ?? ev.start! + 60);
                          return (
                            <EventBlock key={ev.key} type="button" onClick={() => onOpenEvent(ev.id)} title={`${ev.title} · ${ev.when}`}
                              style={{ ...across(sl), top: sl.top + CARD_INSET, height: Math.max(MIN_CARD_PX, sl.height - 2 * CARD_INSET) }}>
                              {/* A short one is just its name (its time is its tooltip) */}
                              {ev.title}{sl.height - 2 * CARD_INSET >= 40 && <small>{ev.when}</small>}
                            </EventBlock>
                          );
                        })}
                        <SortableContext items={lane.cards.map(x => x.id)} strategy={verticalListSortingStrategy}>
                          {lane.cards.map(x => {
                            const start = at.get(x.id) ?? dayStart;
                            const sl = slotOf(`t:${x.id}`, start, start + x.hours * 60);
                            return (
                              <SortableCard key={x.id} card={x} resize={onResize ? resize : undefined} {...actions}
                                at={{ ...across(sl), top: sl.top + CARD_INSET, height: Math.max(MIN_CARD_PX, sl.height - 2 * CARD_INSET) }} />
                            );
                          })}
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
