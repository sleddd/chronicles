import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { lightTheme, darkTheme } from '@shared/theme/tokens';
import { useUIStore } from './stores/uiStore.js';
import { GlobalStyle } from './styles/GlobalStyle.js';
import { AuthProvider, useAuth } from './contexts/AuthContext.js';
import { EncryptionProvider, useEncryption } from './contexts/EncryptionContext.js';
import { ProtectedRoute } from './components/organisms/ProtectedRoute.js';
import { useCalendarSync } from './hooks/useCalendarSync.js';
import { LoginView } from './views/LoginView.js';
import { RegisterView } from './views/RegisterView.js';
import { RecoverView } from './views/RecoverView.js';
import { JournalView } from './views/JournalView.js';
import { SettingsView } from './views/SettingsView.js';
import { SharedEntryView } from './views/SharedEntryView.js';
import { TopicsView } from './views/TopicsView.js';
import { TopicDetailView } from './views/TopicDetailView.js';
import { CalendarView } from './views/CalendarView.js';
import { GoalsView } from './views/GoalsView.js';
import { FinanceReconcileView } from './views/FinanceReconcileView.js';
import { FinanceBudgetView } from './views/FinanceBudgetView.js';
import { FinanceGoalsView } from './views/FinanceGoalsView.js';
import { FinanceSavingsView } from './views/FinanceSavingsView.js';
import { FinanceReportsView } from './views/FinanceReportsView.js';
import { PlannerFilterView } from './views/PlannerFilterView.js';
import { TopicEntriesView } from './views/TopicEntriesView.js';
import { HealthView } from './views/HealthView.js';
import { HealthDashboardView } from './views/HealthDashboardView.js';
import { MealsLogView } from './views/MealsLogView.js';
import { KitchenDashboardView } from './views/KitchenDashboardView.js';
import { AiChat } from './components/organisms/AiChat.js';
import { UpdatePrompt } from './components/organisms/UpdatePrompt.js';
import { KITCHEN_TITLE, MealsTabBar } from './components/molecules/MealsTabBar.js';
import { HealthReportingView } from './views/HealthReportingView.js';
import { MenuView } from './views/MenuView.js';
import { ShoppingListsView } from './views/ShoppingListsView.js';
import { DashboardView } from './views/DashboardView.js';
import { DEFAULT_ACCENT_COLOR } from './styles/accent.js';

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
  /* DS semantic surfaces */
  '--bg-app':            '#ffffff',
  '--bg-surface':        '#ffffff',
  '--bg-elevated':       '#ffffff',
  '--bg-sunken':         '#f5f6f8',
  '--bg-hover':          '#f8f9fa',
  '--bg-active':         '#f0f2f5',
  '--bg-inverse':        '#1b1d26',
  /* DS text */
  '--text-primary':      '#18181c',
  '--text-secondary':    '#26262c',
  '--text-tertiary':     '#3a3a42',
  '--text-disabled':     '#57575f',
  '--text-tab':          '#3a3a42',  /* inactive section tabs */
  '--text-meta':         '#8a8c95',  /* list-row topic + date: recede behind the entry */
  '--text-muted':        '#8a8c95',  /* card subtitles, chevrons, + icons */
  '--text-placeholder':  '#a0a3ab',
  '--control-border':    '#c4c7d2',  /* unticked round checks */
  '--border-card':       '#e4e6ec',  /* card outlines + their inner rules/boxes */
  '--bg-row-hover':      '#f3f4f7',  /* a row lifting inside a card on hover */
  '--text-soft':         '#6b6e77',  /* toolbar text buttons, chevrons */
  '--text-faint':        '#c4c7d2',  /* quiet + marks in empty slots */
  '--bg-tile':           '#f3f4f7',  /* a filled tile on the canvas (menu meals) */
  '--bg-today-col':      '#f7f8fa',  /* today's column band */
  '--border-pop':        '#e4e6ec',  /* floating menus' outline */
  '--border-dashed':     '#d8dae2',  /* dashed outline of an empty slot on hover */
  '--text-hint':         '#b3b6bd',  /* placeholders in big borderless fields */
  '--text-inverse':      '#ffffff',
  /* DS borders — hairlines only */
  '--border-subtle':     '#e4e6ec',
  '--border-default':    '#d8dae2',
  '--border-strong':     '#c4c7d2',
  '--border-field':      '#e4e6ec',  /* faint outline on styled-form boxes + nutrition panel */
  /* Nav rail — its own toned panel: darker logo cell, active item lifted */
  '--bg-rail':           '#f3f4f7',
  '--bg-rail-logo':      '#e8eaef',
  '--bg-rail-active':    '#ffffff',
  /* Chart series — muted, same chroma as the accent presets */
  '--chart-blue':        '#4f8fd1',
  '--chart-violet':      '#8a6fd1',
  '--chart-amber':       '#c98f3e',
  '--chart-green':       '#4f9e74',
  /* Mood faces, very low → great (wellness check-in) */
  '--mood-1': '#cf6a62', '--mood-2': '#d48a63', '--mood-3': '#c49a45', '--mood-4': '#5c9e78', '--mood-5': '#3f9a8c',
  /* Status */
  '--color-success':     '#2f9e6b',  '--color-success-subtle': '#e2f4eb',
  '--color-warning':     '#d8941f',  '--color-warning-subtle': '#fbefd7',
  '--color-danger':      '#d8483f',  '--color-danger-subtle':  '#fae4e2',
  '--color-info':        '#2f7fd8',  '--color-info-subtle':    '#e1eefb',

  /* DS neutral grays for light theme */
  '--neutral-300': '#e4e6ec',
  '--neutral-700': '#a0a0aa',

  /* ── Legacy aliases → DS values ── */
  '--paper':             '#ffffff',
  '--paper-deep':        '#f5f6f8',
  '--paper-surface':     '#ffffff',
  '--paper-well':        '#f0f2f5',
  '--paper-hover':       '#f8f9fa',
  '--ink':               '#18181c',
  '--ink-2':             '#2b2b31',
  '--ink-3':             '#3a3a42',
  '--ink-4':             '#57575f',
  '--rule':              '#e4e6ec',
  '--rule-2':            '#e4e6ec',
  '--btn-primary':       '#18181c',
  '--btn-primary-ink':   '#ffffff',
  '--btn-primary-hover': '#28282e',
  '--accent-fill':       '#18181c',
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
};

const DARK_CSS_VARS: Record<string, string> = {
  '--bg-app':            '#20232a',
  '--bg-surface':        '#272a33',
  '--bg-elevated':       '#2e323c',
  '--bg-sunken':         '#1a1c22',
  '--bg-hover':          '#2b2f38',
  '--bg-active':         '#333844',
  '--bg-inverse':        '#f1f2f5',
  '--text-primary':      '#f7f8fa',
  '--text-secondary':    '#e6e9ee',
  '--text-tertiary':     '#cdd2da',
  '--text-disabled':     '#a3a9b5',
  '--text-tab':          '#aeb4bf',  /* inactive section tabs — a step under tertiary */
  '--text-meta':         '#a9b0c8',  /* list-row topic + date: recede behind the entry */
  '--text-muted':        '#7c7f88',  /* card subtitles, chevrons, + icons */
  '--text-placeholder':  '#6c6f78',
  '--control-border':    '#5b5f69',  /* unticked round checks */
  '--border-card':       '#31343d',  /* card outlines + their inner rules/boxes */
  '--bg-row-hover':      '#2f313a',  /* a row lifting inside a card on hover */
  '--text-soft':         '#a5a8b0',  /* toolbar text buttons, chevrons */
  '--text-faint':        '#464a54',  /* quiet + marks in empty slots */
  '--bg-tile':           '#2c2e37',  /* a filled tile on the canvas (menu meals) */
  '--bg-today-col':      '#262831',  /* today's column band */
  '--border-pop':        '#373a44',  /* floating menus' outline */
  '--border-dashed':     '#3b3f49',  /* dashed outline of an empty slot on hover */
  '--text-hint':         '#60636c',  /* placeholders in big borderless fields */
  '--text-inverse':      '#14161b',
  '--border-subtle':     '#2c2f3a',
  '--border-default':    '#343844',
  '--border-strong':     '#3e4350',
  '--border-field':      '#30333f',  /* faint outline on styled-form boxes + nutrition panel */
  /* Nav rail — its own toned panel: darker logo cell, active item lifted */
  '--bg-rail':           '#272a33',
  '--bg-rail-logo':      '#1a1c22',
  '--bg-rail-active':    '#353a46',
  /* Chart series — brightened a notch for the slate canvas */
  '--chart-blue':        '#6aa6e6',
  '--chart-violet':      '#a68cf0',
  '--chart-amber':       '#e0ae68',
  '--chart-green':       '#6cc093',
  '--mood-1': '#ea8a83', '--mood-2': '#eba584', '--mood-3': '#e0b468', '--mood-4': '#7cc49a', '--mood-5': '#6cc4b4',
  '--color-success':     '#2f9e6b',  '--color-success-subtle': '#1c3a2c',
  '--color-warning':     '#d8941f',  '--color-warning-subtle': '#3a2f14',
  '--color-danger':      '#d8483f',  '--color-danger-subtle':  '#3a1e1c',
  '--color-info':        '#2f7fd8',  '--color-info-subtle':    '#16283a',

  /* DS neutral grays for dark theme */
  '--neutral-300': '#3e4350',
  '--neutral-700': '#cdd2da',

  /* ── Legacy aliases → DS values ── */
  '--paper':             '#20232a',
  '--paper-deep':        '#1a1c22',
  '--paper-surface':     '#272a33',
  '--paper-well':        '#333844',
  '--paper-hover':       '#2b2f38',
  '--ink':               '#f7f8fa',
  '--ink-2':             '#e6e9ee',
  '--ink-3':             '#cdd2da',
  '--ink-4':             '#a3a9b5',
  '--rule':              '#2c2f3a',
  '--rule-2':            '#2c2f3a',
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
  '--shadow-ring':  '0 0 0 3px var(--color-accent, #34a5a2), 0 1px 2px rgba(20, 20, 30, 0.08)',

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

/** The floating AI chat — only for a signed-in, unlocked journal, never on public pages. */
function ChatGate() {
  const { isAuthenticated } = useAuth();
  const { isUnlocked } = useEncryption();
  const { pathname } = useLocation();
  const publicPage = ['/login', '/register', '/recover', '/share'].some(p => pathname.startsWith(p));
  if (!isAuthenticated || !isUnlocked || publicPage) return null;
  return <AiChat />;
}

function R({ children }: { children: React.ReactNode }) {
  useCalendarSync();
  return <ProtectedRoute>{children}</ProtectedRoute>;
}

export function App() {
  const accentColor = useUIStore(s => s.accentColor);
  const themeMode = useUIStore(s => s.themeMode);
  const isDark = themeMode === 'dark';
  const activeTheme = isDark ? darkTheme : lightTheme;

  useEffect(() => {
    const color = accentColor || DEFAULT_ACCENT_COLOR;
    const [r, g, b] = hexToRgbParts(color);

    root.setAttribute('data-theme', isDark ? 'dark' : 'light');

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
    root.style.setProperty('--color-accent-text',   isDark ? color : deriveDarker(color, 0.78));
    root.style.setProperty('--on-accent', onAccent);
    // Lighter accent shades for text on dark (links, today's label); deeper in light
    root.style.setProperty('--color-accent-link', isDark ? mix(color, 255, 0.24) : deriveDarker(color, 0.85));
    root.style.setProperty('--color-accent-soft', isDark ? mix(color, 255, 0.40) : deriveDarker(color, 0.78));

    /* Nav accent (active rail icon + tab): the exact accent too */
    root.style.setProperty('--color-accent-nav', color);

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
            <Routes>
              {/* Public */}
              <Route path="/login" element={<LoginView />} />
              <Route path="/register" element={<RegisterView />} />
              <Route path="/recover" element={<RecoverView />} />
              <Route path="/share/:token" element={<SharedEntryView />} />

              {/* Core */}
              <Route path="/" element={<R><DashboardView /></R>} />
              <Route path="/journal" element={<R><JournalView /></R>} />
              <Route path="/settings" element={<R><SettingsView /></R>} />
              <Route path="/topics" element={<R><TopicsView /></R>} />
              <Route path="/topics/:topicId" element={<R><TopicDetailView /></R>} />
              <Route path="/calendar" element={<R><CalendarView /></R>} />
              <Route path="/goals" element={<R><GoalsView /></R>} />
              <Route path="/goals/milestones" element={<R><GoalsView /></R>} />
              <Route path="/goals/tasks" element={<R><GoalsView /></R>} />
              <Route path="/goals/todos" element={<R><GoalsView /></R>} />
              <Route path="/goals/filter" element={<R><PlannerFilterView /></R>} />
              <Route path="/menu" element={<R><MenuView /></R>} />
              <Route path="/menu/recipes" element={<R><HealthView topicNames={['Recipe', 'Recipes']} metaFields={[{ key: 'category', label: 'Category' }, { key: 'servings', label: 'Serves' }, { key: 'prepTime', label: 'Prep' }, { key: 'cookTime', label: 'Cook' }]} showDateFilter={false} title={KITCHEN_TITLE} tabBar={<MealsTabBar />} /></R>} />
              <Route path="/kitchen" element={<R><KitchenDashboardView /></R>} />
              <Route path="/menu/meals" element={<Navigate to="/health/food" replace />} />
              <Route path="/shopping" element={<R><ShoppingListsView /></R>} />

              {/* Health */}
              <Route path="/finance" element={<R><FinanceBudgetView /></R>} />
              <Route path="/finance/budget" element={<Navigate to="/finance" replace />} />
              <Route path="/finance/reconcile" element={<R><FinanceReconcileView /></R>} />
              <Route path="/finance/reports" element={<R><FinanceReportsView /></R>} />
              <Route path="/finance/goals" element={<R><FinanceGoalsView /></R>} />
              <Route path="/finance/savings" element={<R><FinanceSavingsView /></R>} />
              <Route path="/health" element={<R><HealthDashboardView /></R>} />
              <Route path="/health/meds" element={<R><HealthView topicNames={['Medication']} metaFields={[{ key: 'dosage', label: 'Dosage' }, { key: 'frequency', label: 'Frequency' }, { key: 'isActive', label: 'Active' }]} showDateFilter={false} printable printTitle="Medications" /></R>} />
              <Route path="/health/schedule" element={<Navigate to="/health" replace />} />
              <Route path="/health/food" element={<R><MealsLogView /></R>} />
              <Route path="/health/symptoms" element={<R><HealthView topicNames={['Symptom']} metaFields={[{ key: 'severity', label: 'Severity' }, { key: 'duration', label: 'Duration' }]} printable printTitle="Symptoms" /></R>} />
              <Route path="/health/exercise" element={<R><HealthView topicNames={['Exercise']} metaFields={[{ key: 'exerciseType', label: 'Type' }, { key: 'duration', label: 'Duration' }, { key: 'intensity', label: 'Intensity' }]} summaryFields={[{ key: 'duration', label: 'Total Minutes' }, { key: 'calories', label: 'Total Calories' }]} /></R>} />
              <Route path="/health/allergies" element={<R><HealthView topicNames={['Allergy']} metaFields={[{ key: 'severity', label: 'Severity' }, { key: 'allergen', label: 'Allergen' }, { key: 'reaction', label: 'Reaction' }]} printable printTitle="Allergies" /></R>} />
              <Route path="/health/reporting" element={<R><HealthReportingView /></R>} />

              {/* Entertainment */}
              <Route path="/entertainment/music" element={<R><TopicEntriesView title="Music" topicNames={['Music']} showDateFilter={false} /></R>} />
              <Route path="/entertainment/books" element={<R><TopicEntriesView title="Books" topicNames={['Books']} showDateFilter={false} /></R>} />
              <Route path="/entertainment/tv" element={<R><TopicEntriesView title="TV/Movies" topicNames={['TV/Movies']} showDateFilter={false} /></R>} />

              {/* Inspiration */}
              <Route path="/inspiration/research" element={<R><TopicEntriesView title="Research" topicNames={['Research']} showDateFilter={false} /></R>} />
              <Route path="/inspiration/quotes" element={<R><TopicEntriesView title="Quotes" topicNames={['Quote']} showDateFilter={false} /></R>} />
            </Routes>
            <ChatGate />
            <UpdatePrompt />
          </BrowserRouter>
        </EncryptionProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
