import { lazy, Suspense, useEffect, useLayoutEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { lightTheme, darkTheme } from '@shared/theme/tokens';
import { useUIStore } from './stores/uiStore.js';
import { GlobalStyle } from './styles/GlobalStyle.js';
import { AuthProvider, useAuth } from './contexts/AuthContext.js';
import { flushDrafts } from './services/drafts.js';
import { useIdleSignOut } from './hooks/useIdleSignOut.js';
import { onSessionEnded } from './services/api.js';
import { EncryptionProvider, useEncryption } from './contexts/EncryptionContext.js';
import { ProtectedRoute } from './components/organisms/ProtectedRoute.js';
import { RekeyOverlay } from './components/organisms/RekeyOverlay.js';
import { usePublicShelfSync } from './hooks/usePublicShelfSync.js';
import { useCalendarSync } from './hooks/useCalendarSync.js';
import { useEntrySync } from './hooks/useEntrySync.js';
import { LoginView } from './views/LoginView.js';
import { NoticeBanner } from './components/organisms/NoticeBanner.js';
import { ErrorBoundary } from './components/atoms/ErrorBoundary.js';
import { JournalView } from './views/JournalView.js';
import { useHabitStore } from './stores/habitStore.js';
import { RecipeFromIngredientsButton } from './components/organisms/AiRecipeFromIngredients.js';
import { DashboardView } from './views/DashboardView.js';
import { useAiChatEnabled } from './hooks/useAiReady.js';
import { FlashNotice } from './components/organisms/FlashNotice.js';
import { UpdatePrompt } from './components/organisms/UpdatePrompt.js';
import { pageTitleFor } from './utils/pageTitle.js';
import { IdleWarning } from './components/organisms/IdleWarning.js';
import { KITCHEN_TITLE, MealsTabBar } from './components/molecules/MealsTabBar.js';
import { RECIPE_COLUMNS, recipeNote } from './components/organisms/kitchenTables.js';
import { autoThemeFor, PAGE_COLOR } from './utils/autoTheme.js';
import { DEFAULT_ACCENT_COLOR } from './styles/accent.js';
import { useEncryptedSetting } from './hooks/useEncryptedSetting.js';
import { resolveWallpaper, customWallpaperFrom, type WallpaperSetting } from './utils/wallpapers.js';
import { pinImageKeys } from './services/imageStorage.js';
import { storedImageKeys } from './utils/storedImage.js';
import { areaImageKeys, parseGoalCategories, EMPTY_GOAL_CATEGORIES, type GoalCategoryConfig } from './utils/goalCategories.js';
import { useTimeStore } from './stores/timeStore.js';
import { RunningTimer } from './components/organisms/RunningTimer.js';
import { NotificationBell } from './components/organisms/NotificationBell.js';

/* The public home page is its own chunk, loaded only in a browser tab: the
   installed app (display-mode: standalone) goes straight to the dashboard and
   never downloads it, and the service worker doesn't precache it */
const LandingView = lazy(() => import('./views/LandingView.js').then(m => ({ default: m.LandingView })));

/* Every page but the dashboard, the journal and sign-in is a chunk of its own,
   loaded the first time it is opened (the service worker precaches them all, so
   an installed app has them offline). One script for the whole app meant every
   visitor — to the landing page, the sign-in page, a public shelf — downloaded
   Settings, Finance, Planning, the reports and the chat before anything showed.
   A chunk that fails to load reloads the page once (vite:preloadError, main.tsx) */
const BugReportView = lazy(() => import('./views/BugReportView.js').then(m => ({ default: m.BugReportView })));
const NotFoundView = lazy(() => import('./views/NotFoundView.js').then(m => ({ default: m.NotFoundView })));
const MedHistoryView = lazy(() => import('./views/MedHistoryView.js').then(m => ({ default: m.MedHistoryView })));
const MediaView = lazy(() => import('./views/MediaView.js').then(m => ({ default: m.MediaView })));
const PublicShelfView = lazy(() => import('./views/PublicShelfView.js').then(m => ({ default: m.PublicShelfView })));
const RegisterView = lazy(() => import('./views/RegisterView.js').then(m => ({ default: m.RegisterView })));
const HealthPrivacyView = lazy(() => import('./views/HealthPrivacyView.js').then(m => ({ default: m.HealthPrivacyView })));
const TermsView = lazy(() => import('./views/TermsView.js').then(m => ({ default: m.TermsView })));
const LicenseView = lazy(() => import('./views/LicenseView.js').then(m => ({ default: m.LicenseView })));
const RecoverView = lazy(() => import('./views/RecoverView.js').then(m => ({ default: m.RecoverView })));
const SettingsView = lazy(() => import('./views/SettingsView.js').then(m => ({ default: m.SettingsView })));
const SharedEntryView = lazy(() => import('./views/SharedEntryView.js').then(m => ({ default: m.SharedEntryView })));
const TopicsView = lazy(() => import('./views/TopicsView.js').then(m => ({ default: m.TopicsView })));
const TopicDetailView = lazy(() => import('./views/TopicDetailView.js').then(m => ({ default: m.TopicDetailView })));
const CalendarView = lazy(() => import('./views/CalendarView.js').then(m => ({ default: m.CalendarView })));
const GoalsView = lazy(() => import('./views/GoalsView.js').then(m => ({ default: m.GoalsView })));
const FinanceBudgetView = lazy(() => import('./views/FinanceBudgetView.js').then(m => ({ default: m.FinanceBudgetView })));
const FinanceGoalsView = lazy(() => import('./views/FinanceGoalsView.js').then(m => ({ default: m.FinanceGoalsView })));
const FinanceSavingsView = lazy(() => import('./views/FinanceSavingsView.js').then(m => ({ default: m.FinanceSavingsView })));
const FinanceDebtsView = lazy(() => import('./views/FinanceDebtsView.js').then(m => ({ default: m.FinanceDebtsView })));
const FinanceReportsView = lazy(() => import('./views/FinanceReportsView.js').then(m => ({ default: m.FinanceReportsView })));
const PlannerFilterView = lazy(() => import('./views/PlannerFilterView.js').then(m => ({ default: m.PlannerFilterView })));
const PlanRoadmapView = lazy(() => import('./views/PlanRoadmapView.js').then(m => ({ default: m.PlanRoadmapView })));
const PlanningOverviewView = lazy(() => import('./views/PlanningOverviewView.js').then(m => ({ default: m.PlanningOverviewView })));
const PlannerView = lazy(() => import('./views/PlannerView.js').then(m => ({ default: m.PlannerView })));
const HabitsView = lazy(() => import('./views/HabitsView.js').then(m => ({ default: m.HabitsView })));
const TopicEntriesView = lazy(() => import('./views/TopicEntriesView.js').then(m => ({ default: m.TopicEntriesView })));
const HealthView = lazy(() => import('./views/HealthView.js').then(m => ({ default: m.HealthView })));
const TrainingView = lazy(() => import('./views/TrainingView.js').then(m => ({ default: m.TrainingView })));
const ExerciseHistoryView = lazy(() => import('./views/ExerciseHistoryView.js').then(m => ({ default: m.ExerciseHistoryView })));
const SymptomHistoryView = lazy(() => import('./views/SymptomHistoryView.js').then(m => ({ default: m.SymptomHistoryView })));
const ExerciseScheduleView = lazy(() => import('./views/ExerciseScheduleView.js').then(m => ({ default: m.ExerciseScheduleView })));
const HealthDashboardView = lazy(() => import('./views/HealthDashboardView.js').then(m => ({ default: m.HealthDashboardView })));
const MealsLogView = lazy(() => import('./views/MealsLogView.js').then(m => ({ default: m.MealsLogView })));
const KitchenDashboardView = lazy(() => import('./views/KitchenDashboardView.js').then(m => ({ default: m.KitchenDashboardView })));
const HealthReportingView = lazy(() => import('./views/HealthReportingView.js').then(m => ({ default: m.HealthReportingView })));
const MenuView = lazy(() => import('./views/MenuView.js').then(m => ({ default: m.MenuView })));
const ShoppingListsView = lazy(() => import('./views/ShoppingListsView.js').then(m => ({ default: m.ShoppingListsView })));
const AiChat = lazy(() => import('./components/organisms/AiChat.js').then(m => ({ default: m.AiChat })));

function isInstalledApp(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(display-mode: standalone)').matches;
}

/** Tells the key holder which page shows: a keyless page (services/keyHandoff.ts) waits to ask other tabs for the key */
/** Entries written on another device or by the Chronicles AI app reach the open tab */
function EntrySync() {
  useEntrySync();
  return null;
}

function KeylessPageWatch() {
  const { pathname } = useLocation();
  const { notePage } = useEncryption();
  useEffect(() => { notePage(pathname); }, [pathname, notePage]);
  return null;
}

/** Each page names itself in the browser tab ("Health · Chronicles") */
function PageTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    const title = pageTitleFor(pathname);
    if (title) document.title = title;
  }, [pathname]);
  return null;
}

function HomeRoute() {
  if (isInstalledApp()) return <Navigate to="/dashboard" replace />;
  return <Suspense fallback={null}><LandingView /></Suspense>;
}

/* ── Design token CSS variable sets ─────────────────────────────────────────
   Chronicles design tokens (originally from the design-system package). Light = pure white canvas; dark =
   slate (#20232a) with bright, high-contrast grey text. Borderless tonal panels: surfaces separate by FILL,
   not outline; shadows are reserved for floating overlays only.

   Legacy aliases (--paper*, --ink*, --rule*, --btn-*, --accent-fill*) are kept
   pointing at the DS values so the ~147 existing components recolor without
   per-component edits. New/restructured components should reference the DS
   names (--bg-*, --text-*, --border-*, --color-accent*) directly.
   ─────────────────────────────────────────────────────────────────────────── */

/* Light greys are darkened a step for readability on the white canvas
   (tertiary ≈ 6:1, disabled/placeholder ≈ 3.7:1). */
const LIGHT_CSS_VARS: Record<string, string> = {
  /* Light theme colours measured from the user's mockups (2026-11-26; colours
     only): page #fef9f5, rail #faf5f0, cards #f9f4ee, chips / tiles #ede6e2,
     the chosen item #ede6e2, card edges #eae5e1 / #ece7e1, row rules #f4efe9,
     ink #231e1a, body #575350, labels / icons #5c5753, times #837e7b,
     checkbox outlines #aca9a4. */
  /* DS semantic surfaces */
  '--bg-app':            '#fef9f5',
  '--bg-surface':        '#f9f4ee',
  '--bg-panel':          '#f9f4ee', /* report panels (Health → Reports) */
  '--bg-elevated':       '#fef9f5',
  '--bg-sunken':         '#ede6e2',
  '--bg-hover':          '#f4efe9',
  '--bg-active':         '#ede6e2',
  '--bg-tab-active':     '#ede6e2',  /* the chosen sub-tab / segmented option — lighter than --bg-active so its text reads */
  '--bg-inverse':        '#1b1d26',
  /* DS text */
  '--text-primary':      '#231e1a',
  '--text-secondary':    '#231e1a',
  '--text-tertiary':     '#35302b',
  '--text-disabled':     '#837e7b',
  '--text-tab':          '#41342b',  /* inactive section tabs */
  '--text-meta':         '#5c5753',  /* list-row topic + date: recede behind the entry */
  '--text-muted':        '#5c5753',  /* card subtitles, chevrons, + icons */
  '--text-placeholder':  '#5c5753',
  '--control-border':    '#aca9a4',  /* unticked round checks */
  '--border-card':       '#eae5e1',  /* card outlines + their inner rules/boxes */
  '--bg-row-hover':      '#f4efe9',  /* a row lifting inside a card on hover */
  '--text-soft':         '#575350',  /* toolbar text buttons, chevrons */
  '--text-faint':        '#aca9a4',  /* quiet + marks in empty slots */
  '--bg-tile':           '#ede6e2',  /* a filled tile on the canvas (menu meals) */
  '--bg-lane':           '#ede6e2',  /* planning board swim lanes */
  '--bg-lane-over':      '#e6dfda',  /* a lane while a card is dragged over it: the lane's own colour (#ede6e2) a step deeper */
  '--bg-lane-card':      '#fef9f5',  /* cards sitting in a lane */
  '--bg-today-col':      '#f9f4ee',  /* today's column band */
  '--border-pop':        '#eae5e1',  /* floating menus' outline */
  '--border-dashed':     '#d9d4ce',  /* dashed outline of an empty slot on hover */
  '--text-hint':         '#837e7b',  /* placeholders in big borderless fields (4.8:1) */
  '--text-inverse':      '#ffffff',
  /* DS borders — hairlines only */
  '--border-subtle':     '#ece7e1',
  '--border-faint':      '#f4efe9', /* the lightest hairline (topic picker) */
  '--border-pill':       '#aca9a4',  /* pills, ± buttons, round controls (light only) */
  '--focus-ring':        '#837e7b',  /* keyboard focus: a neutral grey ring, never the accent (3.4:1) */
  '--progress-track':    '#ede6e2',  /* empty part of a progress rule or roadmap bar: the agenda's tile colour, never yellow */
  '--bg-control':        'transparent',  /* pills, chips, the topic picker, ± buttons: outlines only — never a fill */
  '--bg-tracker':        '#f9f4ee',  /* the wellness four-square card (light only) */
  '--border-default':    '#d9d4ce',
  '--border-strong':     '#d3ccc4',
  '--border-field':      '#eae5e1',  /* faint outline on styled-form boxes + nutrition panel */
  /* Nav rail — its own toned panel: darker logo cell, active item lifted */
  '--bg-rail':           '#faf5f0',
  /* The open section's row: a light step from the rail toward the tile
     colour, worked out from the rail's own colour — never a fixed grey */
  '--bg-rail-logo':      'color-mix(in srgb, var(--bg-rail) 30%, var(--bg-tile))', /* a lighter shade of the tile colour (#ede6e2): about #f1eae6 */
  '--bg-rail-active':    'var(--bg-rail-logo)', /* the current page's row: the same light shade as an open section's row */
  /* Chart series — muted, same chroma as the accent presets */
  '--chart-blue':        '#4f8fd1',
  '--chart-violet':      '#8a6fd1',
  '--chart-amber':       '#c98f3e',
  '--chart-green':       '#4f9e74',
  '--chart-ghost':       '#d5c8b6',  /* the pale comparison line on report charts */
  /* Mood faces, very low → great (wellness check-in) */
  '--mood-1': '#cf6a62', '--mood-2': '#d48a63', '--mood-3': '#c49a45', '--mood-4': '#5c9e78', '--mood-5': '#3f9a8c',
  /* Status */
  '--color-success':     '#2f9e6b',  '--color-success-subtle': '#e2f4eb',
  '--color-warning':     '#d8941f',  '--color-warning-subtle': '#fbefd7',
  '--color-danger':      '#c23b33',  '--color-danger-subtle':  '#fae4e2',
  '--color-info':        '#2f7fd8',  '--color-info-subtle':    '#e1eefb',

  /* DS neutral grays for light theme */
  '--neutral-300': '#eae5e1',
  '--neutral-700': '#aca9a4',

  /* ── Legacy aliases → DS values ── */
  '--paper':             '#fef9f5',
  '--paper-deep':        '#ede6e2',
  '--paper-surface':     '#f9f4ee',
  '--paper-well':        '#ede6e2',
  '--paper-hover':       '#f4efe9',
  '--ink':               '#231e1a',
  '--ink-2':             '#231e1a',
  '--ink-3':             '#41342b',
  '--ink-4':             '#5c5753',
  '--rule':              '#eae5e1',
  '--rule-2':            '#eae5e1',
  '--btn-primary':       '#231e1a',
  '--btn-primary-ink':   '#ffffff',
  '--btn-primary-hover': '#35302b',
  '--accent-fill':       '#231e1a',
  '--accent-fill-ink':   '#ffffff',
  '--danger':            '#d8483f',
  '--success':           '#2f9e6b',
  '--warning':           '#d8941f',
  '--info':              '#2f7fd8',
  /* Panels are flat — no resting shadow. Overlays use --shadow-lg/xl below. */
  '--shadow-1':          'none',
  '--shadow-2':          '0 1px 2px rgba(20,20,30,0.04)',
  '--shadow-3':          '0 6px 24px rgba(20,20,30,0.12)',
  '--shadow-lg':         '0 8px 28px rgba(20,20,30,0.14)',
  '--shadow-xl':         '0 16px 48px rgba(20,20,30,0.18)',
  /* Dashboard cards' soft shadow: even on every side, never offset to one corner */
  /* …with a light edge drawn round it (a 1px ring in the card-edge colour): on
     the cream page a card set off by its shadow alone had no edge to speak of */
  '--shadow-card':       '0 0 0 1px var(--border-card), 0 0 16px rgba(0, 0, 0, 0.055)',
};

const DARK_CSS_VARS: Record<string, string> = {
  '--bg-app':            '#15171d',
  '--bg-surface':        '#1a1c24',
  '--bg-panel':          '#181a22', /* cards and panels (widgets): the colour the user chose. Do not retint */
  '--bg-elevated':       '#1e2029',
  '--bg-sunken':         '#0a0b0f',
  '--bg-hover':          '#1d1f28',
  '--bg-active':         'rgba(255, 255, 255, 0.13)', /* chosen toggles: a light veil, brighter than what it sits on — never a darker fill */
  '--bg-tab-active':     'rgba(255, 255, 255, 0.13)',
  '--bg-inverse':        '#f1f2f5',
  '--text-primary':      '#f7f8fa',
  '--text-secondary':    '#c8c6c6',
  '--text-tertiary':     '#cdd2da',
  '--text-disabled':     '#a3a9b5',
  '--text-tab':          '#aeb4bf',  /* inactive section tabs — a step under tertiary */
  '--text-meta':         '#a9b0c8',  /* list-row topic + date: recede behind the entry */
  '--text-muted':        '#8a8d96',  /* card subtitles, chevrons, + icons (5.2:1 on cards) */
  '--text-placeholder':  '#84878f',  /* 4.7:1 on cards, a touch dimmer than muted text */
  '--control-border':    '#6b6f79',  /* unticked round checks (3.5:1) */
  '--border-card':       '#2f323d',  /* card outlines + their inner rules/boxes */
  '--bg-row-hover':      '#1d1f28',  /* a row lifting inside a card on hover */
  '--text-soft':         '#a5a8b0',  /* toolbar text buttons, chevrons */
  '--text-faint':        '#464a54',  /* quiet + marks in empty slots */
  '--bg-tile':           '#1b1d25',  /* a filled tile on the canvas (menu meals) */
  '--bg-lane':           '#0e1015',  /* planning board swim lanes */
  '--bg-lane-over':      '#13151b',  /* a lane while a card is dragged over it */
  '--bg-lane-card':      '#15171d',  /* cards sitting in a lane */
  '--bg-today-col':      '#14161c',  /* today's column band */
  '--border-pop':        '#2a2d37',  /* floating menus' outline */
  '--border-dashed':     '#3b3f49',  /* dashed outline of an empty slot on hover */
  '--text-hint':         '#84878f',  /* placeholders in big borderless fields (4.7:1) */
  '--text-inverse':      '#14161b',
  '--border-subtle':     '#1f222b',
  '--border-faint':      '#1f222b', /* same as --border-subtle in dark */
  '--border-default':    '#292c36',
  /* Light-only tokens: empty = unset, so components use their own dark values */
  '--border-pill':       '',
  '--focus-ring':        '#8a8d96',  /* keyboard focus: a neutral grey ring, never the accent (5.2:1) */
  '--progress-track':    '',
  '--bg-control':        '',
  '--bg-tracker':        '',
  '--border-strong':     '#3e4350',
  '--border-field':      '#31343f',  /* faint outline on styled-form boxes + nutrition panel */
  /* Nav rail — one strip a shade darker than the page with the logo in it (no darker cell); the active
     item is just its accent icon and a thin accent bar, never a lifted block */
  '--bg-rail':           '#12141a',
  '--bg-rail-logo':      '#12141a',
  '--bg-rail-active':    'transparent',
  /* Chart series — brightened a notch for the slate canvas */
  '--chart-blue':        '#6aa6e6',
  '--chart-violet':      '#a68cf0',
  '--chart-amber':       '#e0ae68',
  '--chart-green':       '#6cc093',
  '--chart-ghost':       '#6c6f78',
  '--mood-1': '#ea8a83', '--mood-2': '#eba584', '--mood-3': '#e0b468', '--mood-4': '#7cc49a', '--mood-5': '#6cc4b4',
  '--color-success':     '#2f9e6b',  '--color-success-subtle': '#1c3a2c',
  '--color-warning':     '#d8941f',  '--color-warning-subtle': '#3a2f14',
  '--color-danger':      '#e86058',  '--color-danger-subtle':  '#3a1e1c',
  '--color-info':        '#2f7fd8',  '--color-info-subtle':    '#16283a',

  /* DS neutral grays for dark theme */
  '--neutral-300': '#3e4350',
  '--neutral-700': '#cdd2da',

  /* ── Legacy aliases → DS values ── */
  '--paper':             '#12141a',
  '--paper-deep':        '#0a0b0f',
  '--paper-surface':     '#1a1c24',
  '--paper-well':        '#20232c',
  '--paper-hover':       '#1d1f28',
  '--ink':               '#f7f8fa',
  '--ink-2':             '#e6e9ee',
  '--ink-3':             '#cdd2da',
  '--ink-4':             '#a3a9b5',
  '--rule':              '#1f222b',
  '--rule-2':            '#1f222b',
  '--btn-primary':       '#f7f8fa',
  '--btn-primary-ink':   '#20232a',
  '--btn-primary-hover': '#d4d7df',
  '--accent-fill':       '#f7f8fa',
  '--accent-fill-ink':   '#20232a',
  '--danger':            '#d8483f',
  '--success':           '#2f9e6b',
  '--warning':           '#d8941f',
  '--info':              '#2f7fd8',
  '--shadow-1':          'none',
  '--shadow-2':          '0 1px 2px rgba(0,0,0,0.4)',
  '--shadow-3':          '0 8px 24px rgba(0,0,0,0.5)',
  '--shadow-lg':         '0 8px 28px rgba(0,0,0,0.55)',
  '--shadow-xl':         '0 16px 48px rgba(0,0,0,0.6)',
  /* Dashboard cards' soft shadow: even on every side, never offset to one corner */
  '--shadow-card':       '0 0 34px rgba(0, 0, 0, 0.15)',
};

/* Structural tokens that never change with theme or accent.
   Radii are the DS "sharp/squared" scale; fonts are Work Sans + Open Sans. */
const STATIC_CSS_VARS: Record<string, string> = {
  /* Legacy spacing tokens (--s-*) */
  '--r-sm':  '0',
  '--r-md':  '1px',
  '--r-lg':  '6px',
  '--r-xl':  '6px',
  '--r-full':'999px',
  '--s-1':   '4px',
  '--s-2':   '8px',
  '--s-3':   '12px',
  '--s-4':   '16px',
  '--s-5':   '20px',
  '--s-6':   '24px',
  '--s-7':   '32px',
  '--s-8':   '48px',
  '--s-9':   '64px',
  '--s-10':  '96px',

  /* Design system spacing tokens (--space-*) */
  '--space-1': '4px',
  '--space-2': '8px',
  '--space-3': '12px',
  '--space-4': '16px',
  '--space-5': '20px',
  '--space-8': '48px',

  /* Design system radius tokens (--radius-*) */
  '--radius-sm':   '0px',
  '--radius-md':   '1px',
  '--radius-lg':   '6px',
  '--radius-full': '999px',

  /* Design system text tokens (--text-*) */
  '--text-xs':     '13px',
  '--text-sm':     '14px',
  '--text-base':   '16px',
  '--text-md':     '17px',

  /* Design system font weight tokens */
  '--weight-medium':    '500',
  '--weight-semibold':  '600',

  /* Design system transition tokens */
  '--transition-colors': 'color 200ms ease-out, background-color 200ms ease-out, border-color 200ms ease-out',
  '--duration-instant':  '0ms',
  '--duration-fast':     '150ms',
  '--duration-base':     '200ms',
  '--ease-out':          'cubic-bezier(0.33, 0.66, 0.66, 1)',

  /* Design system shadow tokens */
  '--shadow-sm':    '0 1px 2px rgba(20, 20, 30, 0.04)',
  '--shadow-ring':  '0 0 0 2px var(--focus-ring, #80868f)',

  /* Design system tracking (letter-spacing) */
  '--tracking-tight': '-0.01em',
  '--leading-normal': '1.5',

  /* Design system color reference (neutral grays - these are overridden per theme below) */
  '--neutral-300': '#e4e6ec',
  '--neutral-700': '#2e3140',

  /* DS font roles */
  '--font-display': "'Work Sans', ui-sans-serif, system-ui, -apple-system, sans-serif",
  '--font-sans':    "'Open Sans', ui-sans-serif, system-ui, -apple-system, sans-serif",
  '--font-label':   "'Open Sans', ui-sans-serif, system-ui, sans-serif",
  /* Legacy font aliases → DS faces. --mono points at Open Sans because the DS
     sets metadata (dates/times/counts) in tracked-uppercase Open Sans, not a
     mono face; true monospace (code) is rare in this journaling app. */
  '--serif':  "'Work Sans', ui-sans-serif, system-ui, sans-serif",
  '--sans':   "'Open Sans', ui-sans-serif, system-ui, sans-serif",
  '--mono':   "'Open Sans', ui-sans-serif, system-ui, sans-serif",
  '--brand':  "'Work Sans', ui-sans-serif, system-ui, sans-serif",
  '--ui':     "'Open Sans', ui-sans-serif, system-ui, sans-serif",
};

/* Apply structural vars once at module load */
const root = document.documentElement;
Object.entries(STATIC_CSS_VARS).forEach(([k, v]) => root.style.setProperty(k, v));

/* ── Color derivation helpers ────────────────────────────────────────────── */

function hexToRgbParts(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function deriveAccentStroke(hex: string): string {
  const [r, g, b] = hexToRgbParts(hex);
  return `rgb(${Math.round(r * 0.75)},${Math.round(g * 0.75)},${Math.round(b * 0.75)})`;
}

function deriveDarker(hex: string, factor: number): string {
  const [r, g, b] = hexToRgbParts(hex);
  return `rgb(${Math.round(r * factor)},${Math.round(g * factor)},${Math.round(b * factor)})`;
}

/* Mix a hex color toward a target (white #fff or black #000) by `amt` (0..1). */
function mix(hex: string, target: number, amt: number): string {
  const [r, g, b] = hexToRgbParts(hex);
  const m = (c: number) => Math.round(c + (target - c) * amt);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}

/** White text on an accent fill, unless the fill is light enough that white
    fades (< 2:1 — yellows, pastels, light greys); then near-black. The muted
    mid-tone presets (teal, coral, blue…) keep white. */
function onAccentFor(fill: string): string {
  return contrast('#ffffff', fill) >= 2 ? '#ffffff' : '#18181c';
}

/* WCAG relative luminance / contrast of two hex colours. */
function luminance(hex: string): number {
  const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = hexToRgbParts(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/* Build the DS accent scale (--accent-100..800) from a single base hex.
   Lighter steps mix toward white, darker steps toward black — mirrors the
   tonal accent ramps of the original design system. */
function deriveAccentScale(base: string): Record<string, string> {
  return {
    '--accent-100': mix(base, 255, 0.86),
    '--accent-200': mix(base, 255, 0.72),
    '--accent-300': mix(base, 255, 0.48),
    '--accent-400': mix(base, 255, 0.22),
    '--accent-500': base,
    '--accent-600': mix(base, 0, 0.16),
    '--accent-700': mix(base, 0, 0.32),
    '--accent-800': mix(base, 0, 0.46),
  };
}

/** The landing page, sign-in screens, shares and legal pages — no chat or notice banner there */
const PUBLIC_PREFIXES = ['/login', '/sign-up', '/register', '/recover', '/share', '/public-shelf', '/health-privacy', '/terms', '/license', '/report-a-bug'];
function isPublicPage(pathname: string): boolean {
  return pathname === '/' || PUBLIC_PREFIXES.some(p => pathname.startsWith(p));
}

/** Keeps the owner's public shelf in step with the journal — signed in, unlocked, not on a public page */
function PublicShelfSync() {
  const { isAuthenticated } = useAuth();
  const { isUnlocked } = useEncryption();
  const { pathname } = useLocation();
  usePublicShelfSync(isAuthenticated && isUnlocked && !isPublicPage(pathname));
  return null;
}

/** Ends the session after 15 minutes with nobody at any Chronicles tab (hooks/useIdleSignOut.ts) */
function IdleGate() {
  const { signOutAt, stay } = useIdleSignOut();
  // A minute before the idle sign-out: a warning with Stay signed in
  return signOutAt ? <IdleWarning signOutAt={signOutAt} onStay={stay} /> : null;
}

/** The server ended this browser's session (revoked, expired): retrying can't
 *  help, so lock, clear what this browser holds and go to sign-in with a note —
 *  instead of every load retrying behind a spinner.
 *  Cookies are shared by every tab, so first ask whether the browser's session
 *  is really over: another tab may already have signed in again, and then this
 *  answer was about the old one (the next requests use the new cookie). And it
 *  never calls the server's sign-out — the session is already dead, and that
 *  call ends whichever session the cookie holds now, which could be the new one. */
function SessionEndedGate() {
  const { isAuthenticated, dropUser } = useAuth();
  const { clearKey } = useEncryption();
  const navigate = useNavigate();
  const ending = useRef(false);
  useEffect(() => onSessionEnded(reason => {
    if (!isAuthenticated || ending.current) return;
    ending.current = true;
    void (async () => {
      try {
        const me = await fetch('/api/auth/me', { headers: { 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'include' });
        if (me.ok) return; // signed in again (another tab): nothing to end
        const note = reason === 'Session expired'
          ? 'Your session expired. Sign in again to carry on.'
          : 'You were signed out on this browser. Sign in again to carry on.';
        // Unsaved writing is sealed first, while the key is still here
        await flushDrafts().catch(() => {});
        clearKey();
        // The key and everything decrypted leave this tab. What the browser
        // stores stays: it is ciphertext only (the encrypted cache, sealed
        // drafts), and no wrap of the key is stored here, so without signing in
        // again it opens nothing — and the writing a session ended under is
        // still there to restore. A different person signing in wipes it.
        dropUser();
        try { sessionStorage.clear(); } catch { /* storage blocked */ }
        navigate('/login', { replace: true, state: { signInNote: note } });
      } catch {
        // Offline: leave things as they are — the next answer will say again
      } finally {
        ending.current = false;
      }
    })();
  }), [isAuthenticated, dropUser, clearKey, navigate]);
  return null;
}

function ChatGate() {
  const { isAuthenticated } = useAuth();
  const { isUnlocked } = useEncryption();
  const { pathname } = useLocation();
  const publicPage = isPublicPage(pathname);
  if (!isAuthenticated || !isUnlocked || publicPage) return null;
  return <ChatWhenOn />;
}

/** The chat shows only once it's switched on in Settings → In-App AI */
function ChatWhenOn() {
  const chatOn = useAiChatEnabled();
  return chatOn ? <ErrorBoundary fallback="none"><Suspense fallback={null}><AiChat /></Suspense></ErrorBoundary> : null;
}

/** The saved wallpaper (the sealed `wallpaper` setting) into the store once
 *  it's opened — the browser's remembered copy shows until then. */
function WallpaperSync() {
  const [saved, , loaded] = useEncryptedSetting<WallpaperSetting>('wallpaper', null);
  const setWallpaper = useUIStore(s => s.setWallpaper);
  const setCustomWallpaper = useUIStore(s => s.setCustomWallpaper);
  useEffect(() => {
    if (!loaded) return;
    const custom = customWallpaperFrom(saved);
    setCustomWallpaper(custom);
    setWallpaper(resolveWallpaper(saved));
    // The person's own background may be an entry's photo: deleting that entry leaves it in the bucket
    pinImageKeys('wallpaper', storedImageKeys(custom));
  }, [loaded, saved, setWallpaper, setCustomWallpaper]);
  // The same for the Vision areas' own photos
  const [areas, , areasLoaded] = useEncryptedSetting<GoalCategoryConfig>('goalCategories', EMPTY_GOAL_CATEGORIES);
  useEffect(() => {
    if (areasLoaded) pinImageKeys('areas', areaImageKeys(parseGoalCategories(areas)));
  }, [areasLoaded, areas]);
  return null;
}

/** Time tracking: the sealed `timeLog` setting into the shared store once it's opened, and back on every change */
function TimeSync() {
  const [saved, save, loaded] = useEncryptedSetting<unknown>('timeLog', []);
  const hydrated = useRef(false);
  useEffect(() => {
    if (!loaded || hydrated.current) return;
    hydrated.current = true;
    useTimeStore.getState().hydrate(saved, sessions => save(sessions));
  }, [loaded, saved, save]);
  useEffect(() => () => useTimeStore.getState().reset(), []);
  return null;
}

/** Habit check-ins: the sealed `habitLog` setting into the shared store once it's opened, and back on every change */
function HabitSync() {
  const [saved, save, loaded] = useEncryptedSetting<unknown>('habitLog', {});
  const hydrated = useRef(false);
  useEffect(() => {
    if (!loaded || hydrated.current) return;
    hydrated.current = true;
    useHabitStore.getState().hydrate(saved, log => save(log));
  }, [loaded, saved, save]);
  useEffect(() => () => useHabitStore.getState().reset(), []);
  return null;
}

/** Time tracking for an unlocked journal: the store's sync and the floating timer */
function TimeGate() {
  const { isAuthenticated } = useAuth();
  const { isUnlocked } = useEncryption();
  const { pathname } = useLocation();
  // The journal editor full width (Expand, or opened to edit from another view): no corner bell over it
  const editorFull = useUIStore(s => s.editorFocusMode);
  if (!isAuthenticated || !isUnlocked) return null;
  // The reminders bell sits in the top-right corner on wide screens (phones / tablets: their top bar)
  return <><TimeSync /><HabitSync />{!isPublicPage(pathname) && <>
    {/* Floating extras: one that fails isn't shown, and the page carries on */}
    <ErrorBoundary fallback="none"><RunningTimer /></ErrorBoundary>
    {/* The dashboard puts its own beside Voice and the sliders */}
    {pathname !== '/dashboard' && !editorFull && <ErrorBoundary fallback="none"><NotificationBell variant="corner" /></ErrorBoundary>}
  </>}</>;
}

function WallpaperGate() {
  const { isAuthenticated } = useAuth();
  const { isUnlocked } = useEncryption();
  if (!isAuthenticated || !isUnlocked) return null;
  return <WallpaperSync />;
}

/** The server-controlled notice banner — signed-in pages only. */
function NoticeGate() {
  const { isAuthenticated } = useAuth();
  const { pathname } = useLocation();
  const publicPage = isPublicPage(pathname);
  if (!isAuthenticated || publicPage) return null;
  return <ErrorBoundary fallback="none"><NoticeBanner /></ErrorBoundary>;
}

// Where a page that failed to show can send someone: places that may still open
const PAGE_LINKS = [
  { to: '/journal', label: 'Journal' },
  { to: '/settings', label: 'Settings' },
];

function R({ children }: { children: React.ReactNode }) {
  useCalendarSync();
  const { pathname } = useLocation();
  // One page failing to show (an entry holding something it didn't expect)
  // stays that page's problem: the rest of the app, and Settings, still open
  return (
    <ProtectedRoute>
      <ErrorBoundary fallback="page" resetKey={pathname} links={PAGE_LINKS.filter(l => l.to !== pathname)}>{children}</ErrorBoundary>
    </ProtectedRoute>
  );
}

/** Recipes as the topic page's table: Prep, Cook, Serves, Difficulty; the description muted beside the name */
const RECIPE_TABLE = { label: 'Recipes', firstColumn: 'Recipe', columns: RECIPE_COLUMNS, noteOf: recipeNote, prefsKey: 'recipe-list-v1' };

export function App() {
  const accentColor = useUIStore(s => s.accentColor);
  const themeMode = useUIStore(s => s.themeMode);
  // A page can pin a theme while it shows (the sign-in pages: always dark)
  const forcedTheme = useUIStore(s => s.forcedTheme);
  const isDark = (forcedTheme ?? themeMode) === 'dark';
  const activeTheme = isDark ? darkTheme : lightTheme;

  // Auto theme: follow the clock (light 7 AM – 7 PM) — checked every minute and
  // whenever the tab comes back, so it flips on its own at the hour
  const themePreference = useUIStore(s => s.themePreference);
  useEffect(() => {
    if (themePreference !== 'auto') return;
    const tick = () => useUIStore.getState().setThemeMode(autoThemeFor());
    tick();
    const id = setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [themePreference]);

  // Layout effect: the theme's tokens are on the page before it paints (no flash of the other theme)
  useLayoutEffect(() => {
    const color = accentColor || DEFAULT_ACCENT_COLOR;
    const [r, g, b] = hexToRgbParts(color);

    root.setAttribute('data-theme', isDark ? 'dark' : 'light');
    // The browser bar (and the page behind the app) in the theme's page colour
    root.style.backgroundColor = PAGE_COLOR[isDark ? 'dark' : 'light'];
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', PAGE_COLOR[isDark ? 'dark' : 'light']);

    /* Theme-based tokens (flip between light and dark) */
    const themeVars = isDark ? DARK_CSS_VARS : LIGHT_CSS_VARS;
    Object.entries(themeVars).forEach(([k, v]) => root.style.setProperty(k, v));

    /* DS accent scale (--accent-100..800) derived from the chosen hex */
    Object.entries(deriveAccentScale(color)).forEach(([k, v]) => root.style.setProperty(k, v));

    /* Logo mark (BrandMark) gradient, top → bottom: mostly the accent itself.
       Dark: a light accent tint at the very top → the accent (most of the C) → a
       slightly deeper shade at the bottom. Light: deep
       accent into the accent, with ink hands — pale tints would vanish on a light nav. */
    root.style.setProperty('--logo-top', isDark ? mix(color, 255, 0.6) : mix(color, 0, 0.55));
    root.style.setProperty('--logo-mid', isDark ? color : mix(color, 0, 0.35));
    root.style.setProperty('--logo-low', isDark ? color : mix(color, 0, 0.15));
    root.style.setProperty('--logo-end', isDark ? mix(color, 0, 0.15) : color);

    /* DS interactive accent tokens: the user's exact accent in both themes (no
       dark-mode lift). Hover/pressed step lighter in dark, darker in light. */
    // Text on a solid accent fill: white unless the accent is too light for it
    const onAccent = onAccentFor(color);
    root.style.setProperty('--color-accent',        color);
    root.style.setProperty('--color-accent-hover',  isDark ? mix(color, 255, 0.18) : deriveDarker(color, 0.85));
    root.style.setProperty('--color-accent-active', isDark ? mix(color, 255, 0.34) : deriveDarker(color, 0.70));
    root.style.setProperty('--color-accent-subtle', isDark ? `rgba(${r},${g},${b},0.22)` : `rgba(${r},${g},${b},0.10)`);
    root.style.setProperty('--color-accent-text',   isDark ? color : deriveDarker(color, 0.68));
    // Accent outlines + their text (pills, chosen chips, Save): a deeper accent in light so it holds on white (Teal → ~#23706e, 5.2–5.9:1)
    root.style.setProperty('--color-accent-line',   isDark ? color : deriveDarker(color, 0.68));
    // Progress-rule fills: the accent in dark; a touch deeper in light (Teal → ~#2c8b88, 4.1:1)
    root.style.setProperty('--color-accent-fill',   isDark ? color : deriveDarker(color, 0.84));
    // Chosen pill / mood behind its accent text — light only (Teal → ~#daefee); unset in dark
    // Chosen chips are an accent outline and text only — never a tinted fill, in either theme
    root.style.removeProperty('--bg-selected');
    root.style.setProperty('--on-accent', onAccent);
    // Lighter accent shades for text on dark (links, today's label); deeper in light
    root.style.setProperty('--color-accent-link', isDark ? mix(color, 255, 0.24) : deriveDarker(color, 0.68));
    root.style.setProperty('--color-accent-soft', isDark ? mix(color, 255, 0.40) : deriveDarker(color, 0.68));

    /* Nav accent (active rail icon + tab): the exact accent in dark, the deeper
       text accent in light */
    root.style.setProperty('--color-accent-nav', isDark ? color : deriveDarker(color, 0.68));

    /* Legacy accent tokens (existing components still read these) */
    root.style.setProperty('--accent', color);
    root.style.setProperty('--accent-hover', isDark ? mix(color, 255, 0.18) : deriveDarker(color, 0.85));
    root.style.setProperty('--accent-tint', isDark ? `rgba(${r},${g},${b},0.22)` : `rgba(${r},${g},${b},0.12)`);
    root.style.setProperty('--accent-stroke', deriveAccentStroke(color));
    root.style.setProperty('--accent-fill', color);
    root.style.setProperty('--accent-fill-ink', onAccent);
    root.style.setProperty('--h-active', color);
    root.style.setProperty('--h-active-ink', onAccent);
    root.style.setProperty('--focus', `0 0 0 3px rgba(${r},${g},${b},0.28)`);
    root.style.setProperty('--ring', `rgba(${r},${g},${b},0.55)`);

    /* Legacy vars for existing components that depend on them */
    root.style.setProperty('--focus-color', color);
    root.style.setProperty('--focus-color-rgb', `${r},${g},${b}`);
    /* The token tables are deps too: when a hot reload re-creates them (a token
       added or changed in this file), the tokens are re-applied without a full
       page reload — otherwise a new token is missing until the next reload. */
  }, [accentColor, isDark, LIGHT_CSS_VARS, DARK_CSS_VARS]);

  return (
    <ThemeProvider theme={activeTheme}>
      <GlobalStyle />
      <AuthProvider>
        <EncryptionProvider>
          <BrowserRouter>
            <KeylessPageWatch />
            <EntrySync />
            <PageTitle />
            {/* A page's chunk on its way: nothing for a moment, then the page (its own spinner once mounted) */}
            <Suspense fallback={null}>
            <Routes>
              {/* Public */}
              <Route path="/login" element={<LoginView />} />
              <Route path="/" element={<HomeRoute />} />
              <Route path="/sign-up" element={<RegisterView />} />
              <Route path="/register" element={<Navigate to="/sign-up" replace />} />
              <Route path="/recover" element={<RecoverView />} />
              <Route path="/share/:token" element={<SharedEntryView />} />
              <Route path="/public-shelf/:token" element={<PublicShelfView />} />
              <Route path="/health-privacy" element={<HealthPrivacyView />} />
              <Route path="/terms" element={<TermsView />} />
              <Route path="/license" element={<LicenseView />} />
              <Route path="/report-a-bug" element={<BugReportView />} />

              {/* Core */}
              <Route path="/journal" element={<R><JournalView /></R>} />
              <Route path="/dashboard" element={<R><DashboardView /></R>} />
              <Route path="/settings" element={<R><SettingsView /></R>} />
              <Route path="/topics" element={<R><TopicsView /></R>} />
              <Route path="/topics/:topicId" element={<R><TopicDetailView /></R>} />
              <Route path="/calendar" element={<R><CalendarView /></R>} />
              <Route path="/goals/overview" element={<R><PlanningOverviewView /></R>} />
              <Route path="/goals" element={<R><GoalsView /></R>} />
              <Route path="/goals/milestones" element={<R><GoalsView /></R>} />
              <Route path="/goals/tasks" element={<R><GoalsView /></R>} />
              <Route path="/goals/todos" element={<R><GoalsView /></R>} />
              <Route path="/goals/roadmap" element={<R><PlanRoadmapView /></R>} />
              <Route path="/goals/planner" element={<R><PlannerView /></R>} />
              <Route path="/goals/habits" element={<Navigate to="/health/habits" replace />} />
              <Route path="/goals/filter" element={<R><PlannerFilterView /></R>} />
              <Route path="/menu" element={<R><MenuView /></R>} />
              <Route path="/menu/recipes" element={<R><HealthView topicNames={['Recipe', 'Recipes']} metaFields={[{ key: 'category', label: 'Category' }, { key: 'servings', label: 'Serves' }, { key: 'prepTime', label: 'Prep' }, { key: 'cookTime', label: 'Cook' }]} showDateFilter={false} title={KITCHEN_TITLE} tabBar={<MealsTabBar />} extraAction={<RecipeFromIngredientsButton />} table={RECIPE_TABLE} /></R>} />
              <Route path="/kitchen" element={<R><KitchenDashboardView /></R>} />
              <Route path="/menu/meals" element={<Navigate to="/health/food" replace />} />
              <Route path="/shopping" element={<R><ShoppingListsView /></R>} />

              {/* Health */}
              <Route path="/finance" element={<R><FinanceBudgetView /></R>} />
              <Route path="/finance/budget" element={<Navigate to="/finance" replace />} />
              <Route path="/finance/reconcile" element={<Navigate to="/finance" replace />} />
              <Route path="/finance/reports" element={<R><FinanceReportsView /></R>} />
              <Route path="/finance/goals" element={<R><FinanceGoalsView /></R>} />
              <Route path="/finance/savings" element={<R><FinanceSavingsView /></R>} />
              <Route path="/finance/debts" element={<R><FinanceDebtsView /></R>} />
              <Route path="/health" element={<R><HealthDashboardView /></R>} />
              <Route path="/health/meds" element={<R><HealthView topicNames={['Medication']} metaFields={[{ key: 'dosage', label: 'Dosage' }, { key: 'frequency', label: 'Frequency' }, { key: 'isActive', label: 'Active' }]} showDateFilter={false} printable printTitle="Medications" /></R>} />
              <Route path="/health/med-history" element={<R><MedHistoryView /></R>} />
              <Route path="/health/schedule" element={<Navigate to="/health" replace />} />
              <Route path="/health/food" element={<R><MealsLogView /></R>} />
              <Route path="/health/habits" element={<R><HabitsView /></R>} />
              <Route path="/health/symptoms" element={<R><SymptomHistoryView /></R>} />
              <Route path="/health/exercise" element={<Navigate to="/health/exercise/schedule" replace />} />
              <Route path="/health/exercise/schedule" element={<R><ExerciseScheduleView /></R>} />
              <Route path="/health/exercise/history" element={<R><ExerciseHistoryView /></R>} />
              <Route path="/health/exercise/routines" element={<Navigate to="/health/exercise/schedule" replace />} />
              <Route path="/health/exercise/training" element={<R><TrainingView /></R>} />
              <Route path="/health/allergies" element={<R><HealthView topicNames={['Allergy']} metaFields={[{ key: 'severity', label: 'Severity' }, { key: 'allergen', label: 'Allergen' }, { key: 'reaction', label: 'Reaction' }]} printable printTitle="Allergies" /></R>} />
              <Route path="/health/reporting" element={<R><HealthReportingView /></R>} />

              {/* Media (the old Entertainment lists redirect here) */}
              <Route path="/media" element={<R><MediaView /></R>} />
              <Route path="/entertainment/*" element={<Navigate to="/media" replace />} />

              {/* Inspiration */}
              <Route path="/inspiration/research" element={<R><TopicEntriesView title="Research" topicNames={['Research']} showDateFilter={false} /></R>} />
              <Route path="/inspiration/quotes" element={<R><TopicEntriesView title="Quotes" topicNames={['Quote']} showDateFilter={false} /></R>} />
              {/* Anything else: sign-in when signed out, else a 404 page */}
              <Route path="*" element={<NotFoundView />} />
            </Routes>
            </Suspense>
            <RekeyOverlay />
            <SessionEndedGate />
            <IdleGate />
            <ChatGate />
            <PublicShelfSync />
            <TimeGate />
            <WallpaperGate />
            <NoticeGate />
            <UpdatePrompt />
            <FlashNotice />
          </BrowserRouter>
        </EncryptionProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
