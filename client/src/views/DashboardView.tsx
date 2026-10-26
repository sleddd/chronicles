import { QuickSymptomForm } from '../components/organisms/HealthQuickLog.js';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  DndContext, KeyboardSensor, PointerSensor, closestCorners, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent, type UniqueIdentifier,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { ContentTemplate } from '../components/templates/ContentTemplate.js';
import { EmptyState } from '../components/atoms/EmptyState.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { MaterialIcon } from '../components/atoms/MaterialIcon.js';
import { Icon } from '../components/atoms/core/Icon.jsx';
import { Checkbox } from '../components/atoms/core/Checkbox.jsx';
import { Toggle } from '../components/atoms/Toggle.js';
import { UnlockDialog } from '../components/organisms/UnlockDialog.js';
import { PillButton } from '../components/atoms/PillButton.js';
import { WellnessCheckIn } from '../components/organisms/WellnessCheckIn.js';
import { QuickEntry } from '../components/organisms/QuickEntry.js';
import { useInitializeData } from '../hooks/useInitializeData.js';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import { useEncryptedSetting } from '../hooks/useEncryptedSetting.js';
import { useFinance } from '../hooks/useFinance.js';
import { useOpenInJournal } from '../hooks/useOpenInJournal.js';
import { useTodayDoses } from '../hooks/useTodayDoses.js';
import { ExerciseToday, MedicationsToday } from '../components/organisms/TodayLists.js';
import { QuickLog } from '../components/organisms/HealthQuickLog.js';
import { occurrencesBetween, repeatRuleOf } from '../utils/recurrence.js';
import { useEncryption } from '../contexts/EncryptionContext.js';
import { useAuth } from '../contexts/AuthContext.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { useUIStore } from '../stores/uiStore.js';
import { entries as entriesApi, topics as topicsApi, settings as settingsApi } from '../services/api.js';
import { stripHtml, builtinEntryName } from '../utils/stripHtml.js';
import { entryTitleText } from '../utils/entryTitle.js';
import { toDateStr } from '../utils/dateUtils.js';
import { addDays, billOccurrences, formatCents } from '../utils/finance.js';
import { MENU_SLOTS, defaultShoppingListTitle, latestOpenList, menuDays } from '../utils/kitchen.js';
import { getOrCreateTopic } from '../utils/getOrCreateJournalTopic.js';
import { prioritiesTitle } from '../utils/entrySave.js';
import type { ThemePreference } from '../utils/autoTheme.js';
import { dailyQuote, greeting, parseQuoteText, type Quote } from '../utils/dailyQuote.js';
import { currentWeather, describeWeather, findPlace, hoursFromLocal, type CurrentWeather, type Place } from '../utils/weather.js';
import type { DecryptedPost } from '@shared/crypto/types';
import type { ShoppingItem } from '../types/fields.js';
import type { PriorityItem } from '../components/molecules/fields/PrioritiesFields.js';

/* The home dashboard (/dashboard — not the default page; the journal is home):
   the date and home weather over the greeting and a Light | Dark switch; the
   daily quote (or, with the quote off, a "Next up" card of the next medication
   doses) beside the wellness check-in; a one-line world-clocks strip ("All N
   cities" opens the grid); then two columns — Today's priorities and Coming
   up | On the menu, Medications and the shopping list. "Customize view" picks
   the sections and the cities (kept in the encrypted `dashboardConfig`
   setting). */

/* ── Config ── */

type SectionKey = 'quickEntry' | 'nextUp' | 'wellness' | 'clocks' | 'quote' | 'priorities' | 'comingUp' | 'exercise' | 'recent' | 'symptom' | 'menu' | 'meds' | 'shopping' | 'quickLog';

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'quickEntry', label: 'Quick entry' },
  { key: 'nextUp', label: 'Next event or meeting (when the quote is off)' },
  { key: 'wellness', label: 'Wellness check-in' },
  { key: 'clocks', label: 'World clocks & weather' },
  { key: 'quote', label: 'Quote of the day' },
  { key: 'priorities', label: "Today's priorities" },
  { key: 'comingUp', label: 'Coming up' },
  { key: 'exercise', label: 'Exercise schedule' },
  { key: 'quickLog', label: 'Quick meal log' },
  { key: 'symptom', label: 'Log a symptom' },
  { key: 'menu', label: 'On the menu' },
  { key: 'meds', label: 'Medications' },
  { key: 'recent', label: 'Recent entries' },
  { key: 'shopping', label: 'Shopping list' },
];

interface DashboardConfig {
  hidden: SectionKey[];
  /** The first is home: its weather is in the greeting and it's marked Local */
  places: Place[];
  /** The full world-clock grid is open under the one-line strip */
  clocksExpanded?: boolean;
  /** Cards folded down to their title row */
  collapsed?: SectionKey[];
  /** Phones: every card starts folded — these are the ones opened there */
  openOnPhone?: SectionKey[];
  /** The two columns' cards, top to bottom, as dragged into place */
  layout?: { left: SectionKey[]; right: SectionKey[] };
}

/** The cards that can be dragged between the two columns, and where they start */
const DEFAULT_LAYOUT: { left: SectionKey[]; right: SectionKey[] } = {
  left: ['priorities', 'comingUp', 'quickLog', 'exercise'],
  right: ['recent', 'shopping', 'menu', 'meds', 'symptom'],
};

/** The saved layout with any card it doesn't know put back in its default column */
function fullLayout(saved?: { left: SectionKey[]; right: SectionKey[] }): { left: SectionKey[]; right: SectionKey[] } {
  const all = [...DEFAULT_LAYOUT.left, ...DEFAULT_LAYOUT.right];
  const left = (saved?.left ?? DEFAULT_LAYOUT.left).filter(k => all.includes(k));
  const right = (saved?.right ?? DEFAULT_LAYOUT.right).filter(k => all.includes(k) && !left.includes(k));
  for (const k of DEFAULT_LAYOUT.left) if (!left.includes(k) && !right.includes(k)) left.push(k);
  for (const k of DEFAULT_LAYOUT.right) if (!left.includes(k) && !right.includes(k)) right.push(k);
  return { left, right };
}

const DEFAULT_CONFIG: DashboardConfig = { hidden: [], places: [] };

/* ── Layout ── */

const Page = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
`;

const Inner = styled.div`
  width: 100%;
  max-width: 1150px;
  margin: 0 auto;
  padding: 56px 24px 64px;
  @media (max-width: 768px) { padding: 34px 16px 48px; }
`;

const Head = styled.div`
  margin-top: 8px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px 40px;
  @media (max-width: 640px) { grid-template-columns: minmax(0, 1fr); }
`;

/* "Good evening, Alex" over "Saturday, October 17 · 55° and clear in Portland" */
const DateBlock = styled.div`
  min-width: 0;
`;

const Eyebrow = styled.div`
  margin-top: 6px;
  /* In a touch, so it lines up under the greeting's first letter */
  padding-left: 12px;
  font-family: var(--font-sans);
  font-size: 15px;
  font-style: italic;
  color: var(--text-muted);
`;

const Hello = styled.h1`
  margin: 0;
  font-family: var(--font-display);
  font-size: 56px;
  font-weight: 200; /* the view titles' weight */
  line-height: 1.1;
  color: var(--text-primary);
  text-wrap: balance;
  @media (max-width: 480px) { font-size: 38px; }
`;

/* Light | Dark (an outlined pair, the chosen one on the grey --bg-active) beside
   a neutral "Customize view" pill */
const HeadActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  @media (max-width: 640px) { padding: 24px 0 0; margin-bottom: 12px; }
`;

/* Customize view: the neutral pill, in sentence case at normal spacing (both themes) */
const CustomizeBtn = styled(PillButton)`
  && { text-transform: none; letter-spacing: normal; font-size: 14px; font-weight: 500; }
  /* A light grey outline and no fill, like the theme switch beside it */
  &&& { border-color: var(--border-card); background: transparent; }
  &&&:hover:not(:disabled) { border-color: var(--border-strong); }
`;

const ThemeSwitch = styled.div`
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--border-card);
  border-radius: 10px;
`;

const ThemeOpt = styled.button<{ $on: boolean }>`
  height: 32px;
  padding: 0 16px;
  border: none;
  border-radius: 7px;
  background: ${({ $on }) => ($on ? 'var(--bg-active)' : 'transparent')};
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: ${({ $on }) => ($on ? 600 : 400)};
  color: ${({ $on }) => ($on ? 'var(--text-primary)' : 'var(--text-soft)')};
  cursor: pointer;
  &:hover { color: var(--text-primary); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

const LinkBtn = styled.button`
  padding: 0;
  border: none;
  background: none;
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: 600;
  color: var(--color-accent-link);
  cursor: pointer;
  white-space: nowrap;
  &:hover { text-decoration: underline; }
`;

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
const QuickWrap = styled.div`
  margin-top: 56px;
  @media (max-width: 640px) { margin-top: 36px; }
`;

const Hero = styled.div<{ $single: boolean; $afterQuick?: boolean }>`
  display: grid;
  grid-template-columns: ${({ $single }) => ($single ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))')};
  gap: 24px;
  margin-top: ${({ $afterQuick }) => ($afterQuick ? '40px' : '56px')};
  /* A little air before the world clocks / the columns */
  margin-bottom: 28px;
  @media (max-width: 640px) { margin-top: ${({ $afterQuick }) => ($afterQuick ? '32px' : '36px')}; }
  @media (max-width: 900px) { grid-template-columns: minmax(0, 1fr); }
`;

const NextCard = styled.section`
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 28px 32px;
  border-radius: 14px;
  background: var(--bg-panel);
  font-family: var(--font-sans);
  @media (max-width: 480px) { padding: 22px 20px; }
`;

const NextTop = styled.div<{ $plain?: boolean }>`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 15px;
  /* $plain (Daily quote): a quiet grey label at 400 instead of the bold accent */
  b { font-weight: ${({ $plain }) => ($plain ? 400 : 600)}; color: ${({ $plain }) => ($plain ? 'var(--text-muted)' : 'var(--color-accent-link)')}; }
  span { color: var(--text-muted); }
`;

const NextTitle = styled.h2`
  margin: 22px 0 0;
  font-family: var(--font-display);
  font-size: 30px;
  font-weight: 300;
  line-height: 1.2;
  color: var(--text-primary);
`;

const NextList = styled.p`
  margin: 16px 0 0;
  font-size: 16px;
  line-height: 1.5;
  color: var(--text-soft);
`;

const NextActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: auto;
  padding-top: 24px;
`;

/* World clocks: a one-line strip in a grey --bg-panel card (home first, in the accent,
   then the others as many as fit); "All N cities" opens the grid of city tiles — four across, wrapping */
const MAX_PLACES = 8;

const Clocks = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  padding: 28px 0 32px;
  border-top: 1px solid var(--border-card); /* splits the open grid from the strip */
  @media (max-width: 900px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
`;

const ClocksSection = styled.section`
  margin-top: 32px;
  padding: 0 24px;
  border-radius: 14px;
  background: var(--bg-panel);
  @media (max-width: 480px) { padding: 0 16px; }
`;

const Strip = styled.div`
  display: flex;
  align-items: center;
  gap: 40px;
  min-height: 64px;
  font-family: var(--font-sans);
  font-size: 16px;
  & > b { flex: none; font-weight: 500; color: var(--text-primary); }
  @media (max-width: 640px) { gap: 20px; }
`;

const StripCities = styled.div`
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 32px;
  height: 24px;
  line-height: 24px;
  overflow: hidden;
  min-width: 0;
`;

const StripCity = styled.span<{ $home?: boolean }>`
  white-space: nowrap;
  color: ${({ $home }) => ($home ? 'var(--color-accent-link)' : 'var(--text-muted)')};
  strong { margin-left: 10px; font-weight: 500; color: var(--text-primary); }
  small { margin-left: 8px; font-size: 14px; color: var(--text-hint); }
`;

/* Each city in the open grid is its own filled tile on the grey panel */
const Clock = styled.div`
  min-width: 0;
  padding: 16px 18px;
  border-radius: 10px;
  background: var(--bg-tile);
  /* Light: --bg-tile is nearly the panel's grey — white tiles read instead */
  html[data-theme='light'] & { background: var(--bg-control, var(--bg-app)); }
`;

const ClockHead = styled.div<{ $home: boolean }>`
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-family: var(--font-sans);
  font-size: 14px;
  b { font-weight: 500; color: ${({ $home }) => ($home ? 'var(--color-accent-link)' : 'var(--text-muted)')}; }
  span { color: var(--text-muted); }
`;

const ClockTime = styled.div`
  margin: 14px 0 12px;
  font-family: var(--font-display);
  font-size: 40px;
  font-weight: 300;
  line-height: 1;
  color: var(--text-secondary);
  small { margin-left: 6px; font-family: var(--font-sans); font-size: 14px; color: var(--text-muted); }
`;

const ClockWeather = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-soft);
  & > span:first-child { color: var(--color-accent); }
  /* "58°F · Clear" in light italics (not the icon, which would slant) */
  & > span:last-child { font-style: italic; font-weight: 300; letter-spacing: 0.02em; }
`;

/* Daily quote: in the Next up card's place (the grey panel) when it's on */
/* The quote and its author as one block, centred vertically in the card,
   left-aligned */
/* The daily quote's card: roomier top and a narrower right side so the
   quote isn't squeezed; a wider right side on desktop */
const QuoteCard = styled(NextCard)`
  padding-top: 36px;
  padding-right: 24px;
  @media (min-width: 901px) { padding-right: 40px; }
`;

const QuoteBody = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  /* Just under the "Daily quote" label, not centred in the card */
  justify-content: flex-start;
  align-items: flex-start;
  text-align: left;
  padding: 36px 0 8px;
  @media (min-width: 901px) { padding-top: 44px; }
`;

const QuoteText = styled.blockquote`
  margin: 0;
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 300;
  font-style: italic;
  line-height: 1.35;
  color: var(--text-primary);
  @media (max-width: 480px) { font-size: 19px; }
`;

const QuoteBy = styled.p`
  margin: 16px 0 0;
  font-size: 15px;
  color: var(--text-muted);
  @media (min-width: 901px) { margin-top: 22px; }
`;

const Columns = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px;
  /* The same 24px under the world clocks (or the cards above) as between cards */
  margin-top: 24px;
  align-items: start;
  @media (max-width: 900px) { grid-template-columns: minmax(0, 1fr); }
`;

const Col = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-width: 0;
`;

/* Each section in the two columns sits in its own grey card, like Next up and the
   quote, with a chevron on the right that folds it down to its title row */
const WidgetCard = styled.div<{ $collapsed: boolean }>`
  position: relative;
  min-width: 0;
  padding: 28px 92px 28px 32px;
  border-radius: 14px;
  background: var(--bg-panel);
  @media (max-width: 480px) { padding: 22px 76px 22px 20px; }
  /* The title row is the chevron's 30px tall, its link centred, so the link and chevron line up */
  & > section > :first-child { align-items: center; }
  /* The same room between every title row and the card's content */
  && > section > :first-child { margin-bottom: 16px; }
  /* Titles in the Daily quote label's style: 15px Open Sans, 400, grey */
  & > section > :first-child h2 {
    line-height: 30px;
    font-family: var(--font-sans);
    font-size: 15px;
    font-weight: 400;
    color: var(--text-muted);
  }
  ${({ $collapsed }) => ($collapsed ? `
    padding-top: 14px;
    padding-bottom: 14px;
    & > section > :not(:first-child) { display: none; }
    && > section > :first-child { padding-bottom: 0; margin-bottom: 0; border-bottom: none; }
    /* Grip and chevron centred on the folded card's one row */
    & > button { top: 50% !important; transform: translateY(-50%); }
  ` : '')}
`;

/* The grip to drag a card by, just left of its fold chevron */
const DragHandle = styled.button`
  position: absolute;
  top: 28px;
  right: 54px;
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
  &:hover { color: var(--text-muted); background: var(--bg-row-hover); }
  &:active { cursor: grabbing; }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  @media (max-width: 480px) { top: 22px; right: 44px; }
`;

const FoldBtn = styled.button<{ $collapsed: boolean }>`
  position: absolute;
  top: 28px;
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
  &:hover { color: var(--text-primary); background: var(--bg-row-hover); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  @media (max-width: 480px) { top: 22px; right: 14px; }
`;

const SectionHead = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-subtle);
  h2 { margin: 0; font-family: var(--font-display); font-size: 22px; font-weight: 300; color: var(--text-secondary); }
  span { font-family: var(--font-sans); font-size: 13px; color: var(--text-muted); }
  button { padding: 0; border: none; background: none; font-family: var(--font-sans); font-size: 14px; font-weight: 500; color: var(--color-accent-link); cursor: pointer; }
  button:hover { text-decoration: underline; }
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

/** Save an entry's custom fields (optimistic; rolled back on failure). */
function useSaveFields() {
  const { encryptPost, encryptNewPost } = useEncryption();
  const updateDecryptedEntry = useEntriesStore(s => s.updateDecryptedEntry);
  return async (entry: DecryptedPost, cf: Record<string, unknown>, content = entry.content) => {
    const prev = { content: entry.content, metadata: entry.metadata };
    const metadata: Record<string, unknown> = { ...((entry.metadata as Record<string, unknown>) ?? {}), _customFields: cf };
    updateDecryptedEntry(entry.id, { content, metadata });
    try {
      const tid = metadata._taxonomyId as number | undefined;
      const enc = await encryptPost(entry.id, content, metadata);
      await entriesApi.update(entry.id, {
        contentEncrypted: enc.contentEncrypted, contentIv: enc.contentIv,
        metadataEncrypted: enc.metadataEncrypted, metadataIv: enc.metadataIv,
        taxonomyIds: tid ? [tid] : [],
      });
    } catch (err) {
      console.error('Dashboard save failed:', err);
      updateDecryptedEntry(entry.id, prev);
    }
  };
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

function WorldClocks({ places, now, open, onToggle }: { places: Place[]; now: Date; open: boolean; onToggle: () => void }) {
  const [weather, setWeather] = useState<Record<string, CurrentWeather>>({});
  useEffect(() => {
    let live = true;
    for (const p of places) {
      currentWeather(p).then(w => { if (live) setWeather(prev => ({ ...prev, [p.name]: w })); }).catch(() => {});
    }
    return () => { live = false; };
  }, [places]);

  return (
    <ClocksSection aria-label="World clocks">
      <Strip>
        <b>World clocks</b>
        <StripCities>
          {places.slice(0, MAX_PLACES).map((p, i) => {
            const [t, ampm] = clockParts(p.timezone, now);
            const w = weather[p.name];
            return (
              <StripCity key={`${p.name}-${i}`} $home={i === 0}>
                {p.name}<strong>{t} {ampm}</strong>{w && <small>{w.tempF}°</small>}
              </StripCity>
            );
          })}
        </StripCities>
        <LinkBtn type="button" aria-expanded={open} onClick={onToggle}>
          {open ? 'Show less' : `All ${places.length} ${places.length === 1 ? 'city' : 'cities'}`}
        </LinkBtn>
      </Strip>
      {open && (
        <Clocks>
          {places.slice(0, MAX_PLACES).map((p, i) => {
            const [t, ampm] = clockParts(p.timezone, now);
            const diff = hoursFromLocal(p.timezone, now);
            const w = weather[p.name];
            const d = w ? describeWeather(w.code, w.isDay) : null;
            return (
              <Clock key={`${p.name}-${i}`}>
                <ClockHead $home={i === 0}><b>{p.name}</b><span>{diff === 0 ? 'Local' : `${diff > 0 ? '+' : ''}${diff}h`}</span></ClockHead>
                <ClockTime>{t}<small>{ampm}</small></ClockTime>
                <ClockWeather>
                  {d ? <><MaterialIcon $size={18} aria-hidden="true">{d.icon}</MaterialIcon><span>{w!.tempF}°F · {d.label}</span></> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                </ClockWeather>
              </Clock>
            );
          })}
        </Clocks>
      )}
    </ClocksSection>
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
      <NextTop><b>Next up</b></NextTop>
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
      <NextTop><b>{when}</b><span>{next.time ? time12(next.time) : 'All day'}</span></NextTop>
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

/* A priority's text, edited in place (no box); done = muted + struck */
const PText = styled.input<{ $done?: boolean }>`
  && {
    flex: 1;
    min-width: 0;
    padding: 0;
    border: none !important;
    background: transparent !important;
    outline: none;
    font-family: var(--font-sans);
    font-size: 16px;
    text-overflow: ellipsis;
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

/** One priority's text: edited in place, saved on Enter or leaving the field;
 *  clearing it removes the priority. Escape puts the saved text back. */
function PriorityText({ item, onCommit }: { item: PriorityItem; onCommit: (text: string) => void }) {
  const [text, setText] = useState(item.text);
  useEffect(() => { setText(item.text); }, [item.text]);
  const commit = () => { if (text.trim() !== item.text) onCommit(text.trim()); };
  return (
    <PText $done={item.done} value={text} aria-label={`Priority: ${item.text}`}
      onChange={e => setText(e.target.value)} onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
        if (e.key === 'Escape') { setText(item.text); requestAnimationFrame(() => (e.target as HTMLInputElement).blur()); }
      }} />
  );
}


/* "Add a priority": a standard outlined text box (the border on the box — inputs are flat app-wide) */
const AddBox = styled.label`
  display: flex;
  align-items: center;
  height: 48px;
  padding: 0 16px;
  border: 1px solid var(--border-card);
  border-radius: 10px;
  cursor: text;
  &:focus-within { border-color: var(--color-accent); }
`;

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

/** The newest Priorities-topic entry and its items. Not tied to today — the
 *  list carries over midnight and stays until items are ticked or removed. */
function usePriorities() {
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const tid = topicIdByName(allTopics, 'priorities');
  const entry = useMemo(() => {
    if (tid === undefined) return undefined;
    const time = (e: DecryptedPost) => new Date(e.createdAt).getTime();
    return entries
      .filter(e => (e.metadata as Record<string, unknown>)?._taxonomyId === tid)
      .reduce<DecryptedPost | undefined>((best, e) => (!best || time(e) > time(best) ? e : best), undefined);
  }, [entries, tid]);
  const items = ((entry ? cfOf(entry).priorities : undefined) as PriorityItem[] | undefined) ?? [];
  return { entry, items, tid };
}

function Priorities() {
  const setTopics = useEntriesStore(s => s.setTopics);
  const addDecryptedEntry = useEntriesStore(s => s.addDecryptedEntry);
  const { encryptPost, encryptNewPost } = useEncryption();
  const save = useSaveFields();
  const [draft, setDraft] = useState('');
  const { entry, items, tid } = usePriorities();
  const [starting, setStarting] = useState(false);
  // The entry's title: "Priorities: 10/18/2026" — the list's own date
  const textOf = (date = new Date()) => `<p>${prioritiesTitle(date)}</p>`;

  const write = async (next: PriorityItem[]) => {
    if (entry) return save(entry, { ...cfOf(entry), priorities: next }, textOf(new Date(entry.createdAt)));
    return create(next);
  };

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

  // New list: starts an empty one; the old list stays in the journal
  const startNew = async () => {
    setStarting(true);
    try { await create([]); } catch (err) { console.error('New priorities list failed:', err); }
    finally { setStarting(false); }
  };

  const add = () => {
    const text = draft.trim();
    if (!text || items.length >= 5) return;
    setDraft('');
    void write([...items, { id: crypto.randomUUID(), text, done: false }]);
  };

  return (
    <section aria-label="Today's priorities">
      <SectionHead>
        <h2>Today's priorities</h2>
        {items.length > 0 && (
          <button type="button" disabled={starting} onClick={() => void startNew()}>New list</button>
        )}
      </SectionHead>
      {items.map((p, i) => (
        <Row key={p.id}>
          <PNum>{i + 1}</PNum>
          <PriorityText item={p}
            onCommit={text => void write(text ? items.map(x => (x.id === p.id ? { ...x, text } : x)) : items.filter(x => x.id !== p.id))} />
          <PRemove type="button" aria-label={`Remove "${p.text}"`} title="Remove"
            onClick={() => void write(items.filter(x => x.id !== p.id))}>
            <Icon name="x" size={14} strokeWidth={2} />
          </PRemove>
          <Checkbox checked={p.done} aria-label={p.done ? `Mark "${p.text}" not done` : `Mark "${p.text}" done`}
            onChange={() => void write(items.map(x => (x.id === p.id ? { ...x, done: !x.done } : x)))} />
        </Row>
      ))}
      {items.length < 5 && (
        <AddBox style={items.length ? { marginTop: 12 } : undefined}>
          <BareInput value={draft} placeholder="Add a priority" aria-label="Add a priority"
            onChange={e => setDraft(e.target.value)} onBlur={add}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        </AddBox>
      )}
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
   in Next up and Medications, not here). The kind is a plain label in its colour
   (no fill, no outline). */
type UpKind = 'event' | 'meeting' | 'bill';
const KindPill = styled.span<{ $kind: UpKind }>`
  flex: none;
  padding: 3px 0 3px 10px;
  font-size: 13px;
  font-weight: 500;
  color: ${({ $kind }) => `color-mix(in srgb, ${KIND_COLOR[$kind]} 62%, var(--text-primary))`};
`;
const KIND_COLOR: Record<UpKind, string> = { event: 'var(--chart-blue)', meeting: 'var(--chart-violet)', bill: 'var(--chart-amber)' };
const KIND_LABEL: Record<UpKind, string> = { event: 'Event', meeting: 'Meeting', bill: 'Bill' };

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

function ComingUp({ financeOn }: { financeOn: boolean }) {
  const navigate = useNavigate();
  const openInJournal = useOpenInJournal();
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const bills = useFinance('bills', { enabled: financeOn });
  const today = toDateStr(new Date());
  const end = addDays(today, 14);

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
      const days = occurrencesBetween(String(cf.startDate ?? ''), repeatRuleOf(cf), today, end);
      if (!days.length) continue;
      const title = (builtinEntryName(cf) || stripHtml(e.content).trim()).slice(0, 80) || 'Untitled';
      const sub = [cf.location, kind === 'meeting' ? cf.meetingTopic : undefined].filter(v => typeof v === 'string' && v.trim()).join(' · ');
      for (const day of days) {
        out.push({ key: `e${e.id}-${day}`, day, time: cf.allDay ? undefined : (cf.startTime as string | undefined) || undefined, title, sub: sub || undefined, kind, open: () => openInJournal(e.id) });
      }
    }
    if (financeOn) {
      for (const { bill, date } of billOccurrences(bills.records, today, end)) {
        out.push({ key: `b${bill.id}${date}`, day: date, title: bill.name, sub: `${formatCents(bill.amountCents)} due`, kind: 'bill', open: () => navigate('/finance') });
      }
    }
    return out.sort((a, b) => a.day.localeCompare(b.day) || (a.time ?? '99').localeCompare(b.time ?? '99')).slice(0, 8);
  }, [entries, allTopics, bills.records, financeOn, today, end, openInJournal, navigate]);

  return (
    <section aria-label="Coming up">
      <SectionHead><h2>Coming up</h2><button type="button" onClick={() => navigate('/calendar')}>Calendar</button></SectionHead>
      {items.length === 0 ? <Muted>Nothing in the next two weeks.</Muted> : items.map(it => (
        <UpRow key={it.key}>
          <span className="when">{whenLabel(it.day, it.time, today)}</span>
          <span className="what" role="button" tabIndex={0} onClick={it.open} onKeyDown={e => { if (e.key === 'Enter') it.open(); }}>
            {it.title}{it.sub && <small>{it.sub}</small>}
          </span>
          <KindPill $kind={it.kind}>{KIND_LABEL[it.kind]}</KindPill>
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
`;

/* Add an item: an outlined pill with a + — Enter adds */
const AddItem = styled.form`
  background: var(--bg-control, transparent);
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 20px;
  height: 44px;
  padding: 0 20px;
  border: 1px solid var(--border-pill, var(--border-card));
  border-radius: var(--r-full, 999px);
  color: var(--text-muted); /* the + */
  &:focus-within { border-color: var(--color-accent); }
`;

function Shopping() {
  const navigate = useNavigate();
  const openInJournal = useOpenInJournal();
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const addDecryptedEntry = useEntriesStore(s => s.addDecryptedEntry);
  const { encryptPost, encryptNewPost } = useEncryption();
  const save = useSaveFields();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const list = useMemo(() => latestOpenList(entries, topicIdByName(allTopics, 'shopping list', 'shopping lists')), [entries, allTopics]);
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
      const topicId = await getOrCreateTopic('Shopping List', 'cart-shopping');
      const content = `<p>${defaultShoppingListTitle()}</p>`;
      const metadata = { _taxonomyId: topicId, _customFields: { items: [item], notes: '', linkedRecipeIds: [] } };
      const enc = await encryptNewPost(content, metadata);
      const res = await entriesApi.create({ id: enc.id,
        contentEncrypted: enc.contentEncrypted, contentIv: enc.contentIv,
        metadataEncrypted: enc.metadataEncrypted, metadataIv: enc.metadataIv,
        isEncrypted: true, taxonomyIds: [topicId],
      });
      addDecryptedEntry({ id: res.id as number, content, metadata, isEncrypted: true,
        createdAt: new Date(res.createdAt as string), updatedAt: new Date((res.updatedAt || res.createdAt) as string) });
    } catch (err) {
      console.error('Shopping list create failed:', err);
      setDraft(name);
      setError('That item didn’t save — try again.');
    }
  };

  return (
    <section aria-label="Shopping list">
      <SectionHead>
        <h2>Shopping list</h2>
        {list ? (
          // The full list in the journal editor — rename, remove items, notes…
          <button type="button" onClick={() => openInJournal(list.id)}>Open list</button>
        ) : <button type="button" onClick={() => navigate('/shopping')}>Lists</button>}
      </SectionHead>
      {!list ? <Muted>No open shopping list — add an item to start one.</Muted> : items.length === 0 ? <Muted>No items yet.</Muted> : (
        <Pills>
          {[...items.filter(i => !i.checked), ...items.filter(i => i.checked)].map(i => (
            <ItemPill key={i.id} type="button" $got={!!i.checked} aria-pressed={!!i.checked}
              onClick={() => void save(list, { ...cfOf(list), items: items.map(x => (x.id === i.id ? { ...x, checked: !x.checked } : x)) })}>
              {i.name}
            </ItemPill>
          ))}
        </Pills>
      )}
      <AddItem onSubmit={e => void add(e)}>
        <Icon name="plus" size={18} strokeWidth={1.8} aria-hidden="true" />
        <BareInput value={draft} onChange={e => setDraft(e.target.value)} placeholder="Add an item" aria-label="Add an item to the shopping list" />
      </AddItem>
      {error && <Muted role="alert" style={{ color: 'var(--color-danger)' }}>{error}</Muted>}
    </section>
  );
}

/* ── View ── */

/* A card that can be dragged by its grip (only the grip starts a drag, so the card's own controls work as usual) */
function SortableCard({ id, collapsed, label, children }: { id: SectionKey; collapsed: boolean; label: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <WidgetCard ref={setNodeRef} $collapsed={collapsed}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1, zIndex: isDragging ? 2 : undefined }}>
      {children}
      <DragHandle ref={setActivatorNodeRef} type="button" aria-label={`Move ${label}`} {...attributes} {...listeners}>
        <Icon name="grip" size={18} strokeWidth={2.6} />
      </DragHandle>
    </WidgetCard>
  );
}

/* A column cards can be dropped into — even when it's empty */
function DropCol({ id, items, children }: { id: 'left' | 'right'; items: SectionKey[]; children: ReactNode }) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <SortableContext id={id} items={items} strategy={verticalListSortingStrategy}>
      <Col ref={setNodeRef} style={{ minHeight: 80 }}>{children}</Col>
    </SortableContext>
  );
}

export function DashboardView() {
  const { isReady, isLoading, needsUnlock, handleUnlock } = useInitializeData();
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
  const colOf = (id: UniqueIdentifier, l = layout): 'left' | 'right' | null =>
    id === 'left' || id === 'right' ? id : l.left.includes(id as SectionKey) ? 'left' : l.right.includes(id as SectionKey) ? 'right' : null;
  // Into the other column as soon as the card is over it
  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
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
    if (next.left.join() !== saved.left.join() || next.right.join() !== saved.right.join()) void saveConfig({ ...config, layout: next });
  };
  const [customizing, setCustomizing] = useState(false);
  const displayName = useUIStore(s => s.displayName) ?? '';
  const { user } = useAuth();
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

  const places = config.places ?? NO_PLACES;
  const home = places[0];
  useEffect(() => {
    if (!home) { setHomeWeather(null); return; }
    let live = true;
    currentWeather(home).then(w => { if (live) setHomeWeather(w); }).catch(() => {});
    return () => { live = false; };
  }, [home]);

  if (needsUnlock) return (
    <>
      <ContentTemplate><EmptyState message="Unlock your journal to continue" /></ContentTemplate>
      <UnlockDialog onUnlock={handleUnlock} />
    </>
  );
  if (isLoading || !isReady || !configLoaded) return (
    <ContentTemplate><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}><Spinner size={40} /></div></ContentTemplate>
  );

  const shown = (k: SectionKey) => !(config.hidden ?? []).includes(k);
  const hd = homeWeather ? describeWeather(homeWeather.code, homeWeather.isDay) : null;
  const eyebrow = [
    now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
    homeWeather && hd && home ? `${homeWeather.tempF}° and ${hd.label.toLowerCase()} in ${home.name}` : null,
  ].filter(Boolean).join(' · ');
  const financeOn = ff.financeEnabled === true;
  // "Good evening, Alex" — the display name, else the username
  const helloName = displayName.trim() || user?.username?.trim() || '';
  const hello = helloName ? `${greeting(now)}, ${helloName}` : greeting(now);
  const quote = dailyQuote(now, myQuotes);
  const kitchenOn = true;

  const toggleSection = (k: SectionKey, on: boolean) =>
    void saveConfig({ ...config, hidden: on ? (config.hidden ?? []).filter(x => x !== k) : [...(config.hidden ?? []), k] });
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

  // The card beside the wellness check-in: the daily quote when it's on, else Next up (medications)
  const lead = shown('quote') ? (
    <QuoteCard aria-label="Daily quote">
      <NextTop $plain><b>Daily quote</b></NextTop>
      <QuoteBody>
        <QuoteText>{quote.text}</QuoteText>
        {quote.author && <QuoteBy>~ {quote.author}</QuoteBy>}
      </QuoteBody>
    </QuoteCard>
  ) : shown('nextUp') ? <NextUp now={now} /> : null;

  const left: ReactNode[] = [];
  const right: ReactNode[] = [];
  // Phones start with every card folded (their own list of opened cards); wider screens keep `collapsed`
  const openOnPhone = new Set(config.openOnPhone ?? []);
  const collapsed = new Set(onPhone ? [...DEFAULT_LAYOUT.left, ...DEFAULT_LAYOUT.right].filter(k => !openOnPhone.has(k)) : config.collapsed ?? []);
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
    priorities: { label: "today's priorities", on: shown('priorities'), node: <Priorities /> },
    comingUp: { label: 'coming up', on: shown('comingUp'), node: <ComingUp financeOn={financeOn} /> },
    exercise: { label: 'exercise schedule', on: shown('exercise') && ff.exerciseEnabled !== false, node: <ExerciseToday /> },
    quickLog: {
      label: 'quick meal log',
      on: shown('quickLog') && (ff.foodEnabled !== false || ff.exerciseEnabled !== false),
      node: <QuickLog bare meal={ff.foodEnabled !== false} exercise={ff.exerciseEnabled !== false} />,
    },
    recent: { label: 'recent entries', on: shown('recent'), node: <RecentEntries /> },
    shopping: { label: 'shopping list', on: shown('shopping'), node: <Shopping /> },
    menu: { label: 'on the menu', on: shown('menu') && kitchenOn, node: <Menu /> },
    meds: { label: 'medications', on: shown('meds') && medsOn, node: <MedicationsToday doses={doses} /> },
    symptom: { label: 'log a symptom', on: shown('symptom'), node: <LogSymptom /> },
  };
  const visible = (k: SectionKey) => !!widgets[k]?.on;
  const cols = { left: layout.left.filter(visible), right: layout.right.filter(visible) };
  const card = (k: SectionKey) => {
    const w = widgets[k]!;
    return (
      <SortableCard key={k} id={k} collapsed={collapsed.has(k)} label={w.label}>
        {w.node}
        <FoldBtn type="button" $collapsed={collapsed.has(k)} aria-expanded={!collapsed.has(k)}
          aria-label={collapsed.has(k) ? `Show ${w.label}` : `Fold ${w.label}`} onClick={() => toggleFold(k)}>
          <Icon name="chevron-down" size={18} strokeWidth={1.8} />
        </FoldBtn>
      </SortableCard>
    );
  };
  left.push(...cols.left.map(card));
  right.push(...cols.right.map(card));

  return (
    <ContentTemplate>
      <Page>
        <Inner>
          <Head>
            <DateBlock>
              <Hello>{hello}</Hello>
              <Eyebrow>{eyebrow}</Eyebrow>
            </DateBlock>
            <HeadActions>
              <ThemeSwitch role="group" aria-label="Theme">
                {(['light', 'dark', 'auto'] as const).map(m => (
                  <ThemeOpt key={m} type="button" $on={themePreference === m} aria-pressed={themePreference === m} onClick={() => changeTheme(m)}
                    title={m === 'auto' ? 'Light from 7 AM, dark from 7 PM' : undefined}>
                    {m === 'light' ? 'Light' : m === 'dark' ? 'Dark' : 'Auto'}
                  </ThemeOpt>
                ))}
              </ThemeSwitch>
              <CustomizeBtn type="button" $variant="neutral" aria-expanded={customizing} onClick={() => setCustomizing(c => !c)}>
                {customizing ? 'Done' : 'Customize view'}
              </CustomizeBtn>
            </HeadActions>
          </Head>

          {customizing && (
            <Customize aria-label="Customize view">
              <h3>Show on this page</h3>
              <ToggleGrid>
                {SECTIONS.map(s => (
                  <label key={s.key}>{s.label}<Toggle checked={shown(s.key)} aria-label={s.label} onChange={v => toggleSection(s.key, v)} /></label>
                ))}
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

          {shown('quickEntry') && <QuickWrap><QuickEntry /></QuickWrap>}

          {(lead || shown('wellness')) && (
            <Hero $single={!(lead && shown('wellness'))} $afterQuick={shown('quickEntry')}>
              {lead}
              {shown('wellness') && <WellnessCheckIn title="Wellness check-in" quad bare />}
            </Hero>
          )}

          {shown('clocks') && places.length > 0 && <WorldClocks places={places} now={now} open={!!config.clocksExpanded} onToggle={() => void saveConfig({ ...config, clocksExpanded: !config.clocksExpanded })} />}
          {shown('clocks') && places.length === 0 && !customizing && (
            <Muted style={{ marginTop: 20 }}>Add your city under Customize view for the weather and world clocks.</Muted>
          )}


          {(left.length > 0 || right.length > 0) && (
            <DndContext sensors={sensors} collisionDetection={closestCorners}
              onDragStart={() => setDragging(true)} onDragOver={onDragOver} onDragEnd={onDragEnd}
              onDragCancel={() => { setDragging(false); setLayout(fullLayout(config.layout)); }}>
              <Columns>
                <DropCol id="left" items={cols.left}>{left}</DropCol>
                <DropCol id="right" items={cols.right}>{right}</DropCol>
              </Columns>
            </DndContext>
          )}
        </Inner>
      </Page>
    </ContentTemplate>
  );
}

const NO_PLACES: Place[] = [];
