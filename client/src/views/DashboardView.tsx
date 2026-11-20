import { QuickSymptomForm } from '../components/organisms/HealthQuickLog.js';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, closestCorners, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent, type UniqueIdentifier,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import styled, { css } from 'styled-components';
import { glassCard, glassPill, onPhoto } from '../styles/wallpaper.js';
import { DayGlance } from '../components/organisms/DayGlance.js';
import { cardLabel } from '../styles/cardLabel.js';
import { useLocation, useNavigate } from 'react-router-dom';
import { ContentTemplate } from '../components/templates/ContentTemplate.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { MaterialIcon } from '../components/atoms/MaterialIcon.js';
import { Icon } from '../components/atoms/core/Icon.jsx';
import { Checkbox } from '../components/atoms/core/Checkbox.jsx';
import { Toggle } from '../components/atoms/Toggle.js';
import { PillButton } from '../components/atoms/PillButton.js';
import { WellnessCheckIn } from '../components/organisms/WellnessCheckIn.js';
import { FocusSounds } from '../components/organisms/FocusSounds.js';
import { QuickEntry } from '../components/organisms/QuickEntry.js';
import { VoiceCommand, useVoiceSession } from '../components/organisms/VoiceCommand.js';
import { OnboardingTour } from '../components/organisms/OnboardingTour.js';
import { passkeysAvailable } from '../services/passkeys.js';
import { GettingStarted } from '../components/organisms/GettingStarted.js';
import { firstRun, gettingStarted, showChecklist, toggleTicked, type OnboardingState, type ChecklistKey } from '../utils/onboarding.js';
import { usePrivateSettings, type PrivateSettingKey } from '../services/privateSettings.js';
import { useInitializeData } from '../hooks/useInitializeData.js';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import { NAV_COMPACT, NAV_COMPACT_QUERY } from '../styles/breakpoints.js';
import { TopBarAction } from '../components/organisms/TopBarAction.js';
import { goalCategoryOf } from '../utils/goalCategories.js';
import { HabitsToday } from '../components/organisms/HabitsToday.js';
import { plannerFacts, tasksByDay, parsePlannerOrder, type PlannerOrder } from '../utils/planner.js';
import { useEncryptedSetting } from '../hooks/useEncryptedSetting.js';
import { useFinance } from '../hooks/useFinance.js';
import { useOpenInJournal } from '../hooks/useOpenInJournal.js';
import { NotificationBell, BellDot } from '../components/organisms/NotificationBell.js';
import { ErrorBoundary } from '../components/atoms/ErrorBoundary.js';
import { useSaveFields } from '../hooks/useSaveFields.js';
import { useTodayDoses, DOSES_CHANGED } from '../hooks/useTodayDoses.js';
import { QuickLog } from '../components/organisms/HealthQuickLog.js';
import { occurrencesBetween, repeatRuleOf } from '../utils/recurrence.js';
import { useEncryption } from '../contexts/EncryptionContext.js';
import { useAuth } from '../contexts/AuthContext.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { Shortcuts } from '../components/organisms/Shortcuts.js';
import { useUIStore } from '../stores/uiStore.js';
import { entries as entriesApi, topics as topicsApi, settings as settingsApi, doses as dosesApi } from '../services/api.js';
import { dashboardStats, type StatsPeriod, type StatsDose } from '../utils/dashboardStats.js';
import { FilterTabs } from '../components/molecules/FilterTabs.js';
import { useTimeStore } from '../stores/timeStore.js';
import { deleteEntryWithImages } from '../utils/entryActions.js';
import { useNow } from '../hooks/useTimeTracking.js';
import {
  TIME_TRACKING_TOPIC, formatClock, formatSpent, isTimeTrackingTopic, runningSession, sessionMs, startTimer, stopTimer,
  timeByEntry, timePeriodStart, type TimePeriod,
} from '../utils/timeTracking.js';
import { stripHtml, builtinEntryName } from '../utils/stripHtml.js';
import { entryTitleText } from '../utils/entryTitle.js';
import { toDateStr } from '../utils/dateUtils.js';
import { addDays, billOccurrences, formatCents } from '../utils/finance.js';
import { MENU_SLOTS, defaultShoppingListTitle, latestOpenList, menuDays } from '../utils/kitchen.js';
import { getOrCreateTopic } from '../utils/getOrCreateJournalTopic.js';
import { prioritiesTitle } from '../utils/entrySave.js';
import { winsContent, winsOf, winsTitle, type WinItem } from '../utils/wins.js';
import type { ThemePreference } from '../utils/autoTheme.js';
import { greeting, parseQuoteText, type Quote } from '../utils/dailyQuote.js';
import { useDailyQuote } from '../hooks/useDailyQuote.js';
import { currentWeather, describeWeather, findPlace, hoursFromLocal, type CurrentWeather, type Place } from '../utils/weather.js';
import type { DecryptedPost } from '@shared/crypto/types';
import type { ShoppingItem } from '../types/fields.js';
import type { PriorityItem } from '../components/molecules/fields/PrioritiesFields.js';
import { AutoTextarea } from '../components/molecules/fields/AutoTextarea.js';
import { parseSavedViews, searchAndSort, type SavedPlanView, type PlanRow } from '../utils/planningView.js';
import { taskTypeOf, taskTypeRank, taskTypeList } from '../utils/taskTypes.js';
import {
  isTodoList, checklistOf, checklistProgress, addChecklistItem, newTodoListFields, filterOfView, taskPassesFilter,
  type ChecklistItem,
} from '../utils/taskLists.js';
import { PLAN_TAB_PATHS } from '../utils/planningView.js';
import { MANTRA_TOPIC, MANTRA_ICON, isMantraTopic, dailyMantraIndex, stepIndex } from '../utils/mantras.js';
import { topicEntries } from '../utils/topicIndex.js';

/* The home dashboard (/dashboard — not the default page; the journal is home):
   the date and home weather over the greeting and a Light | Dark switch; the
   daily quote (or, with the quote off, a "Next up" card of the next medication
   doses) beside the wellness check-in; a one-line world-clocks strip ("All N
   cities" opens the grid); then two columns — Today's priorities and Coming
   up | On the menu, Medications and the shopping list. "Customize view" picks
   the sections and the cities (kept in the encrypted `dashboardConfig`
   setting). */

/* ── Config ── */

type SectionKey = 'glance' | 'quickEntry' | 'nextUp' | 'wellness' | 'clocks' | 'quote' | 'priorities' | 'wins' | 'comingUp' | 'exercise' | 'recent' | 'symptom' | 'menu' | 'meds' | 'shopping' | 'quickLog' | 'tasks' | 'mantra' | 'stats' | 'time' | 'habits' | 'focus' | 'shortcuts';

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'shortcuts', label: 'Shortcuts' },
  { key: 'wellness', label: 'Wellness check-in' },
  { key: 'clocks', label: 'World clocks & weather' },
  { key: 'quote', label: 'Quote of the day' },
  { key: 'habits', label: 'Habits' },
  { key: 'quickLog', label: 'Quick meal log' },
  { key: 'symptom', label: 'Log a symptom' },
  { key: 'menu', label: 'On the menu' },
  { key: 'recent', label: 'Recent entries' },
  { key: 'stats', label: 'Stats' },
  { key: 'time', label: 'Time tracked' },
  { key: 'focus', label: 'Focus sounds' },
];

/** Cards that start switched off (shown only once switched on in Theme and layout) */
const OFF_BY_DEFAULT: SectionKey[] = ['focus'];

interface DashboardConfig {
  hidden: SectionKey[];
  /** Cards from OFF_BY_DEFAULT the person switched on */
  turnedOn?: SectionKey[];
  /** The first is home: its weather is in the greeting and it's marked Local */
  places: Place[];
  /** The full world-clock grid is open under the one-line strip */
  clocksExpanded?: boolean;
  /** Cards folded down to their title row */
  collapsed?: SectionKey[];
  /** Phones: every card starts folded — these are the ones opened there */
  openOnPhone?: SectionKey[];
  /** The two columns' cards, top to bottom, as dragged into place */
  layout?: Layout;
  /** What the Tasks card shows: 'open', 'view:<saved view id>' or 'list:<entry id>' */
  tasksShow?: string;
  /** The Shopping list card's list: 'latest' (newest open list) or an entry id */
  shoppingShow?: string;
  /** The Shortcuts card's chips: the pages' paths, in order */
  shortcuts?: string[];
  /** Coming up leaves bills out (events and meetings only) */
  comingUpHideBills?: boolean;
  /** Day at a glance was set up: the Priorities and Coming up cards (now inside it) were switched off once */
  glanceSetup?: boolean;
  /** …and the Wins card, once Wins moved inside it too */
  glanceWinsSetup?: boolean;
  /** …and the Shopping list card, once it moved inside it too */
  glanceShoppingSetup?: boolean;
}

/** The columns cards are dragged between */
const COLS = ['head', 'top', 'left', 'right', 'side'] as const;
type ColId = typeof COLS[number];
/** `head`: full width above the world clocks (empty until a card is dragged there);
    `top`: across both columns under the schedule and priorities; `left` / `right`: the two columns;
    `side`: Your Agenda's third column, under Coming up and the shopping list */
type Layout = { head?: SectionKey[]; top?: SectionKey[]; left: SectionKey[]; right: SectionKey[]; side?: SectionKey[] };

/** The cards that can be dragged (in Your Agenda), and where they start */
const DEFAULT_LAYOUT: Required<Layout> = {
  head: ['clocks'],
  top: ['shortcuts', 'wellness', 'quote', 'menu', 'focus'],
  left: ['priorities', 'tasks', 'nextUp', 'wins', 'habits', 'comingUp', 'quickLog', 'exercise', 'symptom'],
  right: ['recent', 'shopping', 'mantra', 'time', 'meds'],
  side: [],
};

/** The saved layout with any card it doesn't know put back in its default place. One saved before
    the top row (no `top`) leaves the wellness check-in, the quote and On the menu to their default
    place at the top */
function fullLayout(saved?: Layout): Required<Layout> {
  const base: Layout = !saved ? DEFAULT_LAYOUT : saved.top ? saved
    : { left: saved.left.filter(k => !DEFAULT_LAYOUT.top.includes(k)), right: saved.right.filter(k => !DEFAULT_LAYOUT.top.includes(k)) };
  const all = COLS.flatMap(c => DEFAULT_LAYOUT[c]);
  const seen = new Set<SectionKey>();
  const out = {} as Required<Layout>;
  for (const c of COLS) {
    // The clocks strip never sits in one of the two narrow columns (older layouts had it there): back to its place
    out[c] = (base[c] ?? []).filter(k => all.includes(k) && !seen.has(k) && !(k === 'clocks' && (c === 'left' || c === 'right')));
    out[c].forEach(k => seen.add(k));
  }
  for (const c of COLS) DEFAULT_LAYOUT[c].forEach((k, i) => {
    if (!seen.has(k)) { out[c].splice(Math.min(i, out[c].length), 0, k); seen.add(k); }
  });
  return out;
}

const DEFAULT_CONFIG: DashboardConfig = { hidden: [], places: [] };

/** How far past the Quick entry's top the photo stays solid (its question and the top of its card) */
const PHOTO_PAST_TOP = 120;

/* ── Layout ── */

const Page = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  /* Never a sideways scroll */
  overflow-x: hidden;
`;

const Inner = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  /* A little wider than the other pages' 1150px column */
  max-width: 1300px;
  margin: 0 auto;
  padding: 40px 32px 104px;
  @media (max-width: 768px) { padding: 28px 20px 72px; }
  /* Phones / tablets: the greeting close under the top bar (the page already leaves room) */
  ${NAV_COMPACT} { padding-top: 28px; }
`;

/* Voice and the sliders at the top right, the date line and greeting under them */
const Head = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 16px 40px;
  /* The greeting row sits a little lower under the top of the photo (phones keep theirs) */
  margin-top: 25px;
  @media (max-width: 640px) { margin-top: 0; }
  ${NAV_COMPACT} { margin-top: 0; }
`;

/* "Good evening, Olivia." (the date and weather are in Your Agenda now),
   a little below the buttons at the top (on phones and tablets they're in the top bar) */
const DateBlock = styled.div<{ $below: boolean }>`
  min-width: 0;
  /* Wide screens: level with Voice and the sliders (the buttons centre on its first line) */
  margin-top: ${({ $below }) => ($below ? '0' : '12px')};
`;

const Hello = styled.h1`
  margin: 0;
  font-family: var(--font-display);
  font-size: 58px;
  font-weight: 200; /* the view titles' weight */
  line-height: 1.25;
  color: var(--text-primary);
  text-wrap: balance;
  /* Tablets (the compact nav's range): a step smaller than the desktop's 58px */
  ${NAV_COMPACT} { font-size: 42px; }
  @media (max-width: 640px) { font-size: 41px; }
  @media (max-width: 400px) { font-size: 37px; }
  ${onPhoto}
`;

/* Light | Dark (an outlined pair, the chosen one on the grey --bg-active) beside
   a neutral "Customize view" pill */
const HeadActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  /* Centred on the greeting's first line (56px × 1.1 tall, the buttons 44px) */
  margin-top: 9px;
`;

/* Phones and tablets: the mic and the sliders in the top bar, plain like the bell */
const BarBtn = styled.button<{ $on: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: ${({ $on }) => ($on ? 'var(--color-accent-link)' : 'var(--text-secondary)')};
  cursor: pointer;
  &:hover { color: ${({ $on }) => ($on ? 'var(--color-accent-link)' : 'var(--text-primary)')}; }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

/* Voice: a quiet button — the mic and the word, no outline, never a darker fill
   (open: the accent; hover: brighter text) */
const VoiceBtn = styled.button<{ $on: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 44px;
  padding: 0 22px 0 18px;
  border: 1px solid var(--border-card);
  border-radius: 999px;
  background: transparent;
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: 500;
  color: ${({ $on }) => ($on ? 'var(--color-accent-link)' : 'var(--text-secondary)')};
  cursor: pointer;
  &:hover { color: ${({ $on }) => ($on ? 'var(--color-accent-link)' : 'var(--text-primary)')}; border-color: var(--control-border); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  /* On a wallpaper: a glass pill with white text (the accent while open) */
  ${glassPill}
  html[data-wallpaper] &[aria-expanded="true"], html[data-wallpaper] &[aria-pressed="true"] { border-color: #fff; }
`;

/* View options: a round sliders button — no darker fill when open or hovered
   (open: the accent; hover: brighter) */
const ViewBtn = styled.button<{ $on: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 1px solid var(--border-card);
  border-radius: 50%;
  background: transparent;
  color: ${({ $on }) => ($on ? 'var(--color-accent-link)' : 'var(--text-secondary)')};
  cursor: pointer;
  &:hover { color: ${({ $on }) => ($on ? 'var(--color-accent-link)' : 'var(--text-primary)')}; border-color: var(--control-border); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  ${glassPill}
  html[data-wallpaper] &[aria-expanded="true"], html[data-wallpaper] &[aria-pressed="true"] { border-color: #fff; }
`;

/* The theme switch at the top of the Theme and layout panel, at most 380px wide */
const ThemeRow = styled.div`
  max-width: 380px;
  margin-bottom: 28px;
`;

/* Light | Dark | Auto: one rounded pill, an icon before each, the chosen one on
   a grey pill in the body colour (no accent) */
const ThemeSwitch = styled.div`
  display: flex;
  gap: 2px;
  height: 38px;
  padding: 3px;
  border: 1px solid var(--border-card);
  border-radius: 999px;
  background: var(--bg-control, transparent);
`;

const ThemeOpt = styled.button<{ $on: boolean }>`
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 30px;
  padding: 0 14px;
  border: none;
  border-radius: 999px;
  background: ${({ $on }) => ($on ? 'var(--bg-active)' : 'transparent')};
  font-family: var(--font-sans);
  font-size: 14px;
  font-weight: ${({ $on }) => ($on ? 500 : 400)};
  color: ${({ $on }) => ($on ? 'var(--text-primary)' : 'var(--text-soft)')};
  cursor: pointer;
  &:hover { color: var(--text-primary); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

const THEME_ICON = { light: 'light_mode', dark: 'dark_mode', auto: 'contrast' } as const;

const OutlineBtn = styled.button`
  height: 38px;
  padding: 0 16px;
  border: 1px solid var(--border-card);
  border-radius: 10px;
  background: transparent;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-secondary);
  cursor: pointer;
  &:hover { border-color: var(--control-border); }
`;

/* Next up | Wellness check-in */
/* Quick entry: the journal's editor in a card, straight under the greeting */
const QuickWrap = styled.div<{ $guided?: boolean }>`
  /* A little room under the greeting */
  margin-top: 28px;
  /* Room under it before Stats / the cards (their own 24–28px add to this) */
  margin-bottom: 8px;
  @media (max-width: 640px) { margin-top: 22px; margin-bottom: 4px; }
  /* Phones / tablets: a little closer under the greeting */
  ${NAV_COMPACT} { margin-top: 16px; }
  /* Getting started → Write your first entry: ringed in the accent */
  ${({ $guided }) => ($guided ? css`
    & > section { border-radius: 14px; outline: 2px solid var(--color-accent); outline-offset: 12px; }
  ` : '')}
`;

/* The guide over the Quick entry: three numbered steps, then "saved" */
const EntryGuide = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 14px;
  padding: 16px 18px;
  border: 1px solid var(--color-accent-line);
  border-radius: 12px;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-primary);
  ol { margin: 0; padding-left: 20px; flex: 1; }
  li { margin: 2px 0; }
  li b { font-weight: 600; }
  p { margin: 0; flex: 1; }
  button { flex: none; padding: 0; border: none; background: none; font-family: var(--font-sans); font-size: 14px; font-weight: 500; color: var(--color-accent-link); cursor: pointer; }
  button:hover { text-decoration: underline; }
`;

/* Next up and the daily quote: their words inside a widget card (the card is the panel) */
const NextCard = styled.section`
  display: flex;
  flex-direction: column;
  min-width: 0;
  font-family: var(--font-sans);
  /* Its card title ("Next up · tomorrow") a little smaller than the other widgets' 22px
     (the extra & out-ranks the card's own title rule) */
  &&& > :first-child h2 { font-size: 19px; }
  /* …and less room between it and the divider under it (the other cards have 22px) */
  &&& > :first-child { padding-bottom: 12px; }
`;

const NextTitle = styled.h2`
  margin: 6px 0 0; /* room above the appointment's name */
  font-family: var(--font-display);
  font-size: 30px;
  font-weight: 300;
  line-height: 1.2;
  color: var(--text-primary);
`;

const NextList = styled.p`
  margin: 9px 0 0; /* close under the title */
  font-size: 15px;
  font-style: italic;
  line-height: 1.5;
  color: var(--text-soft);
`;

const NextActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: auto;
  padding-top: 40px; /* room above the buttons */
  padding-bottom: 12px; /* and a little under them */
`;

/* The daily quote and the world clocks on one line straight on the page, no
   card: the quote on the left ("~ Author" muted after it), then the cities —
   home first, its name in the accent — as many as fit, and "All N cities",
   which opens the grid of city tiles (four across, wrapping) under the line.
   Phones: the line moves to the foot of the page, the quote over the clocks. */
const MAX_PLACES = 8;

/* Both on: the quote takes two thirds, the clocks the last third (right-aligned);
   either alone takes the whole line */
/* The daily quote's card: the quote in thin italic Work Sans, "~ Author" muted under it */
const QuoteText = styled.blockquote`
  margin: 0;
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 300;
  font-style: italic;
  line-height: 1.5;
  /* A step back from full brightness */
  color: color-mix(in srgb, var(--text-primary) 72%, transparent);
  @media (max-width: 480px) { font-size: 18px; }
`;

const QuoteBy = styled.p`
  margin: 10px 0 0;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-muted);
`;

/* The world clocks' card: a row per city — the name (home in the accent) with
   Local / +3h under it, the weather, the time on the right */
const ClockRow = styled.div<{ $home: boolean }>`
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 56px;
  font-family: var(--font-sans);
  & + & { border-top: 1px solid var(--border-subtle); }
  .city { flex: 1; min-width: 0; font-size: 16px; color: ${({ $home }) => ($home ? 'var(--color-accent-link)' : 'var(--text-secondary)')}; }
  .city small { display: block; margin-top: 2px; font-size: 13px; color: var(--text-muted); }
  .weather { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; color: var(--text-muted); white-space: nowrap; }
  .weather > span:first-child { color: var(--color-accent); }
  .time { flex: none; min-width: 84px; text-align: right; font-size: 16px; font-weight: 500; color: var(--text-primary); font-variant-numeric: tabular-nums; }
  @media (max-width: 480px) { .weather .label { display: none; } }
`;

/** How many cities the clocks card lists before "All N cities" */
const CLOCKS_SHOWN = 3;

/* World clocks as a full-width strip under the Quick entry. Folded: one line,
   every part the same size — each city (home in the accent), Local / +3h, the
   time and the temperature, rules between — with a toggle at the end.
   Open: a card for each clock */
const ClockStrip = styled.section`
  /* (Its room above and below comes from the head row it sits in) */
  margin: 0;
  /* In a container: the panel colour with a light shadow */
  padding: 18px 26px;
  border-radius: 16px;
  background: var(--bg-panel);
  box-shadow: var(--shadow-card);
  @media (max-width: 560px) { padding: 16px 18px; }
  font-family: var(--font-sans);
  font-size: 15px;
  /* (room at the right for the card's drag grip) */
  .bar { display: flex; align-items: center; gap: 16px; min-width: 0; padding-right: 34px; }
  .line { flex: 1; min-width: 0; display: flex; align-items: center; overflow: hidden; white-space: nowrap; }
  .line > span { flex: none; display: inline-flex; align-items: center; gap: 8px; padding: 2px 18px; box-shadow: -1px 0 0 var(--border-card); }
  .line > span:first-child { padding-left: 0; box-shadow: none; }
  .city { color: var(--text-secondary); }
  /* The home city in grey */
  .home .city { color: var(--text-muted); }
  .muted { color: var(--text-muted); }
  .time { color: var(--text-primary); font-variant-numeric: tabular-nums; }
  .toggle { flex: none; display: inline-flex; align-items: center; gap: 4px; padding: 0; border: none; background: none; font: inherit; font-size: 14px; color: var(--text-muted); cursor: pointer; white-space: nowrap; }
  .toggle:hover { color: var(--color-accent-link); }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; margin-top: 16px; }
  .card { min-width: 0; padding: 18px 20px; border-radius: 10px; background: var(--bg-tile); }
  .card .city { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .card .muted { display: block; margin-top: 2px; font-size: 13px; }
  .card .big { display: block; margin-top: 10px; font-family: var(--font-display); font-size: 28px; font-weight: 300; line-height: 1.1; color: var(--text-primary); font-variant-numeric: tabular-nums; }
  .card .weather { display: inline-flex; align-items: center; gap: 6px; margin-top: 8px; font-size: 13px; color: var(--text-muted); }
  .card .weather > span:first-child { color: var(--color-accent); }
`;

/* The full-width wellness check-in, between the add row and Day at a glance */

/* Three columns over shared rows (each column a subgrid spanning them, --rows),
   so the cards side by side in a row are the same height */
/* Stats at the foot of Your Agenda's widgets: the widgets' gap above it, not its own margin */
const StatsSpan = styled.div`
  & > section { margin-top: 0; }
`;

/* The zone above the clocks: no room of its own until a card is in it */
const HeadZone = styled.div<{ $filled: boolean }>`
  margin: ${({ $filled }) => ($filled ? '14px 0' : '0')};
`;

const Columns = styled.div<{ $rows: number }>`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: repeat(${({ $rows }) => $rows}, auto);
  gap: 36px 44px;
  && > * {
    grid-row: 1 / span ${({ $rows }) => $rows};
    display: grid;
    grid-template-rows: subgrid;
    align-content: start;
  }
  align-items: start;
  /* One column: each column's cards stack, no shared rows */
  @media (max-width: 760px) {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: none;
    && > * { grid-row: auto; display: flex; grid-template-rows: none; }
  }
`;

const Col = styled.div`
  display: flex;
  flex-direction: column;
  gap: 36px;
  min-width: 0;
`;

/* The dashboard's card: lifted a step off the page (--bg-panel) with a
   hairline outline. Its title row (the card label, its link on the right)
   leaves room at its end for the grip and the fold chevron; the content runs
   the card's full width */
const cardShell = css`
  /* No outline: a soft shadow sets each card off the page */
  border: 1px solid transparent;
  box-shadow: var(--shadow-card); /* even, all the way round the card */
  border-radius: 16px;
  background: var(--bg-panel);
  ${glassCard}
`;

/* The widget cards have no background — no fill or shadow — just a light
   outline all the way round */
const WidgetCard = styled.div<{ $collapsed: boolean; $plain?: boolean; $open?: boolean; $wide?: boolean }>`
  position: relative;
  min-width: 0;
  padding: 34px 32px 30px;
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  /* The panel colour with a light shadow */
  background: var(--bg-panel);
  box-shadow: var(--shadow-card);
  @media (max-width: 480px) { padding: 24px 22px 22px; }
  /* The cards across both columns (quote, On the menu): the panel and light shadow, no outline */
  ${({ $wide }) => ($wide ? 'border-color: transparent;' : '')}
  /* The title row is the chevron's 30px tall, its link centred, so the link and chevron line up */
  & > section > :first-child { align-items: center; padding-right: 64px; }
  @media (max-width: 480px) { & > section > :first-child { padding-right: 58px; } }
  && > section > :first-child { margin-bottom: 6px; }
  /* Titles: the dashboards' card label (small tracked grey capitals), on the chevron's 30px line */
  & > section > :first-child h2 {
    margin: 0;
    line-height: 30px;
    ${cardLabel}
  }
  /* $open (every card but the daily quote and the wellness check-in): its panel as usual,
     with a thin sentence-case Work Sans title over the hairline (not the small capitals) */
  ${({ $open }) => ($open ? `
    /* Room above and below the title's hairline */
    && > section > :first-child { margin-bottom: 24px; padding-bottom: 22px; }
    /* In a narrow column the title stays on one line and its links and controls
       (View journal, All 7 cities, Meal | Exercise…) drop under it, left-aligned */
    && > section > :first-child { flex-wrap: wrap; row-gap: 6px; }
    && > section > :first-child > h2,
    && > section > :first-child > label {
      flex: 0 1 auto;
      min-width: 0;
      max-width: 100%;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    && > section > :first-child h2,
    && > section > :first-child label > span {
      font-family: var(--font-display);
      font-size: 22px;
      font-weight: 300;
      letter-spacing: 0;
      text-transform: none;
      line-height: 40px;
      /* A step back from full strength, so the cards' content leads */
      color: color-mix(in srgb, var(--text-primary) 68%, transparent);
    }
    /* A little less room above the title than the card's usual padding */
    padding-top: 20px;
    @media (max-width: 480px) { padding-top: 14px; }
    /* Grip and chevron centred on the title's 40px line */
    & > button { top: 25px; }
    @media (max-width: 480px) { & > button { top: 19px; } }
  ` : '')}
  /* $plain (Wellness check-in): no panel, title or fold — its four-square box as it is,
     with only the grip, tucked into the box's top-right corner */
  ${({ $plain }) => ($plain ? `
    padding: 0 !important;
    border: none !important;
    box-shadow: none !important;
    background: none !important;
    -webkit-backdrop-filter: none !important;
    backdrop-filter: none !important;
    &&& > section > :first-child { padding-right: 0; margin-bottom: 0; }
    /* The box fills the card, so the grip (in the card's corner) sits inside the box */
    && > section, && > section > * { width: 100%; min-width: 0; box-sizing: border-box; }
    & > button { top: 12px; right: 12px; z-index: 1; }
    @media (max-width: 480px) { & > button { top: 8px; right: 8px; } }
  ` : '')}
  ${({ $collapsed }) => ($collapsed ? `
    /* Only its title row tall, not stretched to the row's height — but still the full
       width (in a flex column, align-self: start would shrink it to its title) */
    align-self: start;
    width: 100%;
    box-sizing: border-box;
    padding-top: 16px;
    padding-bottom: 16px;
    /* Folded: no fill or outline — just its title row, edge to edge across the
       column (the label at the left edge, the grip and chevron at the right) */
    padding-left: 0;
    padding-right: 0;
    border-color: transparent !important;
    /* …with a hairline under the title row, edge to edge */
    border-bottom-color: var(--border-subtle) !important;
    border-radius: 0;
    box-shadow: none !important;
    background: none !important;
    -webkit-backdrop-filter: none !important;
    backdrop-filter: none !important;
    & > button[aria-expanded] { right: -6px; }
    & > button[aria-label^="Move"] { right: 28px; }
    & > section > :not(:first-child) { display: none; }
    /* Folded: the title fades back, so the open cards lead */
    && > section > :first-child h2,
    && > section > :first-child label > span { color: var(--text-muted); opacity: 0.75; }
    && > section > :first-child { padding-bottom: 0; margin-bottom: 0; border-bottom: none; }
    /* Controls that only make sense open (the Quick log's Meal | Exercise) go too */
    & [data-fold-hide] { display: none; }
    /* Grip and chevron centred on the folded card's one row */
    & > button { top: 50% !important; transform: translateY(-50%); }
  ` : '')}
`;

/* The grip to drag a card by, just left of its fold chevron */
/* The wellness check-in's holder: nothing of its own (no padding, fill or outline) — the box is
   the card — with the grip inside the box's top-right corner */
const PlainCard = styled.div`
  position: relative;
  min-width: 0;
  & > section { width: 100%; }
  && > button[aria-label^="Move"] { top: 14px; right: 14px; z-index: 1; }
`;

const DragHandle = styled.button`
  position: absolute;
  top: 34px;
  right: 56px;
  display: grid;
  place-items: center;
  width: 26px;
  height: 30px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--text-faint);
  cursor: grab;
  touch-action: none;
  html[data-theme='dark'] & { color: var(--text-disabled); }
  &:hover { color: var(--text-primary); }
  &:active { cursor: grabbing; }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  @media (max-width: 480px) { top: 24px; right: 46px; }
`;

const FoldBtn = styled.button<{ $collapsed: boolean }>`
  position: absolute;
  top: 34px;
  right: 22px;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  svg { transition: transform 150ms ease; transform: rotate(${({ $collapsed }) => ($collapsed ? 0 : 180)}deg); }
  &:hover { color: var(--text-primary); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  @media (max-width: 480px) { top: 24px; right: 14px; }
`;

const SectionHead = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-subtle);
  h2 { margin: 0; ${cardLabel} }
  span { font-family: var(--font-sans); font-size: 13px; color: var(--text-muted); }
  /* The title row's links: quiet grey at a normal weight, the accent on hover */
  button { padding: 0; border: none; background: none; font-family: var(--font-sans); font-size: 14px; font-weight: 400; color: var(--text-muted); cursor: pointer; white-space: nowrap; transition: color 120ms; }
  button:hover { color: var(--color-accent-link); }
  button:disabled { opacity: 0.6; cursor: default; }
`;

/* Two links side by side in a SectionHead (Today's wins: New list · All wins) */
const HeadLinks = styled.div`
  display: flex;
  gap: 18px;
`;

/* Hairlines between rows only — none under the last one */
const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 52px;
  & + & { border-top: 1px solid var(--border-subtle); }
  font-family: var(--font-sans);
  font-size: 16px;
  color: var(--text-secondary);
`;

const Muted = styled.p`
  margin: 14px 0 0;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
`;

/* ── Customize panel ── */

const CustomizeHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  /* A rule under the head, then room before the switches */
  padding-bottom: 14px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--border-subtle);
  h3 { margin: 0 !important; }
`;

const Customize = styled.div`
  margin-top: 24px;
  padding: 20px 22px 22px;
  background: var(--bg-panel);
  border-radius: 12px;
  font-family: var(--font-sans);
  h3 { margin: 0 0 12px; font-size: 14px; font-weight: 500; color: var(--text-soft); }
`;

const ToggleGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 32px;
  /* A stacked pair (Coming up over its Bills option) is taller: its row-mate stays at the top */
  align-items: start;
  margin-bottom: 24px;
  label { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 14px; color: var(--text-secondary); }
  @media (max-width: 640px) { grid-template-columns: minmax(0, 1fr); }
`;

const PlaceRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 40px;
  font-size: 14px;
  color: var(--text-secondary);
  & + & { border-top: 1px solid var(--border-subtle); }
  small { margin-left: 8px; color: var(--text-muted); }
  button { display: inline-flex; padding: 4px; border: none; background: none; color: var(--text-muted); cursor: pointer; }
  button:hover { color: var(--color-danger); }
`;

const AddPlace = styled.form`
  display: flex;
  gap: 8px;
  margin-top: 12px;
  input {
    flex: 1;
    min-width: 0;
    height: 38px;
    padding: 0 14px;
    border: 1px solid var(--border-card) !important;
    border-radius: 10px;
    background: transparent !important;
    outline: none;
    font-family: var(--font-sans);
    font-size: 14px;
    color: var(--text-secondary);
  }
  input:focus { border-color: var(--color-accent) !important; }
`;

/* ── Helpers ── */

const NO_TASK_TYPES: string[] = [];
const NO_PLANNER_ORDER: PlannerOrder = {};

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function topicIdByName(topics: { id: number; name: string }[], ...names: string[]): number | undefined {
  return topics.find(t => names.includes(t.name.toLowerCase()))?.id;
}

function cfOf(e: DecryptedPost): Record<string, unknown> {
  return ((e.metadata as Record<string, unknown> | undefined)?._customFields as Record<string, unknown>) ?? {};
}

function time12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h)) return '';
  return `${h % 12 || 12}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}


/* ── Sections ── */

/** ["10:17", "AM"] in a time zone. Read from formatToParts — Safari / iPadOS put
 *  a narrow no-break space (U+202F), not a plain space, before AM/PM, so
 *  splitting the formatted string on ' ' fails there. An unknown zone falls
 *  back to local time. */
function clockParts(tz: string, now: Date): [string, string] {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).formatToParts(now);
  } catch {
    parts = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).formatToParts(now);
  }
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return [`${get('hour')}:${get('minute')}`, get('dayPeriod')];
}

/** `strip`: every city side by side across the page (under the Quick entry) — no title or "All N cities" */
function WorldClocks({ places, now, open, onToggle, strip }: { places: Place[]; now: Date; open: boolean; onToggle: () => void; strip?: boolean }) {
  const [weather, setWeather] = useState<Record<string, CurrentWeather>>({});
  useEffect(() => {
    let live = true;
    for (const p of places) {
      currentWeather(p).then(w => { if (live) setWeather(prev => ({ ...prev, [p.name]: w })); }).catch(() => {});
    }
    return () => { live = false; };
  }, [places]);

  const list = places.slice(0, MAX_PLACES);
  const shown = open ? list : list.slice(0, CLOCKS_SHOWN);
  if (strip) {
    if (list.length === 0) return null;
    const rows = list.map((p, i) => {
      const [t, ampm] = clockParts(p.timezone, now);
      const diff = hoursFromLocal(p.timezone, now);
      const w = weather[p.name];
      // No "Local" for the home city's zone — just the others' offsets
      return { key: `${p.name}-${i}`, home: i === 0, name: p.name, offset: diff === 0 ? '' : `${diff > 0 ? '+' : ''}${diff}h`,
        time: `${t} ${ampm}`, w, d: w ? describeWeather(w.code, w.isDay) : null };
    });
    return (
      <ClockStrip aria-label="World clocks">
        <div className="bar">
          {open ? <span className="muted">World clocks</span> : (
            <div className="line">
              {rows.map(r => (
                <span key={r.key} className={r.home ? 'home' : undefined}>
                  <span className="city">{r.name}</span>
                  {r.offset && <span className="muted">{r.offset}</span>}
                  <span className="time">{r.time}</span>
                  {r.w && <span className="muted">{r.w.tempF}°</span>}
                </span>
              ))}
            </div>
          )}
          <button type="button" className="toggle" aria-expanded={open} onClick={onToggle} style={open ? { marginLeft: 'auto' } : undefined}>
            {open ? 'Show less' : 'Expand'}
            <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>
        {open && (
          <div className="cards">
            {rows.map(r => (
              <div key={r.key} className={r.home ? 'card home' : 'card'}>
                <span className="city">{r.name}</span>
                {r.offset && <span className="muted">{r.offset}</span>}
                <span className="big">{r.time}</span>
                {r.d && <span className="weather"><MaterialIcon $size={16} aria-hidden="true">{r.d.icon}</MaterialIcon><span>{r.w!.tempF}° · {r.d.label}</span></span>}
              </div>
            ))}
          </div>
        )}
      </ClockStrip>
    );
  }
  return (
    <section aria-label="World clocks">
      <SectionHead>
        <h2>World clocks</h2>
        {list.length > CLOCKS_SHOWN && (
          <button type="button" aria-expanded={open} onClick={onToggle}>{open ? 'Show less' : `All ${list.length} cities`}</button>
        )}
      </SectionHead>
      {list.length === 0 ? <Muted>Add your city under Theme and layout (the sliders button) for the weather and world clocks.</Muted> : shown.map((p, i) => {
        const [t, ampm] = clockParts(p.timezone, now);
        const diff = hoursFromLocal(p.timezone, now);
        const w = weather[p.name];
        const d = w ? describeWeather(w.code, w.isDay) : null;
        return (
          <ClockRow key={`${p.name}-${i}`} $home={i === 0}>
            <span className="city">{p.name}<small>{diff === 0 ? 'Local' : `${diff > 0 ? '+' : ''}${diff}h`}</small></span>
            {d && <span className="weather"><MaterialIcon $size={18} aria-hidden="true">{d.icon}</MaterialIcon><span>{w!.tempF}°<span className="label"> · {d.label}</span></span></span>}
            <span className="time">{t} {ampm}</span>
          </ClockRow>
        );
      })}
    </section>
  );
}

/* Next up: the next event or meeting (repeats included) — when it starts
   ("in 25 min", "Tomorrow", "Thu, Oct 29") with its time across, the title,
   its kind and where, and an Open button. One still under way today shows as now. */
function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function spanLabel(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}

interface NextItem { id: number; day: string; time: string; allDay: boolean; title: string; detail: string }

function NextUp({ now }: { now: Date }) {
  const navigate = useNavigate();
  const openInJournal = useOpenInJournal();
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const today = toDateStr(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const next = useMemo<NextItem | null>(() => {
    const kinds = new Map<number, string>();
    for (const t of allTopics) {
      const n = t.name.toLowerCase();
      if (n === 'event' || n === 'events') kinds.set(t.id, 'Event');
      if (n === 'meeting' || n === 'meetings') kinds.set(t.id, 'Meeting');
    }
    const until = addDays(today, 90);
    let best: (NextItem & { sort: string }) | null = null;
    for (const e of entries) {
      const tid = (e.metadata as Record<string, unknown>)?._taxonomyId as number | undefined;
      const kind = tid !== undefined ? kinds.get(tid) : undefined;
      if (!kind) continue;
      const cf = cfOf(e);
      const allDay = !!cf.allDay;
      const time = allDay ? '' : String(cf.startTime ?? '');
      const end = allDay ? '' : String(cf.endTime ?? '');
      for (const day of occurrencesBetween(String(cf.startDate ?? ''), repeatRuleOf(cf), today, until, 3)) {
        // Today: skip one that's over (past its end, or its start when it has no end)
        if (day === today && time && minutesOf(end || time) < nowMin) continue;
        const sort = `${day} ${time || '00:00'}`;
        if (!best || sort < best.sort) {
          const title = (builtinEntryName(cf) || stripHtml(e.content).trim()).slice(0, 80) || 'Untitled';
          const where = [kind === 'Meeting' ? cf.meetingTopic : undefined, cf.location].find(v => typeof v === 'string' && v.trim()) as string | undefined;
          best = { id: e.id, day, time, allDay, title, detail: where ? `${kind} · ${where}` : kind, sort };
        }
        break;
      }
    }
    return best;
  }, [entries, allTopics, today, nowMin]);

  if (!next) return (
    <NextCard aria-label="Next up">
      <SectionHead><h2>Next up</h2></SectionHead>
      <NextTitle>Nothing coming up</NextTitle>
      <NextList>No events or meetings in the next three months.</NextList>
      <NextActions><PillButton type="button" $variant="neutral" onClick={() => navigate('/calendar')}>Calendar</PillButton></NextActions>
    </NextCard>
  );

  const tomorrow = addDays(today, 1);
  let when: string;
  if (next.day === today) {
    const diff = next.time ? minutesOf(next.time) - nowMin : 0;
    when = !next.time ? 'Next up · today' : diff <= 0 ? 'Now' : `Next up · in ${spanLabel(diff)}`;
  } else if (next.day === tomorrow) {
    when = 'Next up · tomorrow';
  } else {
    when = `Next up · ${new Date(`${next.day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`;
  }
  return (
    <NextCard aria-label="Next up">
      <SectionHead><h2>{when}</h2><span>{next.time ? time12(next.time) : 'All day'}</span></SectionHead>
      <NextTitle>{next.title}</NextTitle>
      <NextList>{next.detail}</NextList>
      <NextActions>
        <PillButton type="button" onClick={() => openInJournal(next.id)}>Open</PillButton>
        <PillButton type="button" $variant="neutral" onClick={() => navigate('/calendar')}>Calendar</PillButton>
      </NextActions>
    </NextCard>
  );
}

/* Log a symptom: the Health quick symptom form (symptom chips, severity,
   notes) as a flat section */
const SymptomBody = styled.div`
  margin-top: 20px;
`;

function LogSymptom() {
  const navigate = useNavigate();
  return (
    <section aria-label="Log a symptom">
      <SectionHead><h2>Log a symptom</h2><button type="button" onClick={() => navigate('/health/symptoms')}>Symptoms</button></SectionHead>
      <SymptomBody><QuickSymptomForm /></SymptomBody>
    </section>
  );
}


/* Today's priorities: numbered, a round tick to finish, "Add a priority" */
const PNum = styled.span<{ $done?: boolean }>`
  width: 18px;
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 300;
  color: ${({ $done }) => ($done ? 'var(--color-accent-link)' : 'var(--color-accent-link)')};
`;

/* A priority's text, edited in place (no box); done = muted + struck. It
   wraps and grows to show all of it (Enter adds no line break) */
const PText = styled(AutoTextarea)<{ $done?: boolean; $roomy?: boolean }>`
  && {
    flex: 1;
    min-width: 0;
    /* Priorities and Wins: a roomier row */
    padding: ${({ $roomy }) => ($roomy ? '20px 0' : '14px 0')};
    line-height: 1.4;
    min-height: 0;
    border: none !important;
    background: transparent !important;
    outline: none;
    font-family: var(--font-sans);
    font-size: 16px;
    color: ${({ $done }) => ($done ? 'var(--text-muted)' : 'var(--text-secondary)')};
    text-decoration: ${({ $done }) => ($done ? 'line-through' : 'none')};
  }
`;

/* × to remove a priority — quiet until the row is hovered or focused */
const PRemove = styled.button`
  display: flex;
  flex: none;
  padding: 4px;
  border: none;
  background: none;
  color: var(--text-faint);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s;
  *:hover > &, *:focus-within > &, &:focus-visible { opacity: 1; }
  &:hover { color: var(--text-primary); }
  @media (hover: none) { opacity: 1; }
`;

/* Inside Day at a glance: smaller rows — the number, 15px text, hairlines between */
const CompactRow = styled(Row)`
  min-height: 46px;
  gap: 14px;
  font-size: 15px;
`;
const CompactNum = styled(PNum)`
  width: 14px;
  font-family: var(--font-sans);
  font-size: 16px;
  font-weight: 400;
`;
const CompactText = styled(PText)`
  && { padding: 12px 0; font-size: 15px; }
`;

/* Under Priorities and Wins: these lists don't clear themselves at midnight
   (a list can run across several days), so say how a fresh one is started */
const NEW_LIST_NOTE = 'To start a new day or list, use the New list option at the top.';
const ListNote = styled.p`
  margin: 0;
  padding: 18px 0 10px;
  font-family: var(--font-sans);
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-muted);
`;

/** One priority's text: edited in place, saved on Enter or leaving the field;
 *  clearing it removes the priority. Escape puts the saved text back. */
function PriorityText({ item, onCommit, label = 'Priority', roomy, compact }: { item: PriorityItem; onCommit: (text: string) => void; label?: string; roomy?: boolean; compact?: boolean }) {
  const Field = compact ? CompactText : PText;
  const [text, setText] = useState(item.text);
  useEffect(() => { setText(item.text); }, [item.text]);
  const commit = () => { if (text.trim() !== item.text) onCommit(text.trim()); };
  return (
    <Field $done={item.done} $roomy={roomy} value={text} aria-label={`${label}: ${item.text}`}
      onChange={e => setText(e.target.value)} onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
        if (e.key === 'Escape') { setText(item.text); requestAnimationFrame(() => (e.target as HTMLTextAreaElement).blur()); }
      }} rows={1} />
  );
}


const BareInput = styled.input`
  && {
    flex: 1;
    min-width: 0;
    padding: 0;
    border: none !important;
    background: transparent !important;
    outline: none;
    font-family: var(--font-sans);
    font-size: 16px;
    color: var(--text-secondary);
  }
  &::placeholder { color: var(--text-hint); }
`;

/* The add boxes' text: wraps and grows to show everything typed; Enter adds
   the item (no line break) */
const BareAreaBox = styled(AutoTextarea)`
  && {
    flex: 1;
    min-width: 0;
    min-height: 0;
    padding: 0;
    border: none !important;
    background: transparent !important;
    outline: none;
    font-family: var(--font-sans);
    font-size: 16px;
    line-height: 1.4;
    color: var(--text-secondary);
  }
  &::placeholder { color: var(--text-hint); }
`;

function BareArea({ onEnter, ...rest }: Omit<React.ComponentProps<typeof AutoTextarea>, 'onKeyDown' | 'rows'> & { onEnter: (el: HTMLTextAreaElement) => void }) {
  return <BareAreaBox rows={1} {...rest}
    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onEnter(e.currentTarget); } }} />;
}

/* A card's add box ("Add a priority", "Add a win", "Write a mantra", "Start a timer for…"):
   a standard outlined text box (the border on the box — inputs are flat app-wide) */
const AddBox = styled.label`
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 52px;
  cursor: text;
  /* Ruled off from the rows above it, like they are from each other */
  ${Row} + & { border-top: 1px solid var(--border-subtle); }
  & > svg { flex: none; width: 18px; color: var(--text-muted); }
  &:focus-within > svg { color: var(--color-accent-link); }
`;

/** Type and press Enter (or, with `addOnBlur`, leave the box) to add; a failed add puts the text back */
function CardAdd({ label, failed, run, gap = 12, addOnBlur, roomy }: {
  label: string; failed: string; run: (text: string) => Promise<unknown>; gap?: number; addOnBlur?: boolean; roomy?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const add = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    setError('');
    run(text).catch(err => {
      console.error(`${label} failed:`, err);
      setDraft(text);
      setError(failed);
    });
  };
  return (<>
    <AddBox style={{ marginTop: gap, minHeight: roomy ? 64 : undefined }}>
      <Icon name="plus" size={18} strokeWidth={1.8} aria-hidden="true" />
      <BareArea value={draft} placeholder={label} aria-label={label} maxLength={500}
        onChange={e => setDraft(e.target.value)} onBlur={addOnBlur ? add : undefined} onEnter={add} />
    </AddBox>
    {error && <Muted role="alert" style={{ color: 'var(--color-danger)' }}>{error}</Muted>}
  </>);
}

/** The newest Priorities-topic entry and its items. Not tied to today — the
 *  list carries over midnight and stays until items are ticked or removed. */
function usePriorities() {
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const tid = topicIdByName(allTopics, 'priorities');
  const entry = useMemo(() => {
    if (tid === undefined) return undefined;
    const time = (e: DecryptedPost) => new Date(e.createdAt).getTime();
    return topicEntries(entries, tid)
      .reduce<DecryptedPost | undefined>((best, e) => (!best || time(e) > time(best) ? e : best), undefined);
  }, [entries, tid]);
  const items = ((entry ? cfOf(entry).priorities : undefined) as PriorityItem[] | undefined) ?? [];
  return { entry, items, tid };
}

/** Writes the Priorities list — the newest entry, or a new one when there's none */
function usePriorityList() {
  const setTopics = useEntriesStore(s => s.setTopics);
  const addDecryptedEntry = useEntriesStore(s => s.addDecryptedEntry);
  const { encryptNewPost } = useEncryption();
  const save = useSaveFields();
  const { entry, items, tid } = usePriorities();
  // The entry's title: "Priorities: 10/18/2026" — the list's own date
  const textOf = (date = new Date()) => `<p>${prioritiesTitle(date)}</p>`;

  /** A new Priorities entry — the newest, so the dashboard shows it from now on */
  const create = async (next: PriorityItem[]) => {
    let topicId = tid;
    if (topicId === undefined) {
      const t = await topicsApi.create({ name: 'Priorities', icon: 'flag' });
      setTopics([...useEntriesStore.getState().allTopics, t]);
      topicId = t.id;
    }
    const metadata = { _taxonomyId: topicId, _customFields: { priorities: next } };
    const content = textOf();
    const enc = await encryptNewPost(content, metadata);
    const res = await entriesApi.create({ id: enc.id,
      contentEncrypted: enc.contentEncrypted, contentIv: enc.contentIv,
      metadataEncrypted: enc.metadataEncrypted, metadataIv: enc.metadataIv,
      isEncrypted: true, taxonomyIds: [topicId],
    });
    addDecryptedEntry({ id: res.id as number, content, metadata, isEncrypted: true,
      createdAt: new Date(res.createdAt as string), updatedAt: new Date((res.updatedAt || res.createdAt) as string) });
  };

  const write = async (next: PriorityItem[]) => {
    if (entry) return save(entry, { ...cfOf(entry), priorities: next }, textOf(new Date(entry.createdAt)));
    return create(next);
  };
  const add = (text: string) => write([...items, { id: crypto.randomUUID(), text, done: false }]);
  return { items, write, create, add };
}

/* A priority row that can be dragged by its number to another place in the list */
function SortablePriority({ id, Row: RowEl, Num, n, label, children }: {
  id: string; Row: typeof Row; Num: typeof PNum; n: number; label: string; children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <RowEl ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, position: 'relative', zIndex: isDragging ? 2 : undefined, opacity: isDragging ? 0.7 : 1 }}>
      <Num as="button" type="button" ref={setActivatorNodeRef} {...attributes} {...listeners}
        aria-label={`Move priority ${n}: ${label}`} title="Drag to reorder"
        style={{ padding: 0, border: 'none', background: 'none', cursor: 'grab', touchAction: 'none', textAlign: 'left' }}>
        {n}
      </Num>
      {children}
    </RowEl>
  );
}

/* Numbered rows — each edited in place, a quiet ×, a check on the right,
   and "Add a priority" under them */
/** `compact`: the Day at a glance look — smaller rows, a count in the head, no add box or note (the add row above has "Add a priority") */
function Priorities({ compact }: { compact?: boolean }) {
  const { items, write, create, add } = usePriorityList();
  const prioritySensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [starting, setStarting] = useState(false);

  // New list: starts an empty one; the old list stays in the journal
  const startNew = async () => {
    setStarting(true);
    try { await create([]); } catch (err) { console.error('New priorities list failed:', err); }
    finally { setStarting(false); }
  };

  return (
    <section aria-label="Priorities">
      <SectionHead>
        <h2>Priorities</h2>
        <HeadLinks>
          {items.length > 0 && (
            <button type="button" disabled={starting} onClick={() => void startNew()}>New list</button>
          )}
        </HeadLinks>
      </SectionHead>
      {compact && items.length === 0 && <Muted>No priorities yet.</Muted>}
      {/* Drag a priority by its number to put it elsewhere in the list (arrow keys too, once it's picked up) */}
      <DndContext sensors={prioritySensors} collisionDetection={closestCenter}
        onDragEnd={({ active, over }) => {
          if (!over || active.id === over.id) return;
          const from = items.findIndex(x => x.id === active.id);
          const to = items.findIndex(x => x.id === over.id);
          if (from >= 0 && to >= 0) void write(arrayMove(items, from, to));
        }}>
      <SortableContext items={items.map(x => x.id)} strategy={verticalListSortingStrategy}>
      {items.map((p, i) => {
        const RowEl = compact ? CompactRow : Row;
        const Num = compact ? CompactNum : PNum;
        return (
        <SortablePriority key={p.id} id={p.id} Row={RowEl} Num={Num} n={i + 1} label={p.text}>
          {/* The tick before the text and the × at the far end, so finishing one never lands on removing it */}
          <Checkbox checked={p.done} aria-label={p.done ? `Mark "${p.text}" not done` : `Mark "${p.text}" done`}
            onChange={() => void write(items.map(x => (x.id === p.id ? { ...x, done: !x.done } : x)))} />
          <PriorityText item={p} roomy={!compact} compact={compact}
            onCommit={text => void write(text ? items.map(x => (x.id === p.id ? { ...x, text } : x)) : items.filter(x => x.id !== p.id))} />
          <PRemove type="button" aria-label={`Remove "${p.text}"`} title="Remove"
            onClick={() => void write(items.filter(x => x.id !== p.id))}>
            <Icon name="x" size={18} strokeWidth={2} />
          </PRemove>
        </SortablePriority>
        );
      })}
      </SortableContext>
      </DndContext>
      <CardAdd label="Add a priority" failed="That priority didn’t save. Try again." run={add} gap={0} addOnBlur roomy={!compact} />
      {!compact && items.length > 0 && <ListNote>{NEW_LIST_NOTE}</ListNote>}
    </section>
  );
}

/* ── Today's wins: what you achieved, one Wins entry a list ── */

/** The newest Wins-topic entry, like Priorities — it carries over midnight
 *  until New list starts another */
function useWinsList() {
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const tid = topicIdByName(allTopics, 'wins');
  const entry = useMemo(() => {
    if (tid === undefined) return undefined;
    const time = (e: DecryptedPost) => new Date(e.createdAt).getTime();
    return topicEntries(entries, tid)
      .reduce<DecryptedPost | undefined>((best, e) => (!best || time(e) > time(best) ? e : best), undefined);
  }, [entries, tid]);
  return { entry, items: entry ? winsOf(cfOf(entry)) : [], tid };
}

/** Writes the Wins list — the newest entry, or a new one when there's none */
function useWinsActions() {
  const setTopics = useEntriesStore(s => s.setTopics);
  const addDecryptedEntry = useEntriesStore(s => s.addDecryptedEntry);
  const { encryptNewPost } = useEncryption();
  const save = useSaveFields();
  const { entry, items, tid } = useWinsList();
  const creating = useRef(false);

  /** A new Wins entry — the newest, so the card shows it from now on */
  const create = async (next: WinItem[]) => {
    if (creating.current) return;
    creating.current = true;
    try {
      let topicId = tid;
      if (topicId === undefined) {
        const t = await topicsApi.create({ name: 'Wins', icon: 'trophy' });
        setTopics([...useEntriesStore.getState().allTopics, t]);
        topicId = t.id;
      }
      const metadata = { _taxonomyId: topicId, _customFields: { wins: next } };
      const content = winsContent(winsTitle(), next);
      const enc = await encryptNewPost(content, metadata);
      const res = await entriesApi.create({ id: enc.id,
        contentEncrypted: enc.contentEncrypted, contentIv: enc.contentIv,
        metadataEncrypted: enc.metadataEncrypted, metadataIv: enc.metadataIv,
        isEncrypted: true, taxonomyIds: [topicId],
      });
      addDecryptedEntry({ id: res.id as number, content, metadata, isEncrypted: true,
        createdAt: new Date(res.createdAt as string), updatedAt: new Date((res.updatedAt || res.createdAt) as string) });
    } finally { creating.current = false; }
  };

  const write = async (next: WinItem[]) => {
    if (entry) return save(entry, { ...cfOf(entry), wins: next }, winsContent(winsTitle(new Date(entry.createdAt)), next));
    return create(next);
  };
  const add = (text: string) => write([...items, { id: crypto.randomUUID(), text }]);
  return { items, tid, write, create, add };
}

/* Laid out like Today's priorities: numbered rows, each win edited in place
   with a quiet ×, and "Add a win" under them — no ticks (a win is done) */
/** `compact`: the Day at a glance look (see Priorities) */
function Wins({ compact }: { compact?: boolean }) {
  const navigate = useNavigate();
  const { items, tid, write, create, add } = useWinsActions();
  const [starting, setStarting] = useState(false);

  // New list: starts an empty one; the old list stays in the journal
  const startNew = async () => {
    setStarting(true);
    try { await create([]); } catch (err) { console.error('New wins list failed:', err); }
    finally { setStarting(false); }
  };

  return (
    <section aria-label="Wins">
      <SectionHead>
        <h2>Wins</h2>
        <HeadLinks>
          {items.length > 0 && <button type="button" disabled={starting} onClick={() => void startNew()}>New list</button>}
          {tid !== undefined && <button type="button" onClick={() => navigate(`/topics/${tid}`)}>All wins</button>}
        </HeadLinks>
      </SectionHead>
      {compact && items.length === 0 && <Muted>No wins yet.</Muted>}
      {items.map((w, i) => {
        const RowEl = compact ? CompactRow : Row;
        const Num = compact ? CompactNum : PNum;
        return (
        <RowEl key={w.id}>
          <Num>{i + 1}</Num>
          <PriorityText item={{ ...w, done: false }} label="Win" roomy={!compact} compact={compact}
            onCommit={text => void write(text ? items.map(x => (x.id === w.id ? { ...x, text } : x)) : items.filter(x => x.id !== w.id))} />
          <PRemove type="button" aria-label={`Remove "${w.text}"`} title="Remove"
            onClick={() => void write(items.filter(x => x.id !== w.id))}>
            <Icon name="x" size={18} strokeWidth={2} />
          </PRemove>
        </RowEl>
        );
      })}
      <CardAdd label="Add a win" failed="That win didn’t save. Try again." run={add} gap={0} addOnBlur roomy={!compact} />
      {!compact && items.length > 0 && <ListNote>{NEW_LIST_NOTE}</ListNote>}
    </section>
  );
}

/* ── Tasks: open tasks, a saved Planning view, or one todo list ── */

/* A card label that is its own picker ("OPEN TASKS ⌄", "SHOPPING LIST ⌄",
   "THIS MONTH ⌄"): the choice in the card label's tracked capitals with a
   small chevron; the real select lies invisibly over both (a select is as wide
   as its longest option, which would push the chevron away from the text) */
const LabelPick = styled.label<{ $wrap?: boolean }>`
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  max-width: 100%;
  cursor: pointer;
  && > span {
    ${cardLabel}
    min-width: 0;
    line-height: ${({ $wrap }) => ($wrap ? 1.7 : '30px')};
    ${({ $wrap }) => ($wrap ? '' : 'overflow: hidden; text-overflow: ellipsis; white-space: nowrap;')}
  }
  && > svg { flex: none; color: var(--text-muted); }
  &:hover > span, &:hover > svg { color: var(--text-primary); }
  select {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    appearance: none;
    border: none;
    font-size: 16px; /* iOS doesn't zoom into a 16px control */
    cursor: pointer;
  }
  &:focus-within { outline: 2px solid var(--color-accent); outline-offset: 4px; border-radius: 4px; }
`;

/** The "start a new list" choice at the foot of a card's picker */
const NEW_LIST = '__new';

/* A task's title: opens it in the journal (or a todo list in this card) */
const TaskTitle = styled.button<{ $done?: boolean }>`
  && {
    flex: 1;
    min-width: 0;
    padding: 0;
    border: none;
    background: none;
    text-align: left;
    font-family: var(--font-sans);
    font-size: 16px;
    font-weight: 400;
    color: ${({ $done }) => ($done ? 'var(--text-muted)' : 'var(--text-secondary)')};
    text-decoration: ${({ $done }) => ($done ? 'line-through' : 'none')};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }
  &&:hover { text-decoration: underline; }
`;

const TaskMeta = styled.span`
  flex: none;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
`;

const MoreLink = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 16px;
  padding: 0;
  border: none;
  background: none;
  font-family: var(--font-sans);
  font-size: 14px;
  font-weight: 500;
  color: var(--color-accent-link);
  cursor: pointer;
  &:hover { text-decoration: underline; }
`;

/** How many tasks the card lists before "N more in Planning" */
const TASKS_SHOWN = 8;

function shortDue(ymd: unknown): string {
  if (typeof ymd !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return '';
  return new Date(`${ymd}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** A card's picker choice (which list, which view): shown at once, then saved — the card never
 *  waits on the dashboard setting's save, and a save that's turned away doesn't undo the pick */
function useCardChoice(saved: string, save: (next: string) => void): [string, (next: string) => void] {
  const [local, setLocal] = useState(saved);
  useEffect(() => { setLocal(saved); }, [saved]);
  return [local, next => { setLocal(next); save(next); }];
}

function Tasks({ show: savedShow, onShow: saveShow }: { show: string; onShow: (next: string) => void }) {
  const [show, onShow] = useCardChoice(savedShow, saveShow);
  const navigate = useNavigate();
  const openInJournal = useOpenInJournal();
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const addDecryptedEntry = useEntriesStore(s => s.addDecryptedEntry);
  const { encryptNewPost } = useEncryption();
  const save = useSaveFields();
  const { loadPrivateSettings } = usePrivateSettings();
  const [savedTaskTypes] = useEncryptedSetting<string[]>('taskTypes', NO_TASK_TYPES);
  const [plannerOrder] = useEncryptedSetting<PlannerOrder>('plannerOrder', NO_PLANNER_ORDER);
  const [views, setViews] = useState<SavedPlanView[]>([]);
  const [draft, setDraft] = useState('');
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadPrivateSettings()
      .then(map => setViews(parseSavedViews(map.planningViews).filter(v => v.tab === 'tasks' || v.tab === 'todos')))
      .catch(() => {});
  }, [loadPrivateSettings]);

  const tid = topicIdByName(allTopics, 'task');
  const tasks = useMemo(() => (tid === undefined ? [] : [...topicEntries(entries, tid)]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())), [entries, tid]);
  const milestoneGoal = useMemo(() => {
    const mid = topicIdByName(allTopics, 'milestone');
    return new Map(topicEntries(entries, mid)
      .map(e => [e.id, (cfOf(e).parentGoalId as number) || null] as [number, number | null]));
  }, [entries, allTopics]);
  // A saved view's Category filter: a task takes its goal's category
  const goalCategory = useMemo(() => {
    const gid = topicIdByName(allTopics, 'goal');
    return new Map(topicEntries(entries, gid)
      .map(e => [e.id, goalCategoryOf(cfOf(e))] as [number, string]));
  }, [entries, allTopics]);
  const lists = tasks.filter(t => isTodoList(cfOf(t)));
  const titleOf = (e: DecryptedPost) => entryTitleText(e.content) || builtinEntryName(cfOf(e)) || 'Untitled';

  // What's chosen — a missing view or list falls back to open tasks
  const view = show.startsWith('view:') ? views.find(v => v.id === show.slice(5)) : undefined;
  const list = show.startsWith('list:') ? lists.find(l => String(l.id) === show.slice(5)) : undefined;
  // 'today' = what the planner has on today (Planning → Planner), done ones included
  const mode: 'open' | 'view' | 'list' | 'today' = list ? 'list' : view ? 'view' : show === 'today' ? 'today' : 'open';

  const rows = useMemo(() => {
    if (mode === 'list') return [];
    const types = taskTypeList(Array.isArray(savedTaskTypes) ? savedTaskTypes : []);
    const row = (e: DecryptedPost): PlanRow => {
      const cf = cfOf(e);
      const title = titleOf(e);
      return { title, text: `${title} ${taskTypeOf(cf)}`, due: typeof cf.deadline === 'string' ? cf.deadline : '',
        priority: (cf.priority as string) || 'none', typeRank: taskTypeRank(taskTypeOf(cf), types),
        created: new Date(e.createdAt).getTime() };
    };
    if (mode === 'today') {
      const day = toDateStr(new Date());
      const facts = tasks.map(t => ({ ...plannerFacts(t.id, cfOf(t), new Date(t.createdAt).getTime()), entry: t }));
      return (tasksByDay(facts, [day], day, parsePlannerOrder(plannerOrder)).get(day) ?? []).map(f => f.entry);
    }
    if (view) {
      // Done ones only when the view asks for them
      const passing = tasks.filter(t => taskPassesFilter(cfOf(t), filterOfView(view), milestoneGoal, goalCategory)
        && (view.status === 'done' || !cfOf(t).isCompleted));
      return searchAndSort(passing, row, view.query, view.sort);
    }
    return searchAndSort(tasks.filter(t => !cfOf(t).isCompleted), row, '', 'due');
  }, [mode, view, tasks, milestoneGoal, goalCategory, savedTaskTypes, plannerOrder]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = list ? checklistOf(cfOf(list)) : [];
  const writeItems = (next: ChecklistItem[]) => list && save(list, { ...cfOf(list), checklist: next });
  const addItem = () => {
    if (!list || !draft.trim()) return;
    const next = addChecklistItem(items, draft, crypto.randomUUID());
    setDraft('');
    void writeItems(next);
  };

  // A new todo list, named in place — shown here straight away
  const createList = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim()
      || `To-do list, ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    setError('');
    try {
      const topicId = await getOrCreateTopic('Task', 'circle-check');
      const content = `<p>${escapeHtml(name)}</p>`;
      const metadata = { _taxonomyId: topicId, _customFields: newTodoListFields(name) };
      const enc = await encryptNewPost(content, metadata);
      const res = await entriesApi.create({ id: enc.id,
        contentEncrypted: enc.contentEncrypted, contentIv: enc.contentIv,
        metadataEncrypted: enc.metadataEncrypted, metadataIv: enc.metadataIv,
        isEncrypted: true, taxonomyIds: [topicId],
      });
      addDecryptedEntry({ id: res.id as number, content, metadata, isEncrypted: true,
        createdAt: new Date(res.createdAt as string), updatedAt: new Date((res.updatedAt || res.createdAt) as string) });
      setNaming(false);
      setNewName('');
      onShow(`list:${res.id}`);
    } catch (err) {
      console.error('New todo list failed:', err);
      setError('That list didn’t save. Try again.');
    }
  };

  const toggleTask = (e: DecryptedPost) => {
    const cf = cfOf(e);
    void save(e, { ...cf, isCompleted: !cf.isCompleted, isInProgress: false, isInReview: false });
  };
  const pickValue = mode === 'list' ? `list:${list!.id}` : mode === 'view' ? `view:${view!.id}` : mode;
  const pickLabel = mode === 'list' ? titleOf(list!) : mode === 'view' ? view!.name : mode === 'today' ? 'Today’s plan' : 'Open tasks';
  const morePath = view ? PLAN_TAB_PATHS[view.tab] : mode === 'today' ? '/goals/planner' : '/goals/tasks';

  return (
    <section aria-label="Tasks">
      <SectionHead>
        <LabelPick>
          <span>{naming ? 'New to-do list' : pickLabel}</span>
          <Icon name="chevron-down" size={14} strokeWidth={2} aria-hidden="true" />
          <select aria-label="What the Tasks card shows" value={naming ? NEW_LIST : pickValue}
            onChange={e => {
              const v = e.target.value;
              setNewName(''); setDraft(''); setError('');
              if (v === NEW_LIST) { setNaming(true); return; }
              setNaming(false);
              onShow(v);
            }}>
            <option value="open">Open tasks</option>
            <option value="today">Today’s plan</option>
            {views.length > 0 && (
              <optgroup label="Saved views">
                {views.map(v => <option key={v.id} value={`view:${v.id}`}>{v.name}</option>)}
              </optgroup>
            )}
            {lists.length > 0 && (
              <optgroup label="To-do lists">
                {lists.map(l => <option key={l.id} value={`list:${l.id}`}>{titleOf(l)}</option>)}
              </optgroup>
            )}
            <option value={NEW_LIST}>New to-do list…</option>
          </select>
        </LabelPick>
        {naming ? <button type="button" onClick={() => { setNaming(false); setNewName(''); }}>Cancel</button>
          : mode === 'list' && list ? <button type="button" onClick={() => openInJournal(list.id)}>Open list</button>
          : mode === 'today' ? <button type="button" onClick={() => navigate(morePath)}>Open planner</button>
          : <button type="button" onClick={() => navigate(morePath)}>{rows.length > TASKS_SHOWN ? `${rows.length - TASKS_SHOWN} more in Planning` : 'Planning'}</button>}
      </SectionHead>

      {naming && (
        <AddItem onSubmit={e => void createList(e)}>
          <Icon name="plus" size={18} strokeWidth={1.8} aria-hidden="true" />
          <BareInput autoFocus value={newName} onChange={e => setNewName(e.target.value)} maxLength={120}
            placeholder="Name the list, e.g. First week of October" aria-label="New to-do list name"
            onKeyDown={e => { if (e.key === 'Escape') { setNaming(false); setNewName(''); } }} />
        </AddItem>
      )}
      {error && <Muted role="alert" style={{ color: 'var(--color-danger)' }}>{error}</Muted>}

      {!naming && mode === 'list' && list && (<>
        {items.length === 0 && <Muted>Nothing on this list yet.</Muted>}
        {items.map(i => (
          <Row key={i.id}>
            <Checkbox checked={i.done} aria-label={i.done ? `Mark "${i.text}" not done` : `Mark "${i.text}" done`}
              onChange={() => void writeItems(items.map(x => (x.id === i.id ? { ...x, done: !x.done } : x)))} />
            <PriorityText item={i} label="To-do"
              onCommit={text => void writeItems(text ? items.map(x => (x.id === i.id ? { ...x, text } : x)) : items.filter(x => x.id !== i.id))} />
            <PRemove type="button" aria-label={`Remove "${i.text}"`} title="Remove"
              onClick={() => void writeItems(items.filter(x => x.id !== i.id))}>
              <Icon name="x" size={14} strokeWidth={2} />
            </PRemove>
          </Row>
        ))}
        <AddItem onSubmit={e => { e.preventDefault(); addItem(); }}>
          <Icon name="plus" size={18} strokeWidth={1.8} aria-hidden="true" />
          <BareArea value={draft} placeholder="Add a to-do" aria-label={`Add a to-do to ${titleOf(list)}`}
            onChange={e => setDraft(e.target.value)} onEnter={el => el.form?.requestSubmit()} />
        </AddItem>
      </>)}

      {!naming && mode !== 'list' && (<>
        {rows.length === 0 && <Muted>{mode === 'view' ? 'Nothing matches this view.' : mode === 'today' ? 'Nothing planned for today.' : 'No open tasks.'}</Muted>}
        {rows.slice(0, TASKS_SHOWN).map(t => {
          const cf = cfOf(t);
          const progress = checklistProgress(cf);
          const meta = progress ? `${progress.done} of ${progress.total}` : shortDue(cf.deadline);
          return (
            <Row key={t.id}>
              <Checkbox checked={!!cf.isCompleted} aria-label={cf.isCompleted ? `Mark "${titleOf(t)}" not done` : `Mark "${titleOf(t)}" done`}
                onChange={() => toggleTask(t)} />
              <TaskTitle type="button" $done={!!cf.isCompleted}
                onClick={() => (isTodoList(cf) ? onShow(`list:${t.id}`) : openInJournal(t.id))}>
                {titleOf(t)}
              </TaskTitle>
              {meta && <TaskMeta>{meta}</TaskMeta>}
            </Row>
          );
        })}
      </>)}
    </section>
  );
}

const MealRow = styled(Row)`
  span:first-child { width: 120px; flex: none; font-size: 14px; color: var(--text-muted); }
`;

function Menu() {
  const navigate = useNavigate();
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const today = toDateStr(new Date());
  const plan = useMemo(() => menuDays(entries, topicIdByName(allTopics, 'menu plan')).get(today), [entries, allTopics, today]);
  return (
    <section aria-label="On the menu">
      <SectionHead><h2>On the menu</h2><button type="button" onClick={() => navigate('/menu')}>Week</button></SectionHead>
      {MENU_SLOTS.filter(s => s.key !== 'snack' || plan?.snack?.mealName || plan?.snack?.recipeName).map(s => {
        const slot = plan?.[s.key];
        const name = (slot?.mealName || slot?.recipeName || '').trim();
        return (
          <MealRow key={s.key}>
            <span>{s.label}</span>
            <span style={name ? undefined : { color: 'var(--text-hint)' }}>{name || 'Nothing planned'}</span>
          </MealRow>
        );
      })}
    </section>
  );
}

/* Coming up: events, meetings and bills over the next two weeks (doses live
   in Next up and Medications, not here). The kind is a plain muted label — no
   colour, fill or outline. */
type UpKind = 'event' | 'meeting' | 'bill' | 'task';
const KindPill = styled.span`
  flex: none;
  padding: 3px 0 3px 10px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
`;
const KIND_LABEL: Record<UpKind, string> = { event: 'Event', meeting: 'Meeting', bill: 'Bill', task: 'Task' };
/* Day at a glance's Coming up: a dot in the kind's colour before the title (the schedule's colours) */
const KIND_DOT: Record<UpKind, string> = { event: 'var(--chart-violet)', meeting: 'var(--chart-blue)', bill: 'var(--chart-amber)', task: 'var(--chart-green)' };
const UpCompact = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 14px 0;
  & + & { border-top: 1px solid var(--border-subtle); }
  font-family: var(--font-sans);
  & > .when { width: 54px; flex: none; padding-top: 1px; font-size: 13px; color: var(--text-muted); }
  /* The title over its time — no coloured mark */
  & > .what { flex: 1; min-width: 0; display: block;
    padding: 0; border: none; background: none; text-align: left; font: inherit; font-size: 15px; color: var(--text-secondary); cursor: pointer; }
  & > .what small { display: block; margin-top: 4px; font-size: 13px; color: var(--text-muted); }
  & > .what:hover { color: var(--text-primary); }
`;

const UpRow = styled(Row)`
  align-items: flex-start;
  padding: 14px 0;
  & > .when { width: 130px; flex: none; padding-top: 2px; font-size: 14px; color: var(--text-muted); }
  & > .what { flex: 1; min-width: 0; cursor: pointer; }
  & > .what small { display: block; margin-top: 4px; font-size: 14px; color: var(--text-muted); }
  @media (max-width: 480px) { & > .when { width: 86px; } }
`;

function whenLabel(day: string, time: string | undefined, today: string): string {
  const t = time ? time12(time) : '';
  if (day === today) return t || 'Today';
  if (day === toDateStr(addDaysLocal(1))) return t ? `Tomorrow ${t}` : 'Tomorrow';
  const d = new Date(day + 'T12:00:00');
  const wd = d.toLocaleDateString('en-US', { weekday: 'short' });
  return t ? `${wd} ${t}` : wd;
}

function addDaysLocal(n: number): Date { const d = new Date(); d.setDate(d.getDate() + n); return d; }

/** `compact`: the Day at a glance look — from tomorrow (today is on the schedule), task deadlines too, a coloured dot per kind */
function ComingUp({ financeOn, showBills, compact }: { financeOn: boolean; showBills: boolean; compact?: boolean }) {
  const navigate = useNavigate();
  const openInJournal = useOpenInJournal();
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  // Bills: only with Finance on and not hidden in Theme and layout (then they aren't loaded either)
  const withBills = financeOn && showBills;
  const bills = useFinance('bills', { enabled: withBills });
  const today = toDateStr(new Date());
  const end = addDays(today, 14);
  const from = compact ? addDays(today, 1) : today;

  const items = useMemo(() => {
    const eventIds = new Set(allTopics.filter(t => ['event', 'events'].includes(t.name.toLowerCase())).map(t => t.id));
    const meetingIds = new Set(allTopics.filter(t => ['meeting', 'meetings'].includes(t.name.toLowerCase())).map(t => t.id));
    const out: { key: string; day: string; time?: string; title: string; sub?: string; kind: UpKind; open: () => void }[] = [];
    for (const e of entries) {
      const tid = (e.metadata as Record<string, unknown>)?._taxonomyId as number | undefined;
      const kind = tid !== undefined && eventIds.has(tid) ? 'event' : tid !== undefined && meetingIds.has(tid) ? 'meeting' : null;
      if (!kind) continue;
      const cf = cfOf(e);
      // Each day it lands on in the next two weeks (just its start day unless it repeats)
      const days = occurrencesBetween(String(cf.startDate ?? ''), repeatRuleOf(cf), from, end);
      if (!days.length) continue;
      const title = (builtinEntryName(cf) || stripHtml(e.content).trim()).slice(0, 80) || 'Untitled';
      const sub = [cf.location, kind === 'meeting' ? cf.meetingTopic : undefined].filter(v => typeof v === 'string' && v.trim()).join(' · ');
      for (const day of days) {
        out.push({ key: `e${e.id}-${day}`, day, time: cf.allDay ? undefined : (cf.startTime as string | undefined) || undefined, title, sub: sub || undefined, kind, open: () => openInJournal(e.id) });
      }
    }
    if (withBills) {
      for (const { bill, date } of billOccurrences(bills.records, from, end)) {
        out.push({ key: `b${bill.id}${date}`, day: date, title: bill.name, sub: `${formatCents(bill.amountCents)} due`, kind: 'bill', open: () => navigate('/finance') });
      }
    }
    // Day at a glance also lists unfinished tasks' deadlines
    if (compact) {
      const taskIds = new Set(allTopics.filter(t => ['task', 'tasks'].includes(t.name.toLowerCase())).map(t => t.id));
      for (const e of entries) {
        if (!taskIds.has((e.metadata as Record<string, unknown>)?._taxonomyId as number)) continue;
        const cf = cfOf(e);
        const due = typeof cf.deadline === 'string' ? cf.deadline.slice(0, 10) : '';
        if (!due || cf.isCompleted || due < from || due > end) continue;
        out.push({ key: `t${e.id}`, day: due, title: (builtinEntryName(cf) || stripHtml(e.content).trim()).slice(0, 80) || 'Untitled', sub: 'Task deadline', kind: 'task', open: () => openInJournal(e.id) });
      }
    }
    return out.sort((a, b) => a.day.localeCompare(b.day) || (a.time ?? '99').localeCompare(b.time ?? '99')).slice(0, 8);
  }, [entries, allTopics, bills.records, withBills, from, end, compact, openInJournal, navigate]);

  if (compact) return (
    <section aria-label="Coming up">
      <SectionHead><h2>Coming up</h2><button type="button" onClick={() => navigate('/calendar')}>Calendar</button></SectionHead>
      {items.length === 0 ? <Muted>Nothing in the next two weeks.</Muted> : items.map(it => {
        const d = new Date(`${it.day}T12:00:00`);
        return (
          <UpCompact key={it.key}>
            <span className="when">{d.toLocaleDateString('en-US', { weekday: 'short' })} {d.getDate()}</span>
            <button type="button" className="what" onClick={it.open}>
              {it.title}
              <small>{it.time ? time12(it.time) : it.sub ?? (it.kind === 'event' || it.kind === 'meeting' ? 'All day' : '')}</small>
            </button>
          </UpCompact>
        );
      })}
    </section>
  );

  return (
    <section aria-label="Coming up">
      <SectionHead><h2>Coming up</h2><button type="button" onClick={() => navigate('/calendar')}>Calendar</button></SectionHead>
      {items.length === 0 ? <Muted>Nothing in the next two weeks.</Muted> : items.map(it => (
        <UpRow key={it.key}>
          <span className="when">{whenLabel(it.day, it.time, today)}</span>
          <span className="what" role="button" tabIndex={0} onClick={it.open} onKeyDown={e => { if (e.key === 'Enter') it.open(); }}>
            {it.title}{it.sub && <small>{it.sub}</small>}
          </span>
          <KindPill>{KIND_LABEL[it.kind]}</KindPill>
        </UpRow>
      ))}
    </section>
  );
}

/* Recent entries: the last five Journal entries (topic Journal, or none) —
   the title, its date muted on the right, opening it in the journal; a
   "View journal" link in the head */
const RecentRow = styled(Row)`
  cursor: pointer;
  & > .title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  & > .date { flex: none; font-size: 14px; color: var(--text-muted); }
  &:hover > .title { text-decoration: underline; }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

/* ── Mantra: one of your mantras a day, in turn ── */

/* The mantra in the daily quote's voice: thin italic Work Sans; tap to edit */
const MantraText = styled.button`
  display: block;
  width: 100%;
  margin: 18px 0 0;
  padding: 0;
  border: none;
  background: none;
  text-align: left;
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 300;
  font-style: italic;
  line-height: 1.35;
  color: var(--text-primary);
  white-space: pre-line;
  cursor: pointer;
  &:hover { text-decoration: underline; text-decoration-thickness: 1px; }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 4px; border-radius: 4px; }
  @media (max-width: 480px) { font-size: 19px; }
`;

/* ‹ › to look at the others (today's comes back tomorrow) */
const MantraNav = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 16px;
  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 1px solid var(--border-card);
    border-radius: 999px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }
  button:hover { color: var(--text-primary); border-color: var(--control-border); }
  button:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

/** Saves a new mantra to the Mantra topic (made on first use) */
function useAddMantra() {
  const addDecryptedEntry = useEntriesStore(s => s.addDecryptedEntry);
  const { encryptNewPost } = useEncryption();
  return async (text: string) => {
    const tid = await getOrCreateTopic(MANTRA_TOPIC, MANTRA_ICON);
    const content = `<p>${escapeHtml(text)}</p>`;
    const metadata = { _taxonomyId: tid };
    const enc = await encryptNewPost(content, metadata);
    const res = await entriesApi.create({ id: enc.id,
      contentEncrypted: enc.contentEncrypted, contentIv: enc.contentIv,
      metadataEncrypted: enc.metadataEncrypted, metadataIv: enc.metadataIv,
      isEncrypted: true, taxonomyIds: [tid],
    });
    addDecryptedEntry({ id: res.id as number, content, metadata, isEncrypted: true,
      createdAt: new Date(res.createdAt as string), updatedAt: new Date((res.updatedAt || res.createdAt) as string) });
  };
}

function Mantra() {
  const navigate = useNavigate();
  const openInJournal = useOpenInJournal();
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const [step, setStep] = useState(0);
  const addMantra = useAddMantra();

  const topicId = allTopics.find(t => isMantraTopic(t.name))?.id;
  // Oldest first, so the daily turn is stable as new ones are added
  const mantras = useMemo(() => (topicId === undefined ? [] : topicEntries(entries, topicId)
    .map(e => ({ id: e.id, text: stripHtml(e.content).trim() }))
    .filter(m => m.text)
    .sort((a, b) => a.id - b.id)), [entries, topicId]);
  const shown = mantras[stepIndex(dailyMantraIndex(mantras.length), step, mantras.length)];

  // One just written (in Write a mantra) shows: it's last in the list
  const count = useRef(mantras.length);
  useEffect(() => {
    if (mantras.length > count.current) setStep(mantras.length - 1 - dailyMantraIndex(mantras.length));
    count.current = mantras.length;
  }, [mantras.length]);

  return (
    <section aria-label="Mantra">
      <SectionHead>
        <h2>Mantra</h2>
        {topicId !== undefined && <button type="button" onClick={() => navigate(`/topics/${topicId}`)}>All mantras</button>}
      </SectionHead>
      {shown ? (<>
        <MantraText type="button" title="Edit this mantra" onClick={() => openInJournal(shown.id)}>{shown.text}</MantraText>
        {mantras.length > 1 && (
          <MantraNav>
            <button type="button" aria-label="Previous mantra" onClick={() => setStep(s => s - 1)}>
              <Icon name="chevron-left" size={16} strokeWidth={2} />
            </button>
            <button type="button" aria-label="Next mantra" onClick={() => setStep(s => s + 1)}>
              <Icon name="chevron-right" size={16} strokeWidth={2} />
            </button>
          </MantraNav>
        )}
      </>) : <Muted>No mantras yet. Write your first one below.</Muted>}
      <CardAdd label="Write a mantra" failed="That mantra didn’t save. Try again." run={addMantra} gap={20} />
    </section>
  );
}

function RecentEntries() {
  const navigate = useNavigate();
  const openInJournal = useOpenInJournal();
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);

  const recent = useMemo(() => {
    const journal = new Set(allTopics.filter(t => t.name.toLowerCase() === 'journal').map(t => t.id));
    return entries
      .filter(e => {
        const tid = (e.metadata as Record<string, unknown> | undefined)?._taxonomyId as number | undefined;
        return tid === undefined || journal.has(tid);
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
  }, [entries, allTopics]);

  return (
    <section aria-label="Recent entries">
      <SectionHead><h2>Recent entries</h2><button type="button" onClick={() => navigate('/journal')}>View journal</button></SectionHead>
      {recent.length === 0 ? <Muted>Nothing written yet.</Muted> : recent.map(e => {
        const title = entryTitleText(e.content) || builtinEntryName(cfOf(e)) || 'Untitled';
        const open = () => openInJournal(e.id);
        return (
          <RecentRow key={e.id} role="button" tabIndex={0} onClick={open}
            onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); } }}>
            <span className="title">{title}</span>
            <span className="date">{new Date(e.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
          </RecentRow>
        );
      })}
    </section>
  );
}

/* Stats: a full-width bar at the foot of the page — the period as the card
   label's own picker ("THIS MONTH ⌄") on the left, then big thin figures
   across, a label under each */
const StatsHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-subtle);
  h2 { margin: 0; ${cardLabel} }
`;

const StatsBar = styled.section<{ $phoneLast: boolean; $folded?: boolean }>`
  position: relative;
  display: flex;
  align-items: center;
  gap: 24px 40px;
  margin-top: 28px;
  padding: 30px 40px;
  ${cardShell}
  /* The period picker, then a vertical divider before the figures — its words at the top */
  & > label {
    flex: none;
    box-sizing: content-box;
    width: 104px;
    align-self: stretch;
    align-items: flex-start;
    padding-right: 32px;
    border-right: 1px solid var(--border-card);
  }
  /* Folded: just the picker and the chevron (no divider, figures hidden) */
  ${({ $folded }) => ($folded ? `
    & > label { border-right: none; align-self: center; }
    padding-top: 18px;
    padding-bottom: 18px;
  ` : '')}
  @media (max-width: 768px) {
    ${({ $phoneLast }) => ($phoneLast ? 'order: 3;' : '')}
    flex-direction: column;
    align-items: stretch;
    padding: 24px 22px;
    & > label { width: auto; align-self: flex-start; padding-right: 0; border-right: none; }
  }
`;

const StatGrid = styled.div`
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
  gap: 22px 16px;
  min-width: 0;
  @media (max-width: 768px) { grid-template-columns: repeat(3, minmax(0, 1fr)); }
`;

/* Folds / opens the Stats bar: a chevron at its end */
const StatsFold = styled.button`
  flex: none;
  align-self: flex-start;
  margin-left: auto;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: none;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  &:hover { color: var(--text-primary); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; border-radius: 6px; }
  @media (max-width: 768px) { position: absolute; top: 18px; right: 16px; }
`;

const StatFig = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  b { font-family: var(--font-display); font-size: 38px; font-weight: 300; line-height: 1.05; color: var(--text-primary); font-variant-numeric: tabular-nums; }
  span { font-family: var(--font-sans); font-size: 15px; color: var(--text-muted); }
  @media (max-width: 480px) { b { font-size: 32px; } span { font-size: 14px; } }
  /* Light: grey, so the figures sit quietly (not near-black), the labels a step lighter */
  html[data-theme='light'] & b { color: #858b94; }
  html[data-theme='light'] & span { color: #959ba3; }
  /* Dark: grey too, so the figures sit quietly */
  html[data-theme='dark'] & b { color: #8a8e98; }
  html[data-theme='dark'] & span { color: #6c707a; }
`;

const STAT_PERIODS: { value: StatsPeriod; label: string }[] = [
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'all', label: 'All time' },
];

function Stats({ meals, meds, exercise, phoneLast, folded, onToggleFold }: { meals: boolean; meds: boolean; exercise: boolean; phoneLast: boolean; folded?: boolean; onToggleFold?: () => void }) {
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const [period, setPeriod] = useState<StatsPeriod>('month');
  const [doseRecords, setDoseRecords] = useState<StatsDose[]>([]);

  // Every dose record (the in-memory copy Med history uses); again whenever a dose is ticked
  useEffect(() => {
    if (!meds) return;
    let live = true;
    const load = () => { dosesApi.getAll().then(r => { if (live) setDoseRecords(r.logs); }).catch(() => { /* leave the last count */ }); };
    load();
    window.addEventListener(DOSES_CHANGED, load);
    return () => { live = false; window.removeEventListener(DOSES_CHANGED, load); };
  }, [meds]);

  const stats = useMemo(() => dashboardStats(entries, allTopics, doseRecords, period, new Date()), [entries, allTopics, doseRecords, period]);
  const figures: { label: string; value: number; on: boolean }[] = [
    { label: 'Entries', value: stats.entries, on: true },
    { label: 'Journal', value: stats.journal, on: true },
    { label: 'Meals', value: stats.meals, on: meals },
    { label: 'Doses', value: stats.doses, on: meds },
    { label: 'Exercise', value: stats.exercise, on: exercise },
    { label: 'Symptoms', value: stats.symptoms, on: true },
    { label: 'Check-ins', value: stats.checkIns, on: true },
  ];

  return (
    <StatsBar aria-label="Stats" $phoneLast={phoneLast} $folded={!!folded}>
      <LabelPick $wrap>
        <span>{STAT_PERIODS.find(p => p.value === period)?.label}</span>
        <Icon name="chevron-down" size={14} strokeWidth={2} aria-hidden="true" />
        <select aria-label="Stats for" value={period} onChange={e => setPeriod(e.target.value as StatsPeriod)}>
          {STAT_PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </LabelPick>
      {!folded && (
        <StatGrid>
          {figures.filter(f => f.on).map(f => (
            <StatFig key={f.label}><b>{f.value.toLocaleString()}</b><span>{f.label}</span></StatFig>
          ))}
        </StatGrid>
      )}
      {onToggleFold && (
        <StatsFold type="button" aria-expanded={!folded} aria-label={folded ? 'Show the stats' : 'Fold the stats'} title={folded ? 'Show' : 'Fold'} onClick={onToggleFold}>
          <Icon name={folded ? 'chevron-down' : 'chevron-up'} size={18} strokeWidth={1.8} />
        </StatsFold>
      )}
    </StatsBar>
  );
}

/* Time tracked: what had time this period (and every Time Tracking activity), most first,
   each with its own start / stop; a box under them starts a timer for a new or existing activity */
const TIME_PERIODS: { value: TimePeriod; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

const TimeTotal = styled.div`
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-top: 6px;
  /* A divider under the total */
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-subtle);
  b { font-family: var(--font-display); font-size: 23px; font-weight: 300; line-height: 1.05; color: var(--text-primary); font-variant-numeric: tabular-nums; }
  span { font-family: var(--font-sans); font-size: 13px; color: var(--text-muted); }
`;

const TimeRow = styled(Row)`
  /* Tighter rows */
  padding-top: 6px;
  padding-bottom: 6px;
  & > .title { flex: 1; min-width: 0; padding: 0; border: none; background: none; text-align: left; font: inherit; color: inherit;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
  & > .title:hover { text-decoration: underline; }
  & > .spent { flex: none; font-size: 14px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
  & > .spent.on { color: var(--color-accent-soft); font-weight: 600; }
  &:hover .x, & .x:focus-visible { opacity: 1; }
`;

const TimerBtn = styled.button<{ $on: boolean }>`
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid ${({ $on }) => ($on ? 'var(--color-accent-line)' : 'var(--border-card)')};
  border-radius: 50%;
  background: transparent;
  color: ${({ $on }) => ($on ? 'var(--color-accent-soft)' : 'var(--text-muted)')};
  cursor: pointer;
  &:hover { color: ${({ $on }) => ($on ? 'var(--color-accent-link)' : 'var(--text-primary)')}; }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

/* A row's quiet × (shown on hover, always on touch); a second click confirms */
const TimeRemove = styled.button<{ $confirm?: boolean }>`
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  padding: ${({ $confirm }) => ($confirm ? '0 10px' : '0')};
  border: none;
  border-radius: 6px;
  background: none;
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 600;
  color: ${({ $confirm }) => ($confirm ? 'var(--color-danger)' : 'var(--text-muted)')};
  cursor: pointer;
  &:hover { color: ${({ $confirm }) => ($confirm ? 'var(--color-danger)' : 'var(--text-primary)')}; }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  &.x { opacity: 0; transition: opacity 120ms; }
  @media (hover: none) { &.x { opacity: 1; } }
`;

const TIME_ROWS = 8;

/** Starts a timer for an activity by name: an existing Time Tracking entry of
 *  that name, else a new one (in the account's time-tracking topic, else a new
 *  Time Tracking topic) */
function useStartTimerFor() {
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const addDecryptedEntry = useEntriesStore(s => s.addDecryptedEntry);
  const { encryptNewPost } = useEncryption();
  const loaded = useTimeStore(s => s.loaded);
  const apply = useTimeStore(s => s.apply);
  return async (name: string) => {
    if (!loaded) throw new Error('The time log isn’t loaded yet');
    const tracking = new Set(allTopics.filter(t => isTimeTrackingTopic(t.name)).map(t => t.id));
    const nameOf = (e: DecryptedPost) => entryTitleText(e.content) || builtinEntryName(cfOf(e)) || 'Untitled';
    const existing = entries.find(x => tracking.has((x.metadata as Record<string, unknown>)?._taxonomyId as number) && nameOf(x).toLowerCase() === name.toLowerCase());
    let id = existing?.id;
    if (id === undefined) {
      const topicId = [...tracking][0] ?? await getOrCreateTopic(TIME_TRACKING_TOPIC, 'stopwatch');
      const content = `<p>${escapeHtml(name)}</p>`;
      const metadata = { _taxonomyId: topicId, _customFields: { activityName: name, notes: '' } };
      const enc = await encryptNewPost(content, metadata);
      const res = await entriesApi.create({ id: enc.id,
        contentEncrypted: enc.contentEncrypted, contentIv: enc.contentIv,
        metadataEncrypted: enc.metadataEncrypted, metadataIv: enc.metadataIv,
        isEncrypted: true, taxonomyIds: [topicId],
      });
      id = res.id as number;
      addDecryptedEntry({ id, content, metadata, isEncrypted: true,
        createdAt: new Date(res.createdAt as string), updatedAt: new Date((res.updatedAt || res.createdAt) as string) });
    }
    const startId = id;
    apply(list => startTimer(list, startId, new Date(), crypto.randomUUID()));
  };
}

function TimeTracked() {
  const openInJournal = useOpenInJournal();
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const sessions = useTimeStore(s => s.sessions);
  const loaded = useTimeStore(s => s.loaded);
  const apply = useTimeStore(s => s.apply);
  const [period, setPeriod] = useState<TimePeriod>('today');
  const [showAll, setShowAll] = useState(false);
  const startFor = useStartTimerFor();
  const running = runningSession(sessions);
  const now = useNow(!!running);

  const trackingTopics = useMemo(() => new Set(allTopics.filter(t => isTimeTrackingTopic(t.name)).map(t => t.id)), [allTopics]);
  const byEntry = timeByEntry(sessions, timePeriodStart(period, now), now);
  const nameOf = (e: DecryptedPost) => entryTitleText(e.content) || builtinEntryName(cfOf(e)) || 'Untitled';
  const rows = entries
    .filter(e => byEntry.has(e.id) || running?.entryId === e.id || trackingTopics.has((e.metadata as Record<string, unknown>)?._taxonomyId as number))
    .map(e => ({ entry: e, ms: byEntry.get(e.id) ?? 0, name: nameOf(e) }))
    .sort((a, b) => Number(running?.entryId === b.entry.id) - Number(running?.entryId === a.entry.id) || b.ms - a.ms || a.name.localeCompare(b.name));
  const total = [...byEntry.values()].reduce((t, v) => t + v, 0);
  const shown = showAll ? rows : rows.slice(0, TIME_ROWS);

  const [confirming, setConfirming] = useState<number | null>(null);
  const isActivity = (e: DecryptedPost) => trackingTopics.has((e.metadata as Record<string, unknown>)?._taxonomyId as number);
  // A Time Tracking activity is deleted (its time goes with it); anything else just loses its tracked time
  const removeRow = (e: DecryptedPost) => {
    setConfirming(null);
    if (isActivity(e)) void deleteEntryWithImages(e.id).catch(() => { /* the flash note says so */ });
    else apply(list => list.filter(x => x.entryId !== e.id));
  };
  const toggle = (id: number) => apply(list => (running?.entryId === id ? stopTimer(list, new Date()) : startTimer(list, id, new Date(), crypto.randomUUID())));

  const periodWord = period === 'today' ? 'today' : period === 'week' ? 'in the last 7 days' : 'this month';
  return (
    <section aria-label="Time tracked">
      <StatsHead>
        <h2>Time tracked</h2>
        {/* Hidden while the card is folded */}
        <div data-fold-hide=""><FilterTabs options={TIME_PERIODS} active={period} onChange={setPeriod} /></div>
      </StatsHead>
      <TimeTotal><b>{formatSpent(total)}</b><span>{periodWord}</span></TimeTotal>
      {rows.length === 0
        ? <Muted>Nothing timed {periodWord}. Start a timer on a task, goal or exercise, or type an activity below.</Muted>
        : <div style={{ marginTop: 2 }}>
          {shown.map(({ entry, ms: spent, name }) => {
            const on = running?.entryId === entry.id;
            return (
              <TimeRow key={entry.id}>
                <button type="button" className="title" onClick={() => openInJournal(entry.id)}>{name}</button>
                <span className={on ? 'spent on' : 'spent'}>{on ? formatClock(sessionMs(running!, now)) : spent ? formatSpent(spent) : '—'}</span>
                <TimerBtn type="button" $on={on} disabled={!loaded} aria-label={on ? `Stop the timer on ${name}` : `Start a timer on ${name}`} title={on ? 'Stop' : 'Start timer'}
                  onClick={() => toggle(entry.id)}>
                  <MaterialIcon $size={18} aria-hidden="true">{on ? 'stop' : 'play_arrow'}</MaterialIcon>
                </TimerBtn>
                {confirming === entry.id ? (
                  <TimeRemove type="button" $confirm autoFocus onBlur={() => setConfirming(null)} onClick={() => removeRow(entry)}
                    aria-label={isActivity(entry) ? `Confirm deleting ${name}` : `Confirm clearing the time on ${name}`}>
                    {isActivity(entry) ? 'Delete?' : 'Clear time?'}
                  </TimeRemove>
                ) : (
                  <TimeRemove type="button" className="x" disabled={!loaded} onClick={() => setConfirming(entry.id)}
                    aria-label={isActivity(entry) ? `Delete ${name}` : `Clear the time on ${name}`}
                    title={isActivity(entry) ? 'Delete activity' : 'Clear its time'}>
                    <Icon name="x" size={14} strokeWidth={2} />
                  </TimeRemove>
                )}
              </TimeRow>
            );
          })}
          {rows.length > TIME_ROWS && (
            <MoreLink type="button" onClick={() => setShowAll(v => !v)}>{showAll ? 'Show fewer' : `Show all ${rows.length}`}</MoreLink>
          )}
        </div>}
      {/* A divider above Start a timer for… */}
      <div style={{ marginTop: 8, paddingTop: 0, borderTop: '1px solid var(--border-subtle)' }}>
        <CardAdd label="Start a timer for…" failed="That timer didn’t start. Try again." run={startFor} gap={6} />
      </div>
    </section>
  );
}

/* Shopping list: the newest open list's items as outline pills (got = struck) */
const Pills = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
`;

const ItemPill = styled.button<{ $got: boolean }>`
  height: 36px;
  padding: 0 16px;
  border: 1px solid var(--border-pill, var(--border-card));
  border-radius: 999px;
  background: var(--bg-control, transparent);
  font-family: var(--font-sans);
  font-size: 15px;
  color: ${({ $got }) => ($got ? 'var(--text-muted)' : 'var(--text-secondary)')};
  text-decoration: ${({ $got }) => ($got ? 'line-through' : 'none')};
  cursor: pointer;
  &:hover { border-color: var(--control-border); }
  /* Got: on the grey fill with a ✓, struck through */
  ${({ $got }) => ($got ? css`
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border-color: transparent;
    background: var(--bg-active);
    svg { flex: none; }
  ` : '')}
`;

/* Add an item: an outlined pill with a + — Enter adds */
const AddItem = styled.form`
  background: var(--bg-control, transparent);
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 20px;
  min-height: 44px;
  padding: 10px 20px;
  border: 1px solid var(--border-pill, var(--border-card));
  border-radius: 22px; /* a pill at one line, rounded corners once it grows */
  color: var(--text-muted); /* the + */
  &:focus-within { border-color: var(--color-accent); }
`;

/** `compact`: the Day at a glance look — the items as a numbered checklist like Priorities */
export function Shopping({ show: savedShow, onShow: saveShow, compact }: { show: string; onShow: (next: string) => void; compact?: boolean }) {
  const [show, onShow] = useCardChoice(savedShow, saveShow);
  const openInJournal = useOpenInJournal();
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const addDecryptedEntry = useEntriesStore(s => s.addDecryptedEntry);
  const { encryptPost, encryptNewPost } = useEncryption();
  const save = useSaveFields();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState('');
  const listTid = topicIdByName(allTopics, 'shopping list', 'shopping lists');
  // Every list, newest first, for the picker
  const lists = useMemo(() => (listTid === undefined ? [] : [...topicEntries(entries, listTid)]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())), [entries, listTid]);
  // The chosen list, else (or when it's gone) the newest open one
  const chosen = show !== 'latest' ? lists.find(l => String(l.id) === show) : undefined;
  const latest = useMemo(() => latestOpenList(entries, listTid), [entries, listTid]);
  const list = chosen ?? latest;
  const listName = (e: DecryptedPost) => entryTitleText(e.content) || 'Shopping list';
  const items = ((list ? cfOf(list).items : undefined) as ShoppingItem[] | undefined) ?? [];

  // Adds to the open list; with none open, starts a new dated one
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = draft.trim();
    if (!name) return;
    setDraft('');
    setError('');
    const item: ShoppingItem = { id: crypto.randomUUID(), name, category: 'other', checked: false };
    if (list) return save(list, { ...cfOf(list), items: [...items, item] });
    try {
      await createList(defaultShoppingListTitle(), [item]);
    } catch (err) {
      console.error('Shopping list create failed:', err);
      setDraft(name);
      setError('That item didn’t save. Try again.');
    }
  };

  /** A new shopping list (the newest, so "Latest open list" shows it too); returns its id */
  const createList = async (title: string, first: ShoppingItem[] = []) => {
    const topicId = await getOrCreateTopic('Shopping List', 'cart-shopping');
    const content = `<p>${escapeHtml(title)}</p>`;
    const metadata = { _taxonomyId: topicId, _customFields: { items: first, notes: '', linkedRecipeIds: [] } };
    const enc = await encryptNewPost(content, metadata);
    const res = await entriesApi.create({ id: enc.id,
      contentEncrypted: enc.contentEncrypted, contentIv: enc.contentIv,
      metadataEncrypted: enc.metadataEncrypted, metadataIv: enc.metadataIv,
      isEncrypted: true, taxonomyIds: [topicId],
    });
    addDecryptedEntry({ id: res.id as number, content, metadata, isEncrypted: true,
      createdAt: new Date(res.createdAt as string), updatedAt: new Date((res.updatedAt || res.createdAt) as string) });
    return res.id as number;
  };

  // New list: named in place (blank = the dated default), then shown here
  const startList = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const id = await createList(newName.trim() || defaultShoppingListTitle());
      setNaming(false);
      setNewName('');
      onShow(String(id));
    } catch (err) {
      console.error('New shopping list failed:', err);
      setError('That list didn’t save. Try again.');
    }
  };

  return (
    <section aria-label="Shopping list">
      <SectionHead>
        <LabelPick>
          <span>{naming ? 'New shopping list' : chosen ? listName(chosen) : 'Shopping list'}</span>
          <Icon name="chevron-down" size={14} strokeWidth={2} aria-hidden="true" />
          <select aria-label="Which shopping list" value={naming ? NEW_LIST : chosen ? String(chosen.id) : 'latest'}
            onChange={e => {
              const v = e.target.value;
              setNewName(''); setError('');
              if (v === NEW_LIST) { setNaming(true); return; }
              setNaming(false);
              onShow(v);
            }}>
            <option value="latest">Latest open list</option>
            {lists.map(l => <option key={l.id} value={String(l.id)}>{listName(l)}</option>)}
            <option value={NEW_LIST}>New list…</option>
          </select>
        </LabelPick>
        <HeadLinks>
          {naming ? <button type="button" onClick={() => { setNaming(false); setNewName(''); }}>Cancel</button>
            : list && <button type="button" onClick={() => openInJournal(list.id)}>Open list</button>}
        </HeadLinks>
      </SectionHead>
      {naming ? (
        <AddItem onSubmit={e => void startList(e)}>
          <Icon name="plus" size={18} strokeWidth={1.8} aria-hidden="true" />
          <BareInput autoFocus value={newName} onChange={e => setNewName(e.target.value)} maxLength={120}
            placeholder="Name the list, e.g. Weekend groceries" aria-label="New shopping list name"
            onKeyDown={e => { if (e.key === 'Escape') { setNaming(false); setNewName(''); } }} />
        </AddItem>
      ) : (<>
      {!list ? <Muted>No open shopping list — add an item to start one.</Muted> : items.length === 0 ? <Muted>No items yet.</Muted> : compact ? (
        <div>
          {items.map((it, i) => {
            const setItems = (next: ShoppingItem[]) => void save(list, { ...cfOf(list), items: next });
            return (
              <CompactRow key={it.id}>
                <CompactNum>{i + 1}</CompactNum>
                <Checkbox checked={!!it.checked} aria-label={it.checked ? `Mark "${it.name}" not got` : `Mark "${it.name}" got`}
                  onChange={() => setItems(items.map(x => (x.id === it.id ? { ...x, checked: !x.checked } : x)))} />
                <PriorityText item={{ id: it.id, text: it.name, done: !!it.checked }} label="Item" compact
                  onCommit={text => setItems(text ? items.map(x => (x.id === it.id ? { ...x, name: text } : x)) : items.filter(x => x.id !== it.id))} />
                <PRemove type="button" aria-label={`Remove "${it.name}"`} title="Remove"
                  onClick={() => setItems(items.filter(x => x.id !== it.id))}>
                  <Icon name="x" size={18} strokeWidth={2} />
                </PRemove>
              </CompactRow>
            );
          })}
        </div>
      ) : (
        <Pills>
          {[...items.filter(i => !i.checked), ...items.filter(i => i.checked)].map(i => (
            <ItemPill key={i.id} type="button" $got={!!i.checked} aria-pressed={!!i.checked}
              onClick={() => void save(list, { ...cfOf(list), items: items.map(x => (x.id === i.id ? { ...x, checked: !x.checked } : x)) })}>
              {i.checked && <Icon name="check" size={14} strokeWidth={2} aria-hidden="true" />}
              {i.name}
            </ItemPill>
          ))}
        </Pills>
      )}
      <AddItem onSubmit={e => void add(e)}>
        <Icon name="plus" size={18} strokeWidth={1.8} aria-hidden="true" />
        <BareArea value={draft} onChange={e => setDraft(e.target.value)} placeholder="Add an item" aria-label="Add an item to the shopping list"
          onEnter={el => el.form?.requestSubmit()} />
      </AddItem>
      </>)}
      {error && <Muted role="alert" style={{ color: 'var(--color-danger)' }}>{error}</Muted>}
    </section>
  );
}

/* ── View ── */

/* A card that can be dragged by its grip (only the grip starts a drag, so the card's own controls work as usual) */
/** Cards drawn with no outline wherever they sit */
const NO_OUTLINE: ReadonlySet<SectionKey> = new Set<SectionKey>(['habits', 'time']);

function SortableCard({ id, collapsed, label, plain, open, wide, spaced, children }: { id: SectionKey; collapsed: boolean; label: string; plain?: boolean; open?: boolean; wide?: boolean; spaced?: boolean; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  // The wellness check-in: none of a card's padding or look — the box is the card, the grip inside its corner
  if (plain) return (
    <PlainCard ref={setNodeRef}
      // The wellness check-in gets extra room above and below
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1, zIndex: isDragging ? 2 : undefined, ...(spaced ? { margin: '28px 0 0' } : {}) }}>
      {children}
      <DragHandle ref={setActivatorNodeRef} type="button" aria-label={`Move ${label}`} {...attributes} {...listeners}>
        <Icon name="grip" size={18} strokeWidth={2.6} />
      </DragHandle>
    </PlainCard>
  );
  return (
    <WidgetCard ref={setNodeRef} $collapsed={collapsed} $plain={plain} $open={open} $wide={wide}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1, zIndex: isDragging ? 2 : undefined }}>
      {children}
      <DragHandle ref={setActivatorNodeRef} type="button" aria-label={`Move ${label}`} {...attributes} {...listeners}>
        <Icon name="grip" size={18} strokeWidth={2.6} />
      </DragHandle>
    </WidgetCard>
  );
}

/* A column cards can be dropped into — even when it's empty */
function DropCol({ id, items, gap, dragging, children }: { id: ColId; items: SectionKey[]; gap?: number; dragging?: boolean; children: ReactNode }) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <SortableContext id={id} items={items} strategy={verticalListSortingStrategy}>
      {/* Empty, it still takes a drop: a strip while a card is being dragged */}
      <Col ref={setNodeRef} style={{ minHeight: items.length ? undefined : dragging ? 80 : 0, gap }}>{children}</Col>
    </SortableContext>
  );
}

export function DashboardView() {
  const { isReady, isLoading } = useInitializeData();
  const ff = useEntriesStore(s => s.featureFlags);
  const quoteEntries = useEntriesStore(s => s.decryptedEntries);
  const quoteTopics = useEntriesStore(s => s.allTopics);
  // Quotes of your own (a Quote or Quotes topic, when there is one) take turns with the built-in ones
  const myQuotes = useMemo<Quote[]>(() => {
    const ids = new Set(quoteTopics.filter(t => ['quote', 'quotes'].includes(t.name.toLowerCase())).map(t => t.id));
    if (!ids.size) return [];
    return quoteEntries
      .filter(e => ids.has((e.metadata as Record<string, unknown> | undefined)?._taxonomyId as number))
      .sort((a, b) => a.id - b.id)
      .flatMap(e => parseQuoteText(stripHtml(e.content)) ?? []);
  }, [quoteEntries, quoteTopics]);
  const [config, saveConfig, configLoaded] = useEncryptedSetting<DashboardConfig>('dashboardConfig', DEFAULT_CONFIG);
  const onPhone = useMediaQuery('(max-width: 768px)');
  // The two columns' card order — live while dragging, saved on drop
  const [layout, setLayout] = useState(() => fullLayout(config.layout));
  const [dragging, setDragging] = useState(false);
  useEffect(() => { if (!dragging) setLayout(fullLayout(config.layout)); }, [config.layout, dragging]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const colOf = (id: UniqueIdentifier, l = layout): ColId | null =>
    (COLS as readonly UniqueIdentifier[]).includes(id) ? id as ColId : COLS.find(c => l[c].includes(id as SectionKey)) ?? null;
  // A card just moved to another zone settles before it can move again: moving a tall card (the
  // wellness check-in, the quote) reshapes the page under the pointer, and without this pause it
  // flipped back and forth between two zones on every render until React gave up (the page failed)
  const justMoved = useRef(0);
  // Into the other zone as soon as the card is over it
  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const now = performance.now();
    if (now - justMoved.current < 250) return;
    const from = colOf(active.id), to = colOf(over.id);
    if (!from || !to || from === to) return;
    justMoved.current = now;
    setLayout(l => {
      const from = colOf(active.id, l), to = colOf(over.id, l);
      if (!from || !to || from === to) return l;
      const key = active.id as SectionKey;
      const target = l[to].filter(k => k !== key);
      const at = over.id === to ? target.length : target.indexOf(over.id as SectionKey);
      target.splice(at < 0 ? target.length : at, 0, key);
      return { ...l, [from]: l[from].filter(k => k !== key), [to]: target };
    });
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(false);
    let next = layout;
    const col = colOf(active.id);
    if (over && col && colOf(over.id) === col && over.id !== active.id && over.id !== col) {
      const list = layout[col];
      next = { ...layout, [col]: arrayMove(list, list.indexOf(active.id as SectionKey), list.indexOf(over.id as SectionKey)) };
      setLayout(next);
    }
    const saved = fullLayout(config.layout);
    if (COLS.some(c => next[c].join() !== saved[c].join())) void saveConfig({ ...config, layout: next });
  };
  const [customizing, setCustomizing] = useState(false);
  // The buttons move into the top bar on phones and tablets
  const compactNav = useMediaQuery(NAV_COMPACT_QUERY);
  // The wallpaper stays solid down past the Quick entry's question (fixed, whatever its card holds)
  const pageRef = useRef<HTMLDivElement>(null);
  const photoEndRef = useRef<HTMLDivElement>(null);
  const [photoSolid, setPhotoSolid] = useState<number | undefined>(undefined);
  // Voice commands: only where the browser can do speech (not Firefox). One
  // tap opens the panel and starts listening (the session lives here so the
  // mic starts inside the tap)
  const voice = useVoiceSession();
  const displayName = useUIStore(s => s.displayName) ?? '';
  const { user } = useAuth();
  // Focus sounds is a preview: shown only to the accounts the server lists
  const canFocus = !!user?.previews?.includes('focus');
  const themePreference = useUIStore(s => s.themePreference);
  const setThemePreference = useUIStore(s => s.setThemePreference);
  const changeTheme = (pref: ThemePreference) => {
    if (pref === themePreference) return;
    setThemePreference(pref);
    void settingsApi.upsert('themeMode', pref).catch(() => {});
  };
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeError, setPlaceError] = useState('');
  const [homeWeather, setHomeWeather] = useState<CurrentWeather | null>(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(id); }, []);
  const medsOn = ff.medicationEnabled !== false;
  const doses = useTodayDoses(isReady && medsOn);

  /* ── Onboarding: the welcome tour on a new account's first visit, then the
     Getting started checklist (utils/onboarding; the encrypted `onboarding` setting) ── */
  const location = useLocation();
  const routerNavigate = useNavigate();
  const [onboarding, saveOnboarding, onboardingLoaded] = useEncryptedSetting<OnboardingState | null>('onboarding', null);
  const onboardingRef = useRef(onboarding);
  onboardingRef.current = onboarding;
  function markOnboarding(patch: OnboardingState) {
    const cur = onboardingRef.current ?? {};
    if (Object.entries(patch).every(([k, v]) => cur[k as keyof OnboardingState] === v)) return;
    const next = { ...cur, ...patch };
    onboardingRef.current = next;
    void saveOnboarding(next).catch(() => {});
  }
  const [tourOpen, setTourOpen] = useState(false);
  const firstRunDone = useRef(false);
  useEffect(() => {
    if (firstRunDone.current || !isReady || !onboardingLoaded) return;
    firstRunDone.current = true;
    const run = firstRun(onboarding, quoteEntries.length);
    // An account that already had entries skips it quietly
    if (run === 'existing') markOnboarding({ tourDone: true, checklistDismissed: true });
    if (run === 'tour') setTourOpen(true);
  }, [isReady, onboardingLoaded]); // eslint-disable-line react-hooks/exhaustive-deps
  // Settings → "Show the welcome tour"
  useEffect(() => {
    if (!onboardingLoaded || !(location.state as { showTour?: boolean } | null)?.showTour) return;
    setTourOpen(true);
    // A replay starts the checklist fresh
    markOnboarding({ checklistDismissed: false, ticked: [] });
    routerNavigate(location.pathname, { replace: true, state: null });
  }, [location.state, onboardingLoaded]); // eslint-disable-line react-hooks/exhaustive-deps
  const closeTour = () => { setTourOpen(false); markOnboarding({ tourDone: true }); };
  // Show me → Write your first entry: the Quick entry ringed, with its steps over it, until an entry's saved
  const [entryGuide, setEntryGuide] = useState<null | { baseline: number }>(null);
  const setFeatureFlags = useEntriesStore(s => s.setFeatureFlags);
  const { savePrivateSetting } = usePrivateSettings();
  const featureOn = (flag: string) => (flag === 'financeEnabled' || flag === 'reconcileEnabled' ? ff[flag] === true : ff[flag] !== false);
  const setFeature = (flags: string[], on: boolean) => {
    setFeatureFlags({ ...ff, ...Object.fromEntries(flags.map(f => [f, on])) });
    for (const f of flags) void savePrivateSetting(f as PrivateSettingKey, on).catch(() => {});
  };

  const places = config.places ?? NO_PLACES;
  const home = places[0];
  useEffect(() => {
    if (!home) { setHomeWeather(null); return; }
    let live = true;
    currentWeather(home).then(w => { if (live) setHomeWeather(w); }).catch(() => {});
    return () => { live = false; };
  }, [home]);

  useEffect(() => {
    const page = pageRef.current, end = photoEndRef.current;
    if (!page || !end || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const pageTop = page.getBoundingClientRect().top - page.scrollTop;
      // From the Quick entry's top (the question, then the start of its card), never its foot:
      // the card covers the photo below that, so fields coming and going never resize the photo
      const solid = end.getBoundingClientRect().top - pageTop + PHOTO_PAST_TOP;
      setPhotoSolid(prev => (prev !== undefined && Math.abs(prev - solid) < 2 ? prev : Math.round(solid)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(end);
    return () => ro.disconnect();
  });

  // Day at a glance holds the priorities and what's coming up, so the separate cards are
  // switched off once when it arrives (they can be switched back on in Theme and layout)
  useEffect(() => {
    if (!configLoaded || (config.glanceSetup && config.glanceWinsSetup && config.glanceShoppingSetup)) return;
    const moving: SectionKey[] = [...(config.glanceSetup ? [] : ['priorities', 'comingUp'] as SectionKey[]), ...(config.glanceWinsSetup ? [] : ['wins'] as SectionKey[]),
      ...(config.glanceShoppingSetup ? [] : ['shopping'] as SectionKey[])];
    const hidden = [...new Set([...(config.hidden ?? []), ...(!(config.hidden ?? []).includes('glance') ? moving : [])])];
    void saveConfig({ ...config, hidden, glanceSetup: true, glanceWinsSetup: true, glanceShoppingSetup: true }).catch(() => {});
  }, [configLoaded, config.glanceSetup, config.glanceWinsSetup, config.glanceShoppingSetup]); // eslint-disable-line react-hooks/exhaustive-deps

  // A passkey is offered only where this browser can open the journal with one.
  // Every hook sits above the early return below: these two once came after
  // it, so the loading render had fewer hooks than the ready one
  const [passkeySupported, setPasskeySupported] = useState(false);
  useEffect(() => { void passkeysAvailable().then(setPasskeySupported); }, []);

  // The daily quote (above the early return, like every hook here)
  const dailyQuote = useDailyQuote(now, myQuotes, isReady);

  if (isLoading || !isReady || !configLoaded) return (
    <ContentTemplate><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}><Spinner size={40} /></div></ContentTemplate>
  );

  // Cards off until switched on (Focus sounds); the rest are on until hidden
  const shown = (k: SectionKey) => (OFF_BY_DEFAULT.includes(k) ? (config.turnedOn ?? []).includes(k) : !(config.hidden ?? []).includes(k));
  const onboardingState = onboarding ?? {};
  const checklist = gettingStarted({ state: onboardingState, voiceSupported: voice.supported, passkeySupported });
  const entrySaved = !!entryGuide && quoteEntries.length > entryGuide.baseline;
  const toggleChecklist = (key: ChecklistKey) => markOnboarding({ ticked: toggleTicked(onboardingState, key) });
  const checklistAction = (key: ChecklistKey) => {
    // Passkeys are in Settings → Security
    if (key === 'name' || key === 'passkey') routerNavigate('/settings');
    else if (key === 'city') {
      // Customize view, down to the box where a city is typed
      setCustomizing(true);
      setTimeout(() => {
        const input = document.querySelector<HTMLInputElement>('input[aria-label="Add a city"]');
        const target = input ?? document.querySelector('[aria-label="Customize view"]');
        target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        input?.focus({ preventScroll: true });
      }, 50);
    }
    else if (key === 'entry') {
      // Ring the Quick entry and show its steps over it, the cursor in it; without one, the journal
      const box = document.querySelector<HTMLElement>('[aria-label="Quick entry"] .tiptap');
      if (!box) { routerNavigate('/journal'); return; }
      setEntryGuide({ baseline: quoteEntries.length });
      requestAnimationFrame(() => {
        document.querySelector('[aria-label="Quick entry"]')?.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        box.focus();
      });
    } else if (key === 'health') routerNavigate('/health');
    else if (key === 'voice') {
      voice.openAndListen();
      // Up to the voice panel, under the header
      requestAnimationFrame(() => document.querySelector('[aria-label="Voice command"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
    else if (key === 'recovery' && !(onboardingState.ticked ?? []).includes('recovery')) markOnboarding({ ticked: toggleTicked(onboardingState, 'recovery') });
  };
  const hd = homeWeather ? describeWeather(homeWeather.code, homeWeather.isDay) : null;
  const financeOn = ff.financeEnabled === true;
  // "Good evening, Alex" — the display name, else the username
  const helloName = displayName.trim() || user?.username?.trim() || '';
  const hello = `${helloName ? `${greeting(now)}, ${helloName}` : greeting(now)}.`;
  const { quote, step: stepQuote } = dailyQuote;
  const kitchenOn = true;

  const toggleSection = (k: SectionKey, on: boolean) => {
    if (OFF_BY_DEFAULT.includes(k)) {
      const turnedOn = (config.turnedOn ?? []).filter(x => x !== k);
      void saveConfig({ ...config, turnedOn: on ? [...turnedOn, k] : turnedOn });
      return;
    }
    void saveConfig({ ...config, hidden: on ? (config.hidden ?? []).filter(x => x !== k) : [...(config.hidden ?? []), k] });
  };
  const addPlace = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = placeQuery.trim();
    if (!q) return;
    setPlaceError('');
    try {
      const p = await findPlace(q);
      await saveConfig({ ...config, places: [...places, p].slice(0, MAX_PLACES) });
      setPlaceQuery('');
    } catch (err) {
      setPlaceError(err instanceof Error ? err.message : 'Couldn’t find that place');
    }
  };

  const left: ReactNode[] = [];
  const right: ReactNode[] = [];
  // Phones start with every card folded (their own list of opened cards); wider screens keep `collapsed`
  const openOnPhone = new Set(config.openOnPhone ?? []);
  const collapsed = new Set(onPhone ? COLS.flatMap(c => DEFAULT_LAYOUT[c]).filter(k => !openOnPhone.has(k)) : config.collapsed ?? []);
  const toggleFold = (k: SectionKey) => {
    if (onPhone) {
      void saveConfig({ ...config, openOnPhone: openOnPhone.has(k) ? [...openOnPhone].filter(x => x !== k) : [...openOnPhone, k] });
      return;
    }
    const folded = new Set(config.collapsed ?? []);
    void saveConfig({ ...config, collapsed: folded.has(k) ? [...folded].filter(x => x !== k) : [...folded, k] });
  };
  // Every draggable card: its name (for the buttons' labels), whether it's on, and what it shows
  const widgets: Partial<Record<SectionKey, { label: string; on: boolean; node: ReactNode }>> = {
    quote: {
      label: 'daily quote', on: shown('quote'),
      node: (
        <section aria-label="Daily quote">
          {/* Just the quote — no title row; it keeps clear of the grip and chevron.
              Folded, it's just its title, "Daily quote", like the other folded cards */}
          {collapsed.has('quote') && <div style={{ display: 'flex' }}><h2>Daily quote</h2></div>}
          <QuoteText>{quote.text}</QuoteText>
          {quote.author && <QuoteBy>~ {quote.author}</QuoteBy>}
          {!collapsed.has('quote') && dailyQuote.count > 1 && (
            <MantraNav>
              <button type="button" aria-label="Previous quote" onClick={() => stepQuote(-1)}>
                <Icon name="chevron-left" size={16} strokeWidth={2} />
              </button>
              <button type="button" aria-label="Next quote" onClick={() => stepQuote(1)}>
                <Icon name="chevron-right" size={16} strokeWidth={2} />
              </button>
            </MantraNav>
          )}
        </section>
      ),
    },
    // World clocks are a full-width strip under the Quick entry, not a card
    // The world clocks strip: a card of its own above Your Agenda (the head row), draggable like the others
    clocks: { label: 'world clocks', on: shown('clocks'), node: <WorldClocks strip places={places} now={now} open={!!config.clocksExpanded} onToggle={() => void saveConfig({ ...config, clocksExpanded: !config.clocksExpanded })} /> },
    // The wellness check-in sits full width above Day at a glance, not in the columns
    wellness: { label: 'wellness check-in', on: shown('wellness'), node: <WellnessCheckIn title="Wellness check-in" strip bare /> },
    // Next up, Wins and Tasks are no longer cards on the home dashboard (Wins lives in Day at a glance)
    nextUp: { label: 'next up', on: false, node: null },
    // Priorities and Wins live in Day at a glance (always on), not as cards
    priorities: { label: "today's priorities", on: false, node: null },
    wins: { label: "today's wins", on: false, node: null },
    tasks: { label: 'tasks', on: false, node: null },
    // Coming up lives in Day at a glance, not as a card
    comingUp: { label: 'coming up', on: false, node: null },
    habits: { label: 'habits', on: shown('habits'), node: <HabitsToday /> },
    // Chips to the pages used most; across both columns to start, or in either column
    shortcuts: { label: 'shortcuts', on: shown('shortcuts'), node: <Shortcuts links={config.shortcuts} onChange={next => void saveConfig({ ...config, shortcuts: next }).catch(() => {})} /> },
    // Exercise schedule and Medications are no longer on the home dashboard (Day at a glance has Meds / Move; the Health dashboard keeps both lists)
    exercise: { label: 'exercise schedule', on: false, node: null },
    quickLog: {
      label: 'quick meal log',
      on: shown('quickLog') && (ff.foodEnabled !== false || ff.exerciseEnabled !== false),
      node: <QuickLog bare meal={ff.foodEnabled !== false} exercise={ff.exerciseEnabled !== false} medication={ff.medicationEnabled !== false} />,
    },
    recent: { label: 'recent entries', on: shown('recent'), node: <RecentEntries /> },
    time: { label: 'time tracked', on: shown('time'), node: <TimeTracked /> },
    // Focus sounds: a preview, only for the accounts the server names
    focus: { label: 'focus sounds', on: shown('focus') && canFocus, node: <FocusSounds /> },
    // Mantras are no longer on the home dashboard
    mantra: { label: 'mantra', on: false, node: null },
    // The shopping list lives in Day at a glance now, not as a card
    shopping: { label: 'shopping list', on: false, node: null },
    menu: { label: 'on the menu', on: shown('menu') && kitchenOn, node: <Menu /> },
    meds: { label: 'medications', on: false, node: null },
    symptom: { label: 'log a symptom', on: shown('symptom'), node: <LogSymptom /> },
  };
  const visible = (k: SectionKey) => !!widgets[k]?.on;
  // fullLayout again at render: a card the in-memory order doesn't know yet (a new
  // card, or an order kept across a reload of the code) still shows, in its default place
  const placed = fullLayout(layout);
  const cols = { head: placed.head.filter(visible), top: placed.top.filter(visible), left: placed.left.filter(visible), right: placed.right.filter(visible), side: placed.side.filter(visible) };
  // `wide`: across both columns (the top row) — no outline
  // Habits and Time tracked: no outline wherever they sit (the panel and light shadow only)
  const card = (k: SectionKey, wide = false) => {
    const w = widgets[k]!;
    // The wellness check-in keeps its own look: moved by its grip, never folded
    if (k === 'wellness' || k === 'clocks') return <SortableCard key={k} id={k} collapsed={false} label={w.label} plain spaced={k === 'wellness'}>{w.node}</SortableCard>;
    return (
      <SortableCard key={k} id={k} collapsed={collapsed.has(k)} label={w.label} open={k !== 'quote' || collapsed.has(k)}
        wide={wide || NO_OUTLINE.has(k)}>
        {w.node}
        <FoldBtn type="button" $collapsed={collapsed.has(k)} aria-expanded={!collapsed.has(k)}
          aria-label={collapsed.has(k) ? `Show ${w.label}` : `Fold ${w.label}`} onClick={() => toggleFold(k)}>
          <Icon name="chevron-down" size={18} strokeWidth={1.8} />
        </FoldBtn>
      </SortableCard>
    );
  };
  left.push(...cols.left.map(k => card(k)));
  right.push(...cols.right.map(k => card(k)));

  // The widgets inside Your Agenda: a row across both columns, the two columns, and its third column —
  // cards drag between all four (one DndContext around the whole panel)
  const widgetColumns = (<>
    <DropCol id="top" items={cols.top} gap={32} dragging={dragging}>{cols.top.map(k => card(k, true))}</DropCol>
    <Columns $rows={Math.max(1, cols.left.length, cols.right.length)}>
      <DropCol id="left" items={cols.left} dragging={dragging}>{left}</DropCol>
      <DropCol id="right" items={cols.right} dragging={dragging}>{right}</DropCol>
    </Columns>
    {/* Stats: across both columns, at the foot of the widgets */}
    {shown('stats') && <StatsSpan><Stats meals={ff.foodEnabled !== false} meds={medsOn} exercise={ff.exerciseEnabled !== false} phoneLast={false}
      folded={collapsed.has('stats')} onToggleFold={() => toggleFold('stats')} /></StatsSpan>}
  </>);
  const sideWidgets = <DropCol id="side" items={cols.side} gap={34} dragging={dragging}>{cols.side.map(k => card(k))}</DropCol>;

  const voiceBtnLabel = voice.open ? 'Close voice commands' : 'Voice commands';

  return (
    <ContentTemplate wallpaperSolid={photoSolid}>
      <Page ref={pageRef}>
        <Inner>
          <Head>
            <DateBlock $below={!compactNav}>
              <Hello>{hello}</Hello>
            </DateBlock>
            {compactNav ? (
              <TopBarAction>
                {voice.supported && (
                  <BarBtn type="button" $on={voice.open} aria-label={voiceBtnLabel} title="Voice" aria-expanded={voice.open}
                    onClick={() => (voice.open ? voice.close() : voice.openAndListen())}>
                    <MaterialIcon $size={22} aria-hidden="true">mic</MaterialIcon>
                  </BarBtn>
                )}
                <BarBtn type="button" $on={customizing} aria-label="Theme and layout" title="Theme and layout"
                  aria-expanded={customizing} onClick={() => setCustomizing(o => !o)}>
                  <MaterialIcon $size={22} aria-hidden="true">tune</MaterialIcon>
                </BarBtn>
              </TopBarAction>
            ) : (
              <HeadActions>
                {voice.supported && (
                  <VoiceBtn type="button" $on={voice.open} aria-expanded={voice.open} onClick={() => (voice.open ? voice.close() : voice.openAndListen())}>
                    <MaterialIcon $size={20} aria-hidden="true">mic</MaterialIcon>Voice
                  </VoiceBtn>
                )}
                <ViewBtn type="button" $on={customizing} aria-label="Theme and layout" title="Theme and layout"
                  aria-expanded={customizing} onClick={() => setCustomizing(o => !o)}>
                  <MaterialIcon $size={22} aria-hidden="true">tune</MaterialIcon>
                </ViewBtn>
                {/* The reminders bell, in line with Voice and the sliders (other pages: the top-right corner) */}
                <ErrorBoundary fallback="none">
                  <NotificationBell variant="corner" trigger={({ count, ...p }) => (
                    <ViewBtn type="button" $on={p['aria-expanded']} title="Reminders" style={{ position: 'relative' }} {...p}>
                      <MaterialIcon $size={22} aria-hidden="true">notifications</MaterialIcon>
                      {count > 0 && <BellDot aria-hidden="true" $at={1} />}
                    </ViewBtn>
                  )} />
                </ErrorBoundary>
              </HeadActions>
            )}
          </Head>
          {/* Where the photo's solid part ends when the Quick entry is off */}

          {voice.open && <VoiceCommand session={voice} />}
          {tourOpen && (
            <OnboardingTour onClose={closeTour} themePreference={themePreference} onTheme={changeTheme}
              isOn={featureOn} onFeature={setFeature} />
          )}

          {customizing && (
            <Customize aria-label="Theme and layout">
              <CustomizeHead>
                <h3>Theme</h3>
                <OutlineBtn type="button" onClick={() => setCustomizing(false)}>Done</OutlineBtn>
              </CustomizeHead>
              <ThemeRow>
                <ThemeSwitch role="group" aria-label="Theme">
                  {(['light', 'dark', 'auto'] as const).map(m => (
                    <ThemeOpt key={m} type="button" $on={themePreference === m} aria-pressed={themePreference === m} onClick={() => changeTheme(m)}
                      title={m === 'auto' ? 'Light from 7 AM, dark from 7 PM' : undefined}>
                      <MaterialIcon $size={16} aria-hidden="true">{THEME_ICON[m]}</MaterialIcon>
                      {m === 'light' ? 'Light' : m === 'dark' ? 'Dark' : 'Auto'}
                    </ThemeOpt>
                  ))}
                </ThemeSwitch>
              </ThemeRow>
              <h3>Show on this page</h3>
              <ToggleGrid>
                {SECTIONS.filter(s => s.key !== 'focus' || canFocus).map(s => <label key={s.key}>{s.label}<Toggle checked={shown(s.key)} aria-label={s.label} onChange={v => toggleSection(s.key, v)} /></label>)}
                {/* Day at a glance's Coming up: bills in it or not (Finance on) */}
                {financeOn && <label>Bills in Coming up<Toggle checked={!config.comingUpHideBills} aria-label="Bills in Coming up" onChange={v => void saveConfig({ ...config, comingUpHideBills: !v })} /></label>}
              </ToggleGrid>
              <h3>Cities (the first is home)</h3>
              {places.length === 0 && <Muted style={{ marginTop: 0 }}>Add your city for the weather, then up to seven more for world clocks.</Muted>}
              {places.map((p, i) => (
                <PlaceRow key={`${p.name}-${i}`}>
                  <span>{p.name}<small>{i === 0 ? 'Home' : p.timezone.replace(/_/g, ' ')}</small></span>
                  <button type="button" aria-label={`Remove ${p.name}`} onClick={() => void saveConfig({ ...config, places: places.filter((_, j) => j !== i) })}>
                    <Icon name="x" size={14} strokeWidth={2} />
                  </button>
                </PlaceRow>
              ))}
              {places.length < MAX_PLACES && (
                <AddPlace onSubmit={e => void addPlace(e)}>
                  <input value={placeQuery} onChange={e => setPlaceQuery(e.target.value)} placeholder="Add a city, e.g. Portland, OR" aria-label="Add a city" />
                  <OutlineBtn type="submit" disabled={!placeQuery.trim()}>Add</OutlineBtn>
                </AddPlace>
              )}
              {placeError && <Muted style={{ color: 'var(--color-danger)' }}>{placeError}</Muted>}
              <Muted>Only the cities' coordinates are sent to Open-Meteo for the weather; the list itself is stored encrypted.</Muted>
            </Customize>
          )}

          {/* The Quick entry is always on: it can't be switched off */}
          {(
            <QuickWrap $guided={!!entryGuide && !entrySaved}>
              {entryGuide && (
                <EntryGuide role="status">
                  {entrySaved ? (
                    <p>Nice, your first entry is saved. You’ll find it in Journal. Tick it off in Getting started below.</p>
                  ) : (
                    <ol>
                      <li><b>Pick a topic</b> from the Journal ⌄ menu, or keep Journal for everyday notes.</li>
                      <li><b>Write your entry.</b> A line or two is plenty.</li>
                      <li><b>Press Save entry</b>, or Ctrl / ⌘ + S.</li>
                    </ol>
                  )}
                  <button type="button" onClick={() => setEntryGuide(null)}>{entrySaved ? 'Done' : 'Close'}</button>
                </EntryGuide>
              )}
              <div ref={photoEndRef}><QuickEntry /></div>
            </QuickWrap>
          )}

          {/* One drag-and-drop for every card from here down: a zone above the clocks, then Your Agenda's */}
          <DndContext sensors={sensors} collisionDetection={closestCorners}
            onDragStart={() => { setDragging(true); setLayout(l => fullLayout(l)); }} onDragOver={onDragOver} onDragEnd={onDragEnd}
            onDragCancel={() => { setDragging(false); setLayout(fullLayout(config.layout)); }}>
          {/* Under the Quick entry, full width: the world clocks to start with, and any card dragged here
              (the wellness check-in, say) — in whatever order they're dragged into */}
          <HeadZone $filled={cols.head.length > 0}>
            <DropCol id="head" items={cols.head} gap={14} dragging={dragging}>{cols.head.map(k => card(k, true))}</DropCol>
          </HeadZone>


          {/* Day at a glance (always on): the day's schedule, priorities, tasks due and what's coming up, in one panel */}
            <DayGlance financeOn={financeOn} medsOn={medsOn} exerciseOn={ff.exerciseEnabled !== false}
              weather={homeWeather && hd ? `${homeWeather.tempF}° and ${hd.label.toLowerCase()}${home ? ` in ${home.name}` : ''}` : undefined}
              side={sideWidgets}
              priorities={<Priorities compact />} wins={<Wins compact />}
              comingUp={<ComingUp compact financeOn={financeOn} showBills={!config.comingUpHideBills} />}
              widgets={widgetColumns}
              shopping={<Shopping compact show={config.shoppingShow ?? 'latest'} onShow={next => saveConfig({ ...config, shoppingShow: next }).catch(err => console.warn('Couldn’t save the Shopping list card’s choice:', err))} />} />
          </DndContext>


          {showChecklist(onboarding) && (
            <GettingStarted items={checklist} onAction={checklistAction} onToggle={toggleChecklist} onDismiss={() => markOnboarding({ checklistDismissed: true })} />
          )}




        </Inner>
      </Page>
    </ContentTemplate>
  );
}

const NO_PLACES: Place[] = [];
