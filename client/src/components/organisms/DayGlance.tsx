import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { NAV_COMPACT } from '../../styles/breakpoints.js';
import { MaterialIcon } from '../atoms/MaterialIcon.js';
import { Icon } from '../atoms/core/Icon.jsx';
import { Checkbox } from '../atoms/core/Checkbox.jsx';
import { TickMark } from '../atoms/TickMark.js';
import { PillButton } from '../atoms/PillButton.js';
import { cardLabel } from '../../styles/cardLabel.js';
import { useEntriesStore } from '../../stores/entriesStore.js';
import { usePlanData } from '../../hooks/usePlanData.js';
import { useEncryptedSetting } from '../../hooks/useEncryptedSetting.js';
import { useSaveFields } from '../../hooks/useSaveFields.js';
import { useCreateEntry } from '../../hooks/useCreateEntry.js';
import { useOpenInJournal } from '../../hooks/useOpenInJournal.js';
import { useFinance } from '../../hooks/useFinance.js';
import { useTodayDoses } from '../../hooks/useTodayDoses.js';
import { useRoutineChecklist } from '../../hooks/useRoutineChecklist.js';
import { showFlash } from '../../services/flashNotice.js';
import { toDateStr, formatTime12h } from '../../utils/dateUtils.js';
import { isEventTopic, calendarDayFor } from '../../utils/calendarItems.js';
import { repeatRuleOf, occurrencesBetween } from '../../utils/recurrence.js';
import { holidaysBetween } from '../../utils/holidays.js';
import { entryTitleText } from '../../utils/entryTitle.js';
import { builtinEntryName } from '../../utils/stripHtml.js';
import { billOccurrences, formatCents } from '../../utils/finance.js';
import type { ScheduledDose } from '../../types/health.js';
import { taskFieldsForStatus } from '../../types/goals.js';
import { addDays, layoutDay, startPatch, lengthPatch, parsePlannerOrder, plannerFacts, tasksByDay, hoursLabel, clampHours, hhmm, type PlannerOrder } from '../../utils/planner.js';

/* Day at a glance (the home dashboard, under the add row): one panel for a day —
   its schedule (events, meetings and the Planner's tasks on one timeline, med
   doses and bills as small icons beside it that open a list), the priorities,
   the tasks due that day and what's coming up. A week strip picks the day. The
   Priorities and Coming up widgets are passed in, so they are the same ones
   the cards show. */

const NO_ORDER: PlannerOrder = {};
/** One hour on the schedule, in px */
const HOUR_PX = 84;
/** The schedule shows 7 AM to 7 PM; the early hours and the evening (to 12 AM) fold away */
const DAY_START = 0;
const DAY_END = 24 * 60;
const EVENING = 19 * 60;
/** Whether the schedule's evening is open, per browser */
const EVENING_KEY = 'glance-evening-open-v1';
function readEveningOpen(): boolean {
  try { return localStorage.getItem(EVENING_KEY) === '1'; } catch { return false; }
}
/** …and the early hours (before 7 AM), folded until opened, per browser */
const MORNING = 7 * 60;
const MORNING_KEY = 'glance-early-open-v1';
function readMorningOpen(): boolean {
  try { return localStorage.getItem(MORNING_KEY) === '1'; } catch { return false; }
}
/** Tasks are laid out from 8 AM (or the day's first event, when earlier), as in the Planner */
const TASK_START = 8 * 60;
const px = (mins: number) => (mins / 60) * HOUR_PX;
const hourName = (h: number) => (h === 0 || h === 24 ? '12 AM' : h === 12 ? '12 PM' : h < 12 ? `${h} AM` : `${h - 12} PM`);
const WEEK_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LONG_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const dow = (day: string) => new Date(`${day}T12:00:00`).getDay();

/** "14:30" → minutes from midnight; anything else → undefined */
function minutesOf(hhmm: unknown): number | undefined {
  const m = typeof hhmm === 'string' ? /^(\d{1,2}):(\d{2})/.exec(hhmm) : null;
  if (!m) return undefined;
  const mins = Number(m[1]) * 60 + Number(m[2]);
  return mins >= 0 && mins < 24 * 60 ? mins : undefined;
}
const clock = (mins: number) => formatTime12h(`${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`);
/** "1 PM" (no minutes when on the hour) */
const shortClock = (mins: number) => clock(mins).replace(':00', '');

type Kind = 'meeting' | 'event' | 'task';
const KIND_COLOR: Record<Kind, string> = { meeting: 'var(--chart-blue)', event: 'var(--chart-violet)', task: 'var(--chart-green)' };
const KIND_NAME: Record<Kind, string> = { meeting: 'Meeting', event: 'Event', task: 'Task block' };

interface Block { key: string; id: number; kind: Kind; title: string; start: number; end: number; note?: string; done?: boolean }

/* ── Styles: the dashboard's own card, labels and pills ── */

/* No card of its own: it sits straight on the page */
/* A divider across the top, like the wellness check-in's */
/* The Meds / Move pills in the Today row: no outline */
const BarePill = styled(PillButton)`
  &&& { border-color: transparent; }
`;

/* A trial: Your Agenda in a container of its own (a --bg-panel card with the light card shadow) */
const Panel = styled.section`
  margin-top: 20px;
  padding: 40px 32px 48px;
  border-radius: 16px;
  background: var(--bg-panel);
  box-shadow: var(--shadow-card);
  /* Light: the container is the tiles' own near-white, so its cards (events, tasks, all-day) take a
     grey a step darker to show */
  html[data-theme='light'] & { --bg-tile: #eceef2; }
  @media (max-width: 760px) { padding: 30px 18px 34px; }
`;

/* The title, then the Meds / Move row under it (lined up with the title, a divider above and below) */
const Head = styled.div`
  display: block;
`;

const TitleRow = styled.div`
  display: flex;
  flex-wrap: wrap; /* narrow: Meds, Move and the button drop under the title */
  align-items: baseline;
  /* Room between the title and the Meds row when it wraps under it */
  gap: 14px 18px;
  h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 40px;
    font-weight: 200;
    line-height: 1.1;
    color: var(--text-primary);
  }
  /* Phones / tablets: the title on its own line with a hairline under it, Meds / Move below */
  ${NAV_COMPACT} {
    row-gap: 4px;
    h2 { flex-basis: 100%; padding-bottom: 24px; border-bottom: 1px solid var(--border-subtle); }
  }
  /* Only its own spans: a broad span rule here turned the pills' icons into their names */
  > span { font-family: var(--font-sans); font-size: 16px; color: var(--text-muted); }
`;

/* The picked day, between the title and the Meds / Move row */
const DateLine = styled.p`
  margin: 0;
  font-family: var(--font-sans);
  font-size: 14px;
  font-style: italic;
  font-weight: 300;
  color: var(--text-muted);
`;

const HeadActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px 26px;
  margin-left: auto;
  align-self: center;
  /* Phones and tablets: under the title, from the left, lined up with its text */
  @media (max-width: 640px) { margin-left: 0; width: 100%; justify-content: flex-start; margin-top: 12px; }
  ${NAV_COMPACT} { margin-left: 0; width: 100%; justify-content: flex-start; margin-top: 12px; }
  /* …with the expand button still at the right */
  & > button[aria-label='Open this day in the Planner'] { margin-left: auto; }

  /* The pills' figures: the count quiet, what's due in amber */
  em { font-style: normal; color: var(--text-muted); margin-left: 6px; }
  strong { margin-left: 8px; font-weight: 600; color: var(--chart-amber); }
`;

/* Meds / Move: a small icon and plain words (sentence case); the meds icon amber while a dose is due */
const HeadStat = styled.button<{ $due?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  border: none;
  background: none;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-secondary);
  cursor: pointer;
  & > span:first-child { color: ${({ $due }) => ($due ? 'var(--chart-amber)' : 'var(--color-accent)')}; }
  /* "· 5 PM due": quiet grey */
  strong { font-weight: 400; color: var(--text-muted); }
  &:hover { color: var(--text-primary); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; border-radius: 4px; }
`;

/* Opens the day in the Planner: just the icon */
const ExpandBtn = styled.button`
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  &:hover { color: var(--text-primary); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; border-radius: 4px; }
`;

const RoundBtn = styled.button`
  display: inline-grid;
  place-items: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 1px solid var(--border-pill, var(--border-strong));
  border-radius: 50%;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  &:hover { color: var(--text-primary); border-color: var(--control-border); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

/* The week's month in full, the first cell of the week row (left of the days) */
const WeekMonth = styled.div`
  align-self: center;
  padding-right: 12px;
  ${cardLabel}
  /* The same size as the days' weekday and number */
  font-size: 14px;
  font-weight: 400;
  line-height: 1;
  color: var(--text-muted);
  white-space: nowrap;
  /* Phones: abbreviated ("Nov") */
  .short { display: none; }
  @media (max-width: 640px) { .long { display: none; } .short { display: inline; } }
`;

/* The week: a day's short name over its date, small marks for what it holds; the chosen day lifted */
const Week = styled.div`
  display: grid;
  /* The month, ‹, the days (a strip that scrolls through the calendar, a week in view), › */
  grid-template-columns: auto auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  /* A line between the title and the row, and one under it (room under the title first) */
  margin-top: 28px;
  padding-top: 18px;
  border-top: 1px solid var(--border-subtle);
  container-type: inline-size;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--border-subtle);
  /* A band a shade darker than the container, edge to edge across it */
  margin-left: -32px;
  margin-right: -32px;
  padding-left: 32px;
  padding-right: 32px;
  background: rgba(0, 0, 0, 0.1);
  html[data-theme='light'] & { background: rgba(20, 24, 32, 0.025); }
  @media (max-width: 760px) { margin-left: -18px; margin-right: -18px; padding-left: 18px; padding-right: 18px; }
  @media (max-width: 640px) { gap: 2px; }
  /* Phones / tablets: close under the Meds / Move row (a line under the title above it) */
  ${NAV_COMPACT} { margin-top: 16px; }
`;

/* The days: about four months back and eight ahead, seven in view, scrolled sideways (or a week at a
   time with ‹ ›); each snaps to the left edge */
const DayStrip = styled.div`
  display: flex;
  gap: 6px;
  min-width: 0;
  overflow-x: auto;
  scroll-snap-type: x proximity;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
  container-type: inline-size;
  & > * { flex: 0 0 calc((100cqw - 36px) / 7); scroll-snap-align: start; }
  @media (max-width: 640px) { gap: 2px; & > * { flex-basis: calc((100cqw - 12px) / 7); } }
`;

/* ‹ › either side of the days: a week back or ahead */
const StripBtn = styled.button`
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  &:hover { color: var(--text-primary); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

const WeekDay = styled.button<{ $on: boolean; $today: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
  padding: 16px 14px;
  border: none;
  border-radius: 10px;
  /* The chosen day: a soft lifted fill */
  background: ${({ $on }) => ($on ? 'var(--bg-hover, rgba(255, 255, 255, 0.05))' : 'transparent')};
  text-align: left;
  cursor: pointer;
  /* The month, small, above the weekday and date */
  /* The weekday (TODAY on today, in the accent) and the date on one line */
  .day { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
  .day > small { ${cardLabel} font-size: 14px; font-weight: 300; line-height: 1; color: ${({ $today }) => ($today ? 'var(--color-accent-soft)' : 'var(--text-muted)')}; white-space: nowrap; }
  .day > span { font-family: var(--font-sans); font-size: 14px; font-weight: 400; line-height: 1; color: ${({ $on }) => ($on ? 'var(--text-primary)' : 'var(--text-secondary)')}; }
  /* Today reads "Today"; on phones / tablets just its weekday (still in the accent) */
  .today-day { display: none; }
  ${NAV_COMPACT} { .today-word { display: none; } .today-day { display: inline; } }
  &:hover .day > span { color: var(--text-primary); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  @media (max-width: 640px) { padding: 14px 8px; .day { flex-direction: column; gap: 6px; } .day > small { letter-spacing: 0.06em; } }
`;

const Marks = styled.div`
  display: flex;
  gap: 4px;
  min-height: 4px;
  i { width: 18px; height: 4px; border-radius: 2px; }
  @media (max-width: 640px) { i { width: 10px; } }
`;

/* The schedule and priorities (with the dashboard's widgets under them) beside
   the third column — Coming up, the shopping list, wins */
const Body = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 2.35fr) minmax(0, 0.85fr);
  gap: 36px 64px;
  /* Room under the date row before the schedule and lists */
  margin-top: 56px;
  align-items: start;
  /* A hairline between the columns while they're side by side */
  @media (min-width: 1201px) {
    column-gap: 32px;
    & > :nth-child(2) { align-self: stretch; padding-left: 32px; border-left: 1px solid var(--border-subtle); }
  }
  @media (max-width: 1200px) { grid-template-columns: minmax(0, 1fr); }
  /* Room under each heading's line (Schedule, Priorities, Tasks due, Coming up…) before its content */
  & > div > section > :first-child,
  & > div > div > section > :first-child { margin-bottom: 14px; }
`;

/* Schedule | priorities (the widgets sit under the container) */
const Main = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
  gap: 36px 64px;
  align-items: start;
  min-width: 0;
  /* A hairline between the schedule and the priorities while they're side by side */
  @media (min-width: 761px) {
    align-self: stretch;
    column-gap: 32px;
    & > :nth-child(2) { align-self: stretch; padding-left: 32px; border-left: 1px solid var(--border-subtle); }
  }
  @media (max-width: 760px) { grid-template-columns: minmax(0, 1fr); }
`;

/* The dashboard's widgets, under the schedule and priorities: a divider, then two across */
/* The dashboard's widgets, under Your Agenda's container (out of it, on the page) */
const Widgets = styled.div`
  min-width: 0;
  margin-top: 36px;
  /* Room between the cards (wellness, quote, On the menu, then the two columns) */
  display: flex;
  flex-direction: column;
  gap: 32px;
`;

const Col = styled.div`
  display: flex;
  flex-direction: column;
  gap: 34px;
  min-width: 0;
`;

/* A section's head inside the panel: the card label over a light rule, an aside on the right */
const SubHead = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-subtle);
  h3 { margin: 0; ${cardLabel} }
  > span { font-family: var(--font-sans); font-size: 13px; color: var(--text-muted); }
`;

const Legend = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-muted);
  span { display: inline-flex; align-items: center; gap: 6px; }
  i { width: 9px; height: 9px; border-radius: 3px; }
`;

/* The timeline: hours down the left, a gutter for the dose / bill icons, then the blocks */
const Timeline = styled.div`
  position: relative;
  margin-top: 14px;
`;

/* All-day events on the left, the bills icon on the right */
const AllDayRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px 16px;
  min-height: 30px;
  margin-bottom: 18px;
`;

const AllDayTile = styled.button`
  grid-column: 1;
  padding: 9px 14px;
  border: none;
  border-radius: 8px;
  background: var(--bg-tile);
  text-align: left;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-secondary);
  cursor: pointer;
  & + & { margin-top: 6px; }
  &:hover { color: var(--text-primary); }
  /* A holiday: not an entry, so nothing to open */
  &[data-holiday] { cursor: default; &:hover { color: var(--text-secondary); } }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

const Hours = styled.div`
  position: relative;
`;

const HourLine = styled.div`
  position: absolute;
  left: 56px;
  right: 0;
  height: 1px;
  background: var(--border-subtle);
`;

const HourName = styled.span`
  position: absolute;
  left: 0;
  transform: translateY(-50%);
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-muted);
`;

/* After the hours and a gutter wide enough for two icons side by side */
/* The cards from just after the hours; the dose icons on the right (room for two side by side) */
const Blocks = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 64px;
  right: 66px;
`;

const BlockBtn = styled.button<{ $kind: Kind }>`
  position: absolute;
  /* Dragged to another time; stretched or shortened by its foot */
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  &[data-dragging='true'] { z-index: 3; cursor: grabbing; }
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 4px;
  padding: 12px 16px;
  /* A solid tile, like the Menu's planned meals (--bg-tile), no colour fill or blur */
  border: 1px solid transparent;
  border-radius: 8px;
  background: var(--bg-tile);
  text-align: left;
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: 400;
  line-height: 1.3;
  /* A step back from bright white */
  color: color-mix(in srgb, var(--text-primary) 72%, transparent);
  overflow: hidden;
  cursor: pointer;
  /* A little room between the title and its time */
  .body { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  /* The time and place (an address can run to two or three lines) */
  small { margin-top: 4px; font-size: 13px; font-weight: 400; font-style: italic; line-height: 1.55; color: var(--text-muted); }
  &:hover { border-color: var(--border-default); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  /* A task card: room on the left for its tick; struck through once done */
  &[data-task='true'] { padding-left: 44px; }
  &[data-done='true'] .title { text-decoration: line-through; color: var(--text-tertiary); }
`;

/* A task card's tick, to the left of its title: an 18px circle in a 32px target, so it's
   small but easy to tap. A sibling of the card (never inside its button), placed over it */
const CardTick = styled.button`
  position: absolute;
  left: 6px;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  touch-action: manipulation;
  &:hover { background: var(--bg-hover); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 1px; }
`;

/* Schedule's +: just the plus in the accent (no circle), across from the heading */
const AddBtn = styled.button`
  align-self: center;
  /* Taller than the label: pulled in, so this head's rule stays level with the columns' beside it */
  margin: -8px -6px -8px 0;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--color-accent-soft, var(--color-accent));
  cursor: pointer;
  &:hover { color: var(--color-accent); background: var(--bg-hover); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

/* The + opens this under the heading: one outlined box (what | time), then Add / Cancel */
const AddForm = styled.form`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 12px;
  margin-top: 14px;
  /* Room under Add / Cancel before the schedule starts */
  margin-bottom: 26px;
  .box {
    flex: 1 1 260px;
    display: flex;
    align-items: center;
    min-width: 0;
    height: 44px;
    border: 1px solid var(--border-card);
    border-radius: 10px;
    &:focus-within { border-color: var(--color-accent-line); }
  }
  input {
    min-width: 0;
    height: 100%;
    padding: 0 14px;
    border: none !important;
    background: transparent !important;
    outline: none;
    font-family: var(--font-sans);
    font-size: 15px;
    color: var(--text-primary);
  }
  input[type='text'] { flex: 1; }
  input[type='time'] { flex: none; width: 128px; border-left: 1px solid var(--border-card) !important; color-scheme: inherit; }
  input::placeholder { color: var(--text-placeholder, var(--text-muted)); }
  .acts { display: flex; gap: 8px; }
`;

/* A task that can be dragged onto the schedule: its grip */
const DragGrip = styled.button`
  flex: none;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  margin: -5px -6px -5px 0;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: grab;
  touch-action: none;
  &:hover { background: var(--bg-hover); color: var(--text-secondary); }
  &:active { cursor: grabbing; }
`;

/* Where a carried task would land: a dashed accent line across the schedule, with its time */
const DropLine = styled.div`
  position: absolute;
  left: 60px;
  right: 0;
  z-index: 4;
  border-top: 2px dashed var(--color-accent);
  pointer-events: none;
  span {
    position: absolute;
    left: 8px;
    top: -24px;
    padding: 2px 8px;
    border-radius: 6px;
    background: var(--color-accent);
    color: var(--on-accent, #fff);
    font-family: var(--font-sans);
    font-size: 12px;
    font-weight: 600;
  }
`;

/* The task in hand while it's carried: a small floating tile under the pointer */
const Ghost = styled.div`
  position: fixed;
  z-index: 80;
  max-width: 260px;
  padding: 9px 14px;
  border: 1px solid var(--border-pop, var(--border-default));
  border-radius: 8px;
  background: var(--bg-tile);
  box-shadow: var(--shadow-lg);
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
`;

/* The foot of a schedule card: drag it down to stretch the card, up to shorten it */
const StretchGrip = styled.span`
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 10px;
  cursor: ns-resize;
  &::after {
    content: '';
    position: absolute;
    left: 50%;
    bottom: 3px;
    width: 28px;
    height: 3px;
    margin-left: -14px;
    border-radius: 2px;
    background: var(--text-muted);
    opacity: 0;
    transition: opacity 120ms;
  }
  button:hover > &::after, button:focus-visible > &::after, button[data-dragging='true'] > &::after { opacity: 0.6; }
`;

/* A dose or bill marker in the gutter: just the icon, no circle — amber while something is
   still due, the accent once it's all taken, quiet grey on a day ahead */
const Marker = styled.button<{ $due: boolean; $ahead?: boolean }>`
  position: absolute;
  left: 60px;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: ${({ $due, $ahead }) => ($ahead ? 'var(--text-muted)' : $due ? 'var(--chart-amber)' : 'var(--color-accent)')};
  &:hover { background: var(--bg-hover); }
  transform: translateY(-50%);
  cursor: pointer;
  z-index: 2;
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

/* Now, on today: a coral line with a dot */
const NowLine = styled.div`
  position: absolute;
  left: 60px;
  right: 0;
  height: 2px;
  background: var(--mood-1);
  z-index: 3;
  pointer-events: none;
  &::before { content: ''; position: absolute; left: -5px; top: -4px; width: 10px; height: 10px; border-radius: 50%; background: var(--mood-1); }
`;

/* Opens / folds the schedule's evening (after 7 PM) */
/* Full width, with a hairline across the schedule above it */
const EveningBtn = styled.button`
  display: flex;
  width: 100%;
  align-items: center;
  gap: 4px;
  margin-top: 14px;
  padding: 14px 0 0;
  border: none;
  border-top: 1px solid var(--border-subtle);
  text-align: left;
  background: none;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
  cursor: pointer;
  &:hover { color: var(--color-accent-link); }
`;

/* A hairline above it */
const LaterNote = styled.p`
  margin: 28px 0 0;
  padding-top: 14px;
  border-top: 1px solid var(--border-subtle);
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
`;

const ItemRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 17px 0;
  & + & { border-top: 1px solid var(--border-subtle); }
  font-family: var(--font-sans);
  /* The tick is as tall as the title's first line, so the two line up at the top */
  & > label { flex: none; height: 18px; }
`;

const ItemText = styled.button<{ $done?: boolean }>`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 7px; /* room between the title and its Due line */
  padding: 0;
  border: none;
  background: none;
  text-align: left;
  font-family: var(--font-sans);
  font-size: 15px;
  line-height: 18px; /* the tick's height: the title's first line sits level with it */
  color: ${({ $done }) => ($done ? 'var(--text-tertiary)' : 'var(--text-secondary)')};
  text-decoration: ${({ $done }) => ($done ? 'line-through' : 'none')};
  cursor: pointer;
  small { font-size: 13px; line-height: 1.35; color: var(--text-muted); text-decoration: none; }
  &:hover { color: var(--text-primary); }
`;


const Muted = styled.p`
  margin: 14px 0 0;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
`;

/* "4 tasks with no day yet · Place them on the week" */
const NoDay = styled.div`
  padding: 20px 24px;
  border: 1px dashed var(--border-dashed, var(--border-default));
  border-radius: 12px;
  font-family: var(--font-sans);
  font-size: 16px;
  color: var(--text-secondary);
  > button { display: block; margin-top: 6px; padding: 0; border: none; background: none; font: inherit; font-size: 15px; color: var(--color-accent-link); cursor: pointer; }
  > button:hover { text-decoration: underline; }
  ul { list-style: none; margin: 14px 0 4px; padding: 0; }
  li { display: flex; align-items: center; gap: 10px; padding: 9px 0; font-size: 15px; }
  li + li { border-top: 1px solid var(--border-subtle); }
  li .name { flex: 1; min-width: 0; padding: 0; border: none; background: none; font: inherit; color: var(--text-secondary); text-align: left; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  li .name:hover { color: var(--text-primary); }
  p { margin: 4px 0 0; font-size: 13px; color: var(--text-muted); }
`;

/* The list a marker opens: a small floating panel, like the app's other menus */
const Pop = styled.div`
  position: fixed;
  z-index: 60;
  width: min(320px, calc(100vw - 32px));
  padding: 14px 16px 10px;
  border: 1px solid var(--border-pop);
  border-radius: 12px;
  background: var(--bg-tile);
  box-shadow: var(--shadow-lg);
  font-family: var(--font-sans);
  /* Never taller than the room on screen: the heading stays, the rows scroll (PopBody) */
  display: flex;
  flex-direction: column;
  h4 { flex: none; margin: 0 0 8px; padding-right: 28px; ${cardLabel} }
`;

/* The rows of a pop-up: they scroll inside it when there are more than fit, so the last
   ones can always be reached and ticked (scrolling here never scrolls the page under it) */
const PopBody = styled.div`
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  margin: 0 -16px;
  padding: 0 16px;
`;

/* The pop-up's close button: a small × in its top-right corner */
const PopClose = styled.button`
  position: absolute;
  top: 8px;
  right: 8px;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  &:hover { color: var(--text-primary); background: var(--bg-hover); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 1px; }
`;

const PopRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 0;
  & + & { border-top: 1px solid var(--border-subtle); }
  font-size: 15px;
  color: var(--text-secondary);
  > span { flex: 1; min-width: 0; }
  small { display: block; font-size: 13px; color: var(--text-muted); }
`;

const PopLink = styled.button`
  margin-top: 6px;
  padding: 6px 0 2px;
  border: none;
  background: none;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--color-accent-link);
  cursor: pointer;
`;

/* ── The list a marker opens ── */

function MarkerList({ anchor, title, onClose, children }: { anchor: DOMRect; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const t = setTimeout(() => document.addEventListener('mousedown', away));
    document.addEventListener('keydown', esc);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [onClose]);
  // Placed again when the window changes size (a phone turning, a keyboard opening)
  const [, setSize] = useState(0);
  useEffect(() => {
    const again = () => setSize(n => n + 1);
    window.addEventListener('resize', again);
    return () => window.removeEventListener('resize', again);
  }, []);
  const GAP = 8, EDGE = 16;
  const left = Math.max(EDGE, Math.min(anchor.left, window.innerWidth - 336));
  // Under the button when there's room, else on whichever side has more; never taller than that room
  const roomBelow = window.innerHeight - anchor.bottom - GAP - EDGE;
  const roomAbove = anchor.top - GAP - EDGE;
  const below = roomBelow >= 260 || roomBelow >= roomAbove;
  const maxHeight = Math.max(140, below ? roomBelow : roomAbove);
  const place: React.CSSProperties = below
    ? { left, top: anchor.bottom + GAP, maxHeight }
    : { left, bottom: window.innerHeight - anchor.top + GAP, maxHeight };
  return createPortal(
    <Pop ref={ref} role="dialog" aria-label={title} style={place}>
      <h4>{title}</h4>
      <PopClose type="button" aria-label="Close" title="Close" onClick={onClose}>
        <Icon name="x" size={15} strokeWidth={2} />
      </PopClose>
      <PopBody>{children}</PopBody>
    </Pop>,
    document.body,
  );
}

/* ── The panel ── */

export function DayGlance({ priorities, wins, comingUp, shopping, widgets, side, weather, financeOn, medsOn, exerciseOn }: {
  /** The dashboard's own Priorities, Wins and Coming up widgets (in their compact look) */
  priorities: ReactNode;
  wins?: ReactNode;
  comingUp: ReactNode;
  /** The shopping list, under Coming up */
  shopping?: ReactNode;
  /** The dashboard's draggable widgets, two across under the schedule and priorities */
  widgets?: ReactNode;
  /** Widgets dropped into the third column, under Coming up and the shopping list */
  side?: ReactNode;
  /** Today's weather at home ("56° and cloudy in Portland"), shown after today's date */
  weather?: string;
  financeOn: boolean;
  medsOn: boolean;
  exerciseOn: boolean;
}) {
  const navigate = useNavigate();
  const openInJournal = useOpenInJournal();
  const saveFields = useSaveFields();
  const createEntry = useCreateEntry();
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const { goals, milestones, tasks } = usePlanData();
  const [savedOrder] = useEncryptedSetting<PlannerOrder>('plannerOrder', NO_ORDER);
  const order = useMemo(() => parsePlannerOrder(savedOrder), [savedOrder]);
  const { records: bills } = useFinance('bills', { enabled: financeOn });

  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(id); }, []);
  const today = toDateStr(now);
  const [picked, setPicked] = useState<string | null>(null);
  const [eveningOpen, setEveningOpen] = useState(readEveningOpen);
  const [morningOpen, setMorningOpen] = useState(readMorningOpen);
  const toggleMorning = () => setMorningOpen(v => {
    try { localStorage.setItem(MORNING_KEY, v ? '0' : '1'); } catch { /* per browser only */ }
    return !v;
  });
  /* Schedule cards: drag one to another time, or its foot to stretch / shorten it */
  const [drag, setDrag] = useState<{ key: string; start: number; end: number; mode: 'move' | 'end'; dy: number } | null>(null);
  // Each card's natural height (its text and padding), measured after it draws, so the hours
  // can grow until every card shows in full with nothing overlapping
  const [needs, setNeeds] = useState<Record<string, number>>({});
  const cardBodies = useRef(new Map<string, HTMLElement>());
  // The schedule's scale as drawn (hours grow to fit their cards): kept fresh each render and frozen
  // when a drag starts, so the pointer moves a card by the hours you see — never by a fixed 84px an
  // hour — and the hours don't re-measure under it until it's let go
  type Scale = { yAt: (mins: number) => number; minutesAt: (y: number) => number; cards: { key: string; top: number; bottom: number; start: number }[] };
  const scaleRef = useRef<Scale | null>(null);
  const dragRef = useRef<{ b: Block; mode: 'move' | 'end'; y0: number; moved: boolean; start: number; end: number; scale: Scale | null } | null>(null);
  const onCardDown = (b: Block, mode: 'move' | 'end', e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { b, mode, y0: e.clientY, moved: false, start: b.start, end: b.end, scale: scaleRef.current };
  };
  const onCardMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dy = e.clientY - d.y0;
    if (!d.moved && Math.abs(dy) < 4) return;
    d.moved = true;
    const len = d.b.end - d.b.start;
    // Events by 15 minutes; a task's length by half hours (as in the Planner)
    const step = d.mode === 'end' && d.b.kind === 'task' ? 30 : 15;
    // Where the pointer now is on the schedule as drawn (the hours as tall as they show), as a time
    // Moved: the time where the card's top now is on the schedule as drawn; stretched: the time where
    // its end now is
    const me = d.scale?.cards.find(c => c.key === d.b.key);
    const at = (mins: number) => {
      if (!d.scale || !me) return mins + (dy / HOUR_PX) * 60;
      return mins === d.b.start ? d.scale.minutesAt(me.top + dy) : d.scale.minutesAt(d.scale.yAt(d.b.end) + dy);
    };
    const snap = (m: number) => Math.round(m / step) * step;
    if (d.mode === 'move') {
      // Over another card (or anywhere on a stack sharing a time): that card's time, so it joins them
      const r = hoursRef.current?.getBoundingClientRect();
      const onCard = r ? cardTimeAt(d.scale, e.clientY - r.top - 7, d.b.key) : undefined;
      d.start = onCard ?? Math.max(0, Math.min(24 * 60 - len, snap(at(d.b.start))));
      d.end = d.start + len;
    } else {
      d.start = d.b.start;
      d.end = Math.max(d.b.start + step, Math.min(d.b.kind === 'task' ? d.b.start + 12 * 60 : 24 * 60, snap(at(d.b.end))));
    }
    setDrag({ key: d.b.key, start: d.start, end: d.end, mode: d.mode, dy });
  };
  const onCardUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!d) return;
    if (!d.moved) { if (d.mode === 'move') openInJournal(d.b.id); return; }
    if (d.start === d.b.start && d.end === d.b.end) return;
    const failed = () => showFlash('Couldn’t save that time, so it’s back where it was. Try again.');
    if (d.b.kind === 'task') {
      const t = dayTasks.find(x => x.id === d.b.id);
      if (!t) return;
      const fields = d.mode === 'move'
        ? startPatch(t.fields, d.start) // a same-day end time moves with it
        : lengthPatch(t.fields, (d.end - d.start) / 60);
      void saveFields(t.entry, fields).then(ok => { if (!ok) failed(); });
      return;
    }
    const entry = entries.find(x => x.id === d.b.id);
    if (!entry) return;
    const cf = ((entry.metadata as Record<string, unknown> | undefined)?._customFields as Record<string, unknown>) ?? {};
    void saveFields(entry, { ...cf, startTime: hhmm(d.start), endTime: hhmm(Math.min(d.end, 24 * 60 - 1)) }).then(ok => { if (!ok) failed(); });
  };
  const toggleEvening = () => setEveningOpen(v => {
    try { localStorage.setItem(EVENING_KEY, v ? '0' : '1'); } catch { /* per browser only */ }
    return !v;
  });
  const day = picked ?? today;
  const isToday = day === today;
  // Monday to Sunday, the week holding the chosen day
  const monday = addDays(day, -((dow(day) + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  /* The date strip: about four months back and eight ahead of today (wider if the chosen day is
     further out), scrolled sideways; it opens on the chosen day's week */
  // Anchored to today, so picking a day never shifts the days under the scroll; it reaches
  // further only for a day beyond that range
  const earliest = addDays(today, -120);
  const from = day < earliest ? day : earliest;
  const stripStart = addDays(from, -((dow(from) + 6) % 7));
  const latest = addDays(today, 240);
  const stripEnd = day > latest ? day : latest;
  const stripDays = useMemo(() => {
    const end = stripEnd;
    const out: string[] = [];
    for (let d = stripStart; d <= end; d = addDays(d, 1)) out.push(d);
    return out;
  }, [stripStart, stripEnd]);
  const stripRef = useRef<HTMLDivElement>(null);
  const [firstInView, setFirstInView] = useState(0);
  // A day's step along the strip, measured exactly (cells are fractional widths)
  const cellWidth = () => {
    const kids = stripRef.current?.children;
    if (!kids || kids.length < 2) return 0;
    return (kids[1] as HTMLElement).getBoundingClientRect().left - (kids[0] as HTMLElement).getBoundingClientRect().left;
  };
  const onStripScroll = () => {
    const w = cellWidth();
    if (w) setFirstInView(Math.round((stripRef.current?.scrollLeft ?? 0) / w));
  };
  const stripBy = (n: number) => {
    const w = cellWidth();
    stripRef.current?.scrollBy({ left: n * w, behavior: 'smooth' });
  };
  // Opening (and when the chosen day is set from elsewhere): its week at the left. Picking a day
  // in view doesn't move the strip
  const shownWeek = useRef('');
  // If the strip ever reaches further back (a day before its start), keep the same days in view
  const startRef = useRef(stripStart);
  useLayoutEffect(() => {
    const el = stripRef.current;
    const w = cellWidth();
    if (!el || !w) return;
    const i = stripDays.indexOf(day);
    const visible = i >= firstInView && i < firstInView + 7;
    if (shownWeek.current && visible) return;
    const at = stripDays.indexOf(monday);
    if (at >= 0) { el.scrollLeft = at * w; setFirstInView(at); }
    shownWeek.current = monday;
    startRef.current = stripStart; // placed against the strip as it is now
  }, [day]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = stripRef.current;
    const w = cellWidth();
    if (el && w && startRef.current !== stripStart) {
      const added = Math.round((new Date(`${startRef.current}T12:00:00`).getTime() - new Date(`${stripStart}T12:00:00`).getTime()) / 86_400_000);
      el.scrollLeft += added * w;
    }
    startRef.current = stripStart;
  }, [stripStart]); // eslint-disable-line react-hooks/exhaustive-deps
  const inView = stripDays.slice(firstInView, firstInView + 7);

  /* Doses: the day's logs follow the chosen day back to today (never ahead) */
  const doses = useTodayDoses(medsOn);
  useEffect(() => {
    const target = day > today ? today : day;
    if (doses.day === target) return;
    const diff = Math.round((new Date(`${target}T12:00:00`).getTime() - new Date(`${doses.day}T12:00:00`).getTime()) / 86_400_000);
    if (diff) doses.shiftDay(diff);
  }, [day, today, doses.day]); // eslint-disable-line react-hooks/exhaustive-deps
  const dosesForDay = doses.day === day;
  const routines = useRoutineChecklist(day);

  /* Events and meetings on the days of the week shown (repeats included) */
  const eventsByDay = useMemo(() => {
    const map = new Map<string, { id: number; kind: Kind; title: string; start?: number; end?: number; where?: string }[]>();
    const names = new Map(allTopics.map(t => [t.id, t.name]));
    const from = week[0];
    const to = week[6];
    for (const e of entries) {
      const meta = e.metadata as Record<string, unknown> | undefined;
      const name = names.get(meta?._taxonomyId as number);
      if (!isEventTopic(name)) continue;
      const first = calendarDayFor(e, name);
      if (!first) continue;
      const cf = (meta?._customFields as Record<string, unknown>) ?? {};
      const rule = repeatRuleOf(cf);
      const on = rule ? occurrencesBetween(first, rule, from, to) : first >= from && first <= to ? [first] : [];
      const start = cf.allDay ? undefined : minutesOf(cf.startTime);
      const endAt = minutesOf(cf.endTime);
      const end = start === undefined ? undefined : endAt !== undefined && endAt > start ? endAt : start + 60;
      const kind: Kind = (name ?? '').toLowerCase().startsWith('meeting') ? 'meeting' : 'event';
      const where = [cf.location, kind === 'meeting' ? cf.meetingTopic : undefined].filter(v => typeof v === 'string' && v.trim()).join(' · ');
      for (const d of on) {
        const list = map.get(d) ?? [];
        list.push({ id: e.id, kind, title: entryTitleText(e.content) || builtinEntryName(cf) || name || 'Event', start, end, where: where || undefined });
        map.set(d, list);
      }
    }
    return map;
  }, [entries, allTopics, week[0]]); // eslint-disable-line react-hooks/exhaustive-deps

  /* The Planner's tasks on each day (unfinished, in the day's order) */
  const planned = useMemo(() => tasks.map(t => ({ ...t, ...plannerFacts(t.id, t.fields, t.created) })), [tasks]);
  // Done ones stay on the agenda, struck through, so a tick can be undone there
  const byDay = useMemo(() => tasksByDay(planned, week, today, order), [planned, week[0], today, order]); // eslint-disable-line react-hooks/exhaustive-deps

  /* The chosen day's timeline: events and meetings at their times, tasks in the free time around them */
  const dayEvents = eventsByDay.get(day) ?? [];
  const timedEvents = dayEvents.filter(ev => ev.start !== undefined);
  const allDay = dayEvents.filter(ev => ev.start === undefined);
  // The day's holidays (when Holidays is on in Settings → Features), first among the all-day items
  const holidaysOn = useEntriesStore(s => s.featureFlags.holidaysEnabled !== false);
  const dayHolidays = useMemo(() => (holidaysOn ? holidaysBetween(day, day).get(day) ?? [] : []), [day, holidaysOn]);
  const dayTasks = byDay.get(day) ?? [];
  const dayStart = morningOpen ? DAY_START : MORNING;
  const taskStart = Math.min(TASK_START, ...timedEvents.map(ev => Math.floor(ev.start! / 60) * 60));
  const taskAt = layoutDay(dayTasks.map(t => ({ id: t.id, hours: t.hours, at: t.at })), timedEvents.map(ev => ({ start: ev.start!, end: ev.end! })), taskStart);
  const blocks: Block[] = [
    ...timedEvents.map((ev, i) => ({
      key: `e${ev.id}-${i}`, id: ev.id, kind: ev.kind, title: ev.title, start: ev.start!, end: ev.end!,
      note: [`${clock(ev.start!)} – ${clock(ev.end!)}`, ev.where].filter(Boolean).join(' · '),
    })),
    ...dayTasks.map(t => {
      const start = taskAt.get(t.id) ?? taskStart;
      const end = start + Math.round(t.hours * 60);
      return { key: `t${t.id}`, id: t.id, kind: 'task' as const, title: t.title, start, end, note: `${clock(start)} – ${clock(end)} · ${hoursLabel(t.hours)}`, done: t.done };
    }),
  ];
  const dayEnd = eveningOpen ? DAY_END : EVENING;
  // Folded: what starts after 7 PM is hidden (counted on the toggle)
  const eveningCount = blocks.filter(b => b.start >= EVENING).length;
  const morningCount = blocks.filter(b => b.start < MORNING).length;
  const shownBlocks = blocks.filter(b => b.start < dayEnd && b.end > dayStart);
  const hours: number[] = [];
  for (let h = dayStart / 60; h <= dayEnd / 60; h++) hours.push(h);
  /* Each card sits in the hour row it starts in. When an hour has room, a card is placed at its
     time within it; when cards crowd an hour (seven at 3 PM, say) they stack one under another and
     that row grows to hold them all — the next hour's line moves down below them. Every card is
     at least as tall as its length (84px an hour) and as tall as its words need. */
  const CARD_GAP = 24; // 12px above and below each card
  const needOf = (k: string) => Math.max(30, needs[k] ?? 0) + CARD_GAP;
  // The room a card takes in the row it starts in: its words, or its part of that hour (a 3–6 PM card
  // takes 3–4 PM there, then runs on down to its end — see slot)
  const cardH = (b: Block, h: number) =>
    Math.ceil(Math.max(needOf(b.key), ((Math.min(b.end, (h + 1) * 60) - Math.max(b.start, h * 60)) / 60) * HOUR_PX));
  const startHour = (b: Block) => Math.max(Math.floor(dayStart / 60), Math.floor(b.start / 60));
  const byHour = new Map<number, Block[]>();
  for (const b of [...shownBlocks].sort((a, c) => a.start - c.start || a.title.localeCompare(c.title))) {
    const h = startHour(b);
    byHour.set(h, [...(byHour.get(h) ?? []), b]);
  }
  // Within a row: each card at its minute (at the plain 84px an hour), or under the one above it
  const rowPlaces = new Map<number, { key: string; off: number; height: number }[]>();
  for (const [h, list] of byHour) {
    let bottom = 0;
    rowPlaces.set(h, list.map(b => {
      const off = Math.max(bottom, ((Math.max(b.start, h * 60) - h * 60) / 60) * HOUR_PX);
      const height = cardH(b, h);
      bottom = off + height;
      return { key: b.key, off, height };
    }));
  }
  // A row is an hour tall, or as tall as the cards that start in it
  const hourPx = (h: number) => {
    const rows = rowPlaces.get(h) ?? [];
    const used = rows.reduce((m, r) => Math.max(m, r.off + r.height), 0);
    return Math.ceil(Math.max(HOUR_PX, used));
  };
  const hourTops: number[] = [];
  {
    let y = 0;
    for (let h = Math.floor(dayStart / 60); h <= Math.ceil(dayEnd / 60); h++) { hourTops[h] = y; y += hourPx(h); }
  }
  const yAt = (mins: number) => {
    const m = Math.max(dayStart, Math.min(dayEnd, mins));
    const h = Math.min(Math.floor(m / 60), Math.ceil(dayEnd / 60));
    return (hourTops[h] ?? 0) - (hourTops[Math.floor(dayStart / 60)] ?? 0) + ((m - h * 60) / 60) * hourPx(h);
  };
  // The other way: the time at a height on the schedule (for a task dropped there)
  const minutesAt = (y: number) => {
    const first = Math.floor(dayStart / 60);
    const base = hourTops[first] ?? 0;
    for (let h = first; h <= Math.ceil(dayEnd / 60); h++) {
      const top = (hourTops[h] ?? 0) - base;
      const px = hourPx(h);
      if (y < top + px) return Math.max(dayStart, Math.min(dayEnd, h * 60 + (Math.max(0, y - top) / px) * 60));
    }
    return dayEnd;
  };
  // Each card's place: in the row of the hour it starts in (see rowPlaces), running on down to its end
  // time so it covers its whole span (3–6 PM reaches the 6 PM line). Cards later in that span may sit
  // over it — the later one on top — and it's up to the planner to sort out the clash
  const endOf = new Map(shownBlocks.map(b => [b.key, b.end]));
  // Drawn in time order, so a card starting later sits over a long one it overlaps
  const layer = new Map([...shownBlocks].sort((a, c) => a.start - c.start || a.title.localeCompare(c.title)).map((b, i) => [b.key, 1 + i * 2]));
  const slot = new Map<string, { top: number; height: number }>();
  for (const [h, rows] of rowPlaces) {
    const rowTop = (hourTops[h] ?? 0) - (hourTops[Math.floor(dayStart / 60)] ?? 0);
    for (const r of rows) {
      const top = rowTop + r.off;
      const reach = yAt(endOf.get(r.key) ?? 0) - top;
      slot.set(r.key, { top, height: Math.max(r.height, reach) });
    }
  }

  // While nothing is being dragged, the scale as drawn (a drag keeps the one it started with)
  // (the cards' places too: dropped on a card — or anywhere on a stack sharing a time — a card takes
  // that card's time, so any number can share one, e.g. five 1-hour events at 3 PM)
  if (!dragRef.current) {
    scaleRef.current = {
      yAt, minutesAt,
      cards: shownBlocks.map(b => {
        const sl = slot.get(b.key) ?? { top: yAt(b.start), height: yAt(b.end) - yAt(b.start) };
        return { key: b.key, top: sl.top, bottom: sl.top + sl.height, start: b.start };
      }),
    };
  }
  /** The time of the card at height `y` on the schedule (not `skip`), if the pointer is on one */
  const cardTimeAt = (sc: Scale | null, y: number, skip?: string): number | undefined =>
    sc?.cards.find(c => c.key !== skip && y >= c.top && y < c.bottom)?.start;

  useLayoutEffect(() => {
    // Mid-drag the hours hold still: a dragged card's words change (it shows its new times), and
    // re-measuring then would stretch the hours under the pointer
    if (dragRef.current) return;
    const next: Record<string, number> = {};
    let changed = false;
    for (const [k, el] of cardBodies.current) {
      if (!el.isConnected) continue;
      const h = Math.ceil(el.offsetHeight + 26); // the card's 12px padding top and bottom, and its border
      next[k] = h;
      if (Math.abs((needs[k] ?? 0) - h) > 1) changed = true;
    }
    if (changed) setNeeds(next);
  });

  /* Doses as icons at their times (one per time), the later ones as a note under the scale */
  const doseGroups = medsOn ? doses.groups.map(g => ({ ...g, mins: minutesOf(g.time) })).filter(g => g.mins !== undefined) : [];
  const shownDoses = doseGroups.filter(g => g.mins! >= dayStart && g.mins! <= dayEnd);
  const earlyDoses = doseGroups.filter(g => g.mins! < dayStart);
  const laterDoses = doseGroups.filter(g => g.mins! > dayEnd);
  const pendingOf = (g: { doses: ScheduledDose[] }) => (dosesForDay ? g.doses.filter(d => !doses.isTaken(d)) : g.doses);
  /* Bills due that day: one icon at the top of the day */
  const dayBills = financeOn ? billOccurrences(bills, day, day).map(o => o.bill) : [];

  /* Tasks due that day (deadline), done ones struck through */
  const due = tasks.filter(t => t.fields.deadline === day);
  const goalName = new Map(goals.map(g => [g.id, g.title]));
  const milestoneName = new Map(milestones.map(m => [m.id, m.title]));
  // Unfinished tasks with no day — ideas from the backlog too (a new task starts there), so any
  // task can be dragged onto the schedule from here
  const noDay = planned.filter(t => !t.done && !t.scheduled).length;

  /* The header's pills: meds taken that day, and the exercise schedule's minutes */
  const medTotal = medsOn ? doses.groups.reduce((n, g) => n + g.doses.length, 0) : 0;
  const medTaken = dosesForDay ? doses.taken : 0;
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const nextDue = isToday && dosesForDay ? doseGroups.find(g => pendingOf(g).length > 0 && g.mins! <= nowMins + 60)?.mins : undefined;
  const moveTotal = exerciseOn ? routines.slots.reduce((n, s) => n + (s.routine.minutes || 0), 0) : 0;
  const moveDone = exerciseOn ? routines.slots.filter(routines.isDone).reduce((n, s) => n + (s.routine.minutes || 0), 0) : 0;

  /* Marks under each day in the week strip: one per thing on it, coloured by kind (up to five) */
  const marksOf = (d: string): Kind[] => [
    ...(eventsByDay.get(d) ?? []).map(ev => ev.kind),
    ...(byDay.get(d) ?? []).map(() => 'task' as const),
  ].slice(0, 5);

  const [open, setOpen] = useState<{ kind: 'dose' | 'bill' | 'meds'; key?: string; rect: DOMRect } | null>(null);
  const openFrom = (kind: 'dose' | 'bill' | 'meds', e: React.MouseEvent<HTMLElement>, key?: string) => setOpen({ kind, key, rect: e.currentTarget.getBoundingClientRect() });

  /* Schedule's +: a task planned for the chosen day, at a time (blank = it follows the day's order) */
  const [adding, setAdding] = useState(false);
  const [addTitle, setAddTitle] = useState('');
  const [addTime, setAddTime] = useState('');
  const openAdd = () => {
    if (adding) { setAdding(false); return; }
    // Today: the next quarter hour; another day: 9 AM
    const next = Math.min(23 * 60 + 45, Math.ceil((nowMins + 1) / 15) * 15);
    setAddTime(isToday ? hhmm(next) : '09:00');
    setAddTitle('');
    setAdding(true);
  };
  const addPlanned = async () => {
    const text = addTitle.trim();
    if (!text) return;
    const time = addTime;
    setAddTitle('');
    setAdding(false);
    // Make sure it shows: a time before 7 AM or after 7 PM opens that part of the day
    const at = minutesOf(time);
    if (at !== undefined && at < MORNING && !morningOpen) toggleMorning();
    if (at !== undefined && at >= EVENING && !eveningOpen) toggleEvening();
    const id = await createEntry({ name: 'Task', icon: 'circle-check' }, text, {
      taskDescription: text, ...taskFieldsForStatus('todo'), isAutoMigrating: false,
      parentGoalId: null, parentMilestoneId: null, deadline: '', priority: 'none',
      scheduledDate: day, scheduledTime: time, scheduledHours: 1,
    });
    if (id === null) showFlash('That task didn’t save. Try again.');
  };

  /* Carrying a task (from Tasks due, or the ones with no day) onto the schedule: pointer events,
     so it works with touch too. Dropped on the schedule it's planned for this day at that time */
  const hoursRef = useRef<HTMLDivElement>(null);
  const [carry, setCarry] = useState<{ id: number; title: string; x: number; y: number; at: number | null } | null>(null);
  const timeAtPoint = (x: number, y: number): number | null => {
    const r = hoursRef.current?.getBoundingClientRect();
    if (!r || x < r.left || x > r.right || y < r.top || y > r.bottom) return null;
    // Over a card (or a stack sharing a time): that card's time, so any number can share one
    const onCard = cardTimeAt(scaleRef.current, y - r.top - 7);
    if (onCard !== undefined) return onCard;
    return Math.min(23 * 60 + 45, Math.round(minutesAt(y - r.top - 7) / 15) * 15);
  };
  const onCarryDown = (t: { id: number; title: string }, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    setCarry({ id: t.id, title: t.title, x: e.clientX, y: e.clientY, at: timeAtPoint(e.clientX, e.clientY) });
  };
  const onCarryMove = (e: React.PointerEvent) => {
    if (!carry) return;
    setCarry({ ...carry, x: e.clientX, y: e.clientY, at: timeAtPoint(e.clientX, e.clientY) });
  };
  const onCarryUp = (e: React.PointerEvent) => {
    const c = carry;
    setCarry(null);
    if (!c) return;
    const at = e.type === 'pointercancel' ? null : timeAtPoint(e.clientX, e.clientY);
    if (at === null) return;
    const t = tasks.find(x => x.id === c.id);
    if (!t) return;
    const fields: Record<string, unknown> = { ...t.fields, scheduledDate: day, scheduledTime: hhmm(at) };
    // An idea from the backlog becomes a planned task once it's on the schedule
    if (t.fields.isBacklog) Object.assign(fields, taskFieldsForStatus('todo'));
    void saveFields(t.entry, fields).then(ok => { if (!ok) showFlash('Couldn’t put that task on the schedule. Try again.'); });
  };
  const carryProps = (t: { id: number; title: string }) => ({
    type: 'button' as const,
    'aria-label': `Drag “${t.title}” onto the schedule`,
    title: 'Drag onto the schedule',
    onPointerDown: (e: React.PointerEvent) => onCarryDown(t, e),
    onPointerMove: onCarryMove,
    onPointerUp: onCarryUp,
    onPointerCancel: onCarryUp,
  });
  // The tasks with no day yet, listed so they can be dragged on (a few; the Planner has the rest)
  // Ideas last, newest first within each
  const noDayTasks = planned.filter(t => !t.done && !t.scheduled).sort((x, y) => Number(x.backlog) - Number(y.backlog) || y.created - x.created);
  const NO_DAY_SHOWN = 5;
  const tick = (t: typeof tasks[number]) =>
    void saveFields(t.entry, { ...t.fields, isCompleted: !t.fields.isCompleted, isInProgress: false, isInReview: false }).then(ok => {
      if (!ok) showFlash('Couldn’t save that task. Try again.');
    });

  const dayWord = isToday ? 'today' : `on ${WEEK_NAMES[dow(day)]}`;
  const [, mm, dd] = day.split('-').map(Number);
  // The picked day in full, under the title (the title no longer names it)
  const dateLine = new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const height = yAt(dayEnd);

  const doseRow = (d: ScheduledDose) => (
    <PopRow key={`${d.medicationPostId}-${d.time}`}>
      <span>{d.medicationName}{d.dosage && <small>{d.dosage} · {clock(minutesOf(d.time) ?? 0)}</small>}</span>
      {/* Every dose has its tick. A day ahead can't be taken yet, so its tick is shown but off;
          while the day's logs are still loading it waits too */}
      <Checkbox checked={dosesForDay && doses.isTaken(d)} disabled={!dosesForDay}
        title={day > today ? 'Doses can be marked taken on the day' : undefined}
        aria-label={dosesForDay && doses.isTaken(d) ? `Mark ${d.medicationName} not taken` : `Mark ${d.medicationName} taken`}
        onChange={() => { if (dosesForDay) void doses.setTaken(d, !doses.isTaken(d)); }} />
    </PopRow>
  );

  return (
    <>
    <Panel aria-label="Day at a glance">
      <Head>
        {/* "Your Agenda"; Meds, Move and the Planner button at the right (the week row shows the day) */}
        <TitleRow>
          <h2>Your Agenda</h2>
          <HeadActions>
            {medTotal > 0 && (
              <HeadStat type="button" $due={nextDue !== undefined} onClick={e => openFrom('meds', e)} aria-label={`Medications: ${medTaken} of ${medTotal} taken`}>
                <MaterialIcon $size={23} aria-hidden="true">health_and_safety</MaterialIcon>
                Meds {medTaken} of {medTotal}{nextDue !== undefined && <strong> · {shortClock(nextDue)} due</strong>}
              </HeadStat>
            )}
            {moveTotal > 0 && (
              <HeadStat type="button" onClick={() => navigate('/health/exercise/schedule')} aria-label={`Move: ${moveDone} of ${moveTotal} minutes`}>
                <MaterialIcon $size={17} aria-hidden="true">directions_run</MaterialIcon>
                Move {moveDone} min
              </HeadStat>
            )}
            <ExpandBtn type="button" aria-label="Open this day in the Planner" title="Open in the Planner"
              onClick={() => navigate('/goals/planner', { state: { plannerDay: day } })}>
              <Icon name="maximize" size={16} strokeWidth={1.8} />
            </ExpandBtn>
          </HeadActions>
        </TitleRow>
      </Head>

      <Week role="group" aria-label="Days">
        {/* The month of the days in view, at the left ("November", or "November – December") */}
        <WeekMonth>
          <span className="long">{[...new Set(inView.map(d => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'long' })))].join(' – ')}</span>
          <span className="short">{[...new Set(inView.map(d => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short' })))].join('–')}</span>
        </WeekMonth>
        <StripBtn type="button" aria-label="Earlier days" title="Earlier" onClick={() => stripBy(-7)}>
          <Icon name="chevron-left" size={16} strokeWidth={2} />
        </StripBtn>
        <DayStrip ref={stripRef} onScroll={onStripScroll}>
        {stripDays.map(d => {
          const marks = marksOf(d);
          const on = d === day;
          return (
            <WeekDay key={d} type="button" $on={on} $today={d === today} aria-pressed={on}
              aria-label={`${LONG_NAMES[dow(d)]} ${Number(d.slice(8))}${d === today ? ', today' : ''}${marks.length ? `, ${marks.length} planned` : ''}`}
              onClick={() => setPicked(d === today ? null : d)}>
              <div className="day"><small>{d === today ? <><span className="today-word">Today</span><span className="today-day">{WEEK_NAMES[dow(d)]}</span></> : WEEK_NAMES[dow(d)]}</small><span>{Number(d.slice(8))}</span></div>
            </WeekDay>
          );
        })}
        </DayStrip>
        <StripBtn type="button" aria-label="Later days" title="Later" onClick={() => stripBy(7)}>
          <Icon name="chevron-right" size={16} strokeWidth={2} />
        </StripBtn>
      </Week>

      <Body>
       <Main>
        {/* The schedule */}
        <section aria-label="Schedule">
          <SubHead>
            {/* The bills due that day: one icon beside the heading */}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <h3>Schedule</h3>
              {dayBills.length > 0 && (
                <Marker as="button" type="button" $due style={{ position: 'relative', left: 0, transform: 'none' }}
                  aria-label={`${dayBills.length} bill${dayBills.length === 1 ? '' : 's'} due`} title="Bills due"
                  onClick={e => openFrom('bill', e)}>
                  <MaterialIcon $size={16} aria-hidden="true">receipt_long</MaterialIcon>
                </Marker>
              )}
            </span>
            <AddBtn type="button" aria-label={`Add a task to ${isToday ? 'today' : `${WEEK_NAMES[dow(day)]} ${mm}/${dd}`}`} aria-expanded={adding}
              title="Add a task" onClick={openAdd}>
              <Icon name={adding ? 'x' : 'plus'} size={20} strokeWidth={2} />
            </AddBtn>
          </SubHead>
          {adding && (
            <AddForm onSubmit={e => { e.preventDefault(); void addPlanned(); }}
              onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); setAdding(false); } }}>
              <div className="box">
                <input type="text" autoFocus value={addTitle} maxLength={200} onChange={e => setAddTitle(e.target.value)}
                  placeholder="What needs doing?" aria-label="Task" />
                <input type="time" value={addTime} step={900} onChange={e => setAddTime(e.target.value)} aria-label="Time" />
              </div>
              <div className="acts">
                <PillButton type="submit" disabled={!addTitle.trim()}>Add</PillButton>
                <PillButton type="button" $variant="neutral" onClick={() => setAdding(false)}>Cancel</PillButton>
              </div>
            </AddForm>
          )}
          <Timeline>
            {allDay.length + dayHolidays.length > 0 && (
              <AllDayRow>
                {dayHolidays.map(h => (
                  <AllDayTile as="div" key={`h${h.name}`} data-holiday="">{h.name} · {h.federal ? 'Federal holiday' : 'Holiday'}</AllDayTile>
                ))}
                {allDay.map(ev => (
                  <AllDayTile key={`a${ev.id}`} type="button" onClick={() => openInJournal(ev.id)}>All day · {ev.title}</AllDayTile>
                ))}
              </AllDayRow>
            )}
            <EveningBtn type="button" aria-expanded={morningOpen} onClick={toggleMorning}
              style={{ margin: '0 0 22px', padding: '0 0 14px', borderTop: 'none', borderBottom: '1px solid var(--border-subtle)' }}>
              {morningOpen ? 'Hide before 7 AM' : `Show before 7 AM${morningCount + earlyDoses.length ? ` · ${morningCount + earlyDoses.length} ${morningCount + earlyDoses.length === 1 ? 'item' : 'items'}` : ''}`}
              <Icon name={morningOpen ? 'chevron-down' : 'chevron-up'} size={16} strokeWidth={1.8} aria-hidden="true" />
            </EveningBtn>
            <Hours ref={hoursRef} style={{ height: height + 14, paddingTop: 7 }}>
              {hours.map(h => {
                const top = yAt(h * 60) + 7;
                return (
                  <div key={h}>
                    <HourName style={{ top }}>{hourName(h)}</HourName>
                    <HourLine style={{ top }} />
                  </div>
                );
              })}
              {shownDoses.map((g, i) => {
                const pending = pendingOf(g).length > 0;
                // One close above it (under 28px apart) pushes this one to the right
                let shift = 0;
                for (let k = i - 1; k >= 0 && yAt(g.mins!) - yAt(shownDoses[k].mins!) < 28; k--) shift++;
                return (
                  <Marker key={g.time} type="button" $due={dosesForDay && pending} $ahead={!dosesForDay}
                    style={{ top: yAt(g.mins!) + 7, left: 'auto', right: 4 + (shift % 2) * 28 }}
                    aria-label={`Medications at ${clock(g.mins!)}${dosesForDay ? (pending ? ', due' : ', taken') : ''}`}
                    onClick={e => openFrom('dose', e, g.time)}>
                    <MaterialIcon $size={22} aria-hidden="true">health_and_safety</MaterialIcon>
                  </Marker>
                );
              })}
              {isToday && nowMins >= dayStart && nowMins <= dayEnd && <NowLine style={{ top: yAt(nowMins) + 6 }} aria-hidden="true" />}
              {carry?.at != null && (
                <DropLine style={{ top: yAt(carry.at) + 7 }} aria-hidden="true"><span>{clock(carry.at)}</span></DropLine>
              )}
              <Blocks style={{ top: 7 }}>
                {shownBlocks.map(b => {
                  // While dragged: where it would go (on its own time); else its slot
                  const moving = drag?.key === b.key;
                  const s0 = moving ? drag!.start : b.start;
                  const e0 = moving ? drag!.end : b.end;
                  // While dragged it keeps its own size and place in a stack (several cards sharing a time
                  // share that stretch) and follows the pointer: moved by how far its start moved on the
                  // schedule as drawn, stretched by how far its end moved — never redrawn across the whole span
                  const own = slot.get(b.key) ?? { top: yAt(b.start), height: yAt(b.end) - yAt(b.start) };
                  // Moved: it rides with the pointer (its words show the time it will land at), so it never
                  // sticks while crossing a stack of cards sharing one time
                  const place = !moving ? own
                    : drag!.mode === 'move' ? { top: own.top + drag!.dy, height: own.height }
                    : { top: own.top, height: Math.max(needOf(b.key), yAt(e0) - own.top) };
                  const cardTop = place.top + CARD_GAP / 2;
                  const task = b.kind === 'task' ? dayTasks.find(x => x.id === b.id) : undefined;
                  return (
                    <Fragment key={b.key}>
                    {task && (
                      // Its tick, to the left of the title: level with the title's first line
                      <CardTick type="button" style={{ top: cardTop + 5, zIndex: (layer.get(b.key) ?? 1) + 1 }} role="checkbox" aria-checked={!!b.done}
                        aria-label={b.done ? `Mark “${b.title}” not done` : `Mark “${b.title}” done`}
                        onClick={() => tick(task)}>
                        <TickMark checked={!!b.done} size={18} />
                      </CardTick>
                    )}
                    <BlockBtn type="button" $kind={b.kind} data-dragging={drag?.key === b.key} data-task={!!task} data-done={!!b.done}
                      style={{
                        // A little room above and below each card inside its time
                        top: cardTop, height: Math.max(30, place.height - CARD_GAP),
                        zIndex: moving ? 1000 : layer.get(b.key),
                        left: 0, width: '100%',
                      }}
                      onPointerDown={e => onCardDown(b, 'move', e)} onPointerMove={onCardMove} onPointerUp={onCardUp} onPointerCancel={onCardUp}
                      // The keyboard's Enter / Space (no pointer) opens it
                      onClick={e => { if (e.detail === 0) openInJournal(b.id); }}
                      title={`${b.title} · ${KIND_NAME[b.kind]} — drag to move, drag its foot to stretch`}>
                      {/* The card's words, measured so the schedule makes room for all of them */}
                      <span className="body" ref={el => { if (el) cardBodies.current.set(b.key, el); else cardBodies.current.delete(b.key); }}>
                        <span className="title">{b.title}</span>{moving ? <small>{`${clock(s0)} – ${clock(e0)}`}</small> : b.note && <small>{b.note}</small>}
                      </span>
                      <StretchGrip aria-hidden="true" onPointerDown={e => onCardDown(b, 'end', e)} />
                    </BlockBtn>
                    </Fragment>
                  );
                })}
              </Blocks>
            </Hours>
            {laterDoses.length > 0 && (
              <LaterNote>Later · {laterDoses.map(g => `dose at ${clock(g.mins!)}`).join(', ')}</LaterNote>
            )}
            <EveningBtn type="button" aria-expanded={eveningOpen} onClick={toggleEvening}>
              {eveningOpen ? 'Hide after 7 PM' : `Show after 7 PM${eveningCount ? ` · ${eveningCount} ${eveningCount === 1 ? 'item' : 'items'}` : ''}`}
              <Icon name={eveningOpen ? 'chevron-up' : 'chevron-down'} size={16} strokeWidth={1.8} aria-hidden="true" />
            </EveningBtn>
          </Timeline>
        </section>

        <Col>
          {priorities}
          <section aria-label={`Tasks due ${dayWord}`}>
            <SubHead><h3>Tasks due {dayWord}</h3>{due.length > 0 && <span>{due.filter(t => !!t.fields.isCompleted).length} of {due.length}</span>}</SubHead>
            {due.length === 0 && <Muted>Nothing due {dayWord}.</Muted>}
            {due.map(t => {
              const done = !!t.fields.isCompleted;
              const where = (t.milestoneId && milestoneName.get(t.milestoneId)) || (t.goalId && goalName.get(t.goalId)) || t.category || '';
              return (
                <ItemRow key={t.id}>
                  <Checkbox checked={done} aria-label={done ? `Mark "${t.title}" not done` : `Mark "${t.title}" done`} onChange={() => tick(t)} />
                  <ItemText type="button" $done={done} onClick={() => openInJournal(t.id)}>
                    {t.title}
                    <small>{isToday ? 'Due today' : `Due ${WEEK_NAMES[dow(day)]} ${dd}`}{where ? ` · ${where}` : ''}</small>
                  </ItemText>
                  {!done && <DragGrip {...carryProps(t)}><Icon name="grip" size={16} strokeWidth={2.6} /></DragGrip>}
                </ItemRow>
              );
            })}
          </section>
          {wins}
        </Col>
       </Main>

        <Col>
          {comingUp}
          {shopping}
          {noDay > 0 && (
            <NoDay>
              {noDay} {noDay === 1 ? 'task' : 'tasks'} with no day yet
              <p>Drag one onto the schedule to plan it.</p>
              <ul>
                {noDayTasks.slice(0, NO_DAY_SHOWN).map(t => (
                  <li key={t.id}>
                    <DragGrip {...carryProps(t)}><Icon name="grip" size={16} strokeWidth={2.6} /></DragGrip>
                    <button type="button" className="name" onClick={() => openInJournal(t.id)}>{t.title}</button>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => navigate('/goals/planner')}>
                {noDay > NO_DAY_SHOWN ? `${noDay - NO_DAY_SHOWN} more · Place them on the week` : 'Place them on the week'}
              </button>
            </NoDay>
          )}
          {side}
        </Col>
      </Body>

      {carry && createPortal(
        <Ghost style={{ left: carry.x + 14, top: carry.y + 10 }} aria-hidden="true">{carry.title}</Ghost>,
        document.body,
      )}
      {open?.kind === 'bill' && (
        <MarkerList anchor={open.rect} title={`Bills due ${dayWord}`} onClose={() => setOpen(null)}>
          {dayBills.map(b => (
            <PopRow key={b.id}><span>{b.name}<small>{formatCents(b.amountCents)}</small></span></PopRow>
          ))}
          <PopLink type="button" onClick={() => navigate('/finance')}>Open Budget &amp; bills</PopLink>
        </MarkerList>
      )}
      {open?.kind === 'dose' && (
        <MarkerList anchor={open.rect} title={`Medications · ${clock(minutesOf(open.key) ?? 0)}`} onClose={() => setOpen(null)}>
          {(doses.groups.find(g => g.time === open.key)?.doses ?? []).map(doseRow)}
          <PopLink type="button" onClick={() => navigate('/health/meds')}>Med list</PopLink>
        </MarkerList>
      )}
      {open?.kind === 'meds' && (
        <MarkerList anchor={open.rect} title={`Medications ${dayWord}`} onClose={() => setOpen(null)}>
          {doses.groups.flatMap(g => g.doses).map(doseRow)}
          <PopLink type="button" onClick={() => navigate('/health/meds')}>Med list</PopLink>
        </MarkerList>
      )}
    </Panel>
    {widgets && <Widgets>{widgets}</Widgets>}
    </>
  );
}
