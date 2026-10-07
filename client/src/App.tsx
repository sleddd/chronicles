import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { lightTheme, darkTheme } from '@shared/theme/tokens';
import { useUIStore } from './stores/uiStore.js';
import { GlobalStyle } from './styles/GlobalStyle.js';
import { AuthProvider } from './contexts/AuthContext.js';
import { EncryptionProvider } from './contexts/EncryptionContext.js';
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
import { PlannerFilterView } from './views/PlannerFilterView.js';
import { TopicEntriesView } from './views/TopicEntriesView.js';
import { HealthView } from './views/HealthView.js';
import { HealthDashboardView } from './views/HealthDashboardView.js';
import { MealsLogView } from './views/MealsLogView.js';
import { MealsTabBar } from './components/molecules/MealsTabBar.js';
import { MedicationScheduleView } from './views/MedicationScheduleView.js';
import { HealthReportingView } from './views/HealthReportingView.js';
import { MenuView } from './views/MenuView.js';
import { ShoppingListsView } from './views/ShoppingListsView.js';
import { DashboardView } from './views/DashboardView.js';

/* ── Design token CSS variable sets ─────────────────────────────────────────
   Ported from design-system/tokens/*.css. Light = pure white canvas; dark =
   deep charcoal (#1b1d26). Borderless tonal panels: surfaces separate by FILL,
   not outline; shadows are reserved for floating overlays only.

   Legacy aliases (--paper*, --ink*, --rule*, --btn-*, --accent-fill*) are kept
   pointing at the DS values so the ~147 existing components recolor without
   per-component edits. New/restructured components should reference the DS
   names (--bg-*, --text-*, --border-*, --color-accent*) directly.
   ─────────────────────────────────────────────────────────────────────────── */

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
  '--text-secondary':    '#4c4c55',
  '--text-tertiary':     '#74747f',
  '--text-disabled':     '#a0a0aa',
  '--text-inverse':      '#ffffff',
  /* DS borders — hairlines only */
  '--border-subtle':     '#e4e6ec',
  '--border-default':    '#d8dae2',
  '--border-strong':     '#c4c7d2',
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
  '--ink-2':             '#56565f',
  '--ink-3':             '#74747f',
  '--ink-4':             '#a0a0aa',
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
  '--bg-app':            '#1b1d26',
  '--bg-surface':        '#22252f',
  '--bg-elevated':       '#2a2d38',
  '--bg-sunken':         '#13151e',
  '--bg-hover':          '#2a2d38',
  '--bg-active':         '#303545',
  '--bg-inverse':        '#f5f6f9',
  '--text-primary':      '#f4f4f6',
  '--text-secondary':    '#a0a0aa',
  '--text-tertiary':     '#74747f',
  '--text-disabled':     '#56565f',
  '--text-inverse':      '#0d0d10',
  '--border-subtle':     '#262931',
  '--border-default':    '#2e3140',
  '--border-strong':     '#3a3e50',
  '--color-success':     '#2f9e6b',  '--color-success-subtle': '#1c3a2c',
  '--color-warning':     '#d8941f',  '--color-warning-subtle': '#3a2f14',
  '--color-danger':      '#d8483f',  '--color-danger-subtle':  '#3a1e1c',
  '--color-info':        '#2f7fd8',  '--color-info-subtle':    '#16283a',

  /* DS neutral grays for dark theme */
  '--neutral-300': '#3a3e50',
  '--neutral-700': '#74747f',

  /* ── Legacy aliases → DS values ── */
  '--paper':             '#1b1d26',
  '--paper-deep':        '#13151e',
  '--paper-surface':     '#22252f',
  '--paper-well':        '#303545',
  '--paper-hover':       '#2a2d38',
  '--ink':               '#f4f4f6',
  '--ink-2':             '#a0a0aa',
  '--ink-3':             '#74747f',
  '--ink-4':             '#56565f',
  '--rule':              '#262931',
  '--rule-2':            '#262931',
  '--btn-primary':       '#f4f4f6',
  '--btn-primary-ink':   '#1b1d26',
  '--btn-primary-hover': '#e0e0e4',
  '--accent-fill':       '#f4f4f6',
  '--accent-fill-ink':   '#1b1d26',
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
  '--r-lg':  '2px',
  '--r-xl':  '2px',
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
  '--radius-lg':   '2px',
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
  '--shadow-ring':  '0 0 0 3px var(--color-accent, #00b4d8), 0 1px 2px rgba(20, 20, 30, 0.08)',

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

function isLightHex(hex: string): boolean {
  const [r, g, b] = hexToRgbParts(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.75;
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

/* Build the DS accent scale (--accent-100..800) from a single base hex.
   Lighter steps mix toward white, darker steps toward black — mirrors the
   tonal ramps in design-system/tokens/accents.css. */
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
    const color = accentColor || '#5b53d6';
    const [r, g, b] = hexToRgbParts(color);

    root.setAttribute('data-theme', isDark ? 'dark' : 'light');

    /* Theme-based tokens (flip between light and dark) */
    const themeVars = isDark ? DARK_CSS_VARS : LIGHT_CSS_VARS;
    Object.entries(themeVars).forEach(([k, v]) => root.style.setProperty(k, v));

    /* DS accent scale (--accent-100..800) derived from the chosen hex */
    Object.entries(deriveAccentScale(color)).forEach(([k, v]) => root.style.setProperty(k, v));

    /* DS interactive accent tokens. In dark, brighten one notch (use the
       lighter 400/300 steps) for legibility on the charcoal canvas. */
    const onAccent = isLightHex(color) ? '#18181c' : '#ffffff';
    root.style.setProperty('--color-accent',        isDark ? mix(color, 255, 0.22) : color);
    root.style.setProperty('--color-accent-hover',  isDark ? mix(color, 255, 0.40) : deriveDarker(color, 0.85));
    root.style.setProperty('--color-accent-active', isDark ? mix(color, 255, 0.58) : deriveDarker(color, 0.70));
    root.style.setProperty('--color-accent-subtle', isDark ? `rgba(${r},${g},${b},0.22)` : `rgba(${r},${g},${b},0.10)`);
    root.style.setProperty('--color-accent-text',   isDark ? mix(color, 255, 0.40) : deriveDarker(color, 0.78));
    root.style.setProperty('--on-accent', onAccent);

    /* Legacy accent tokens (existing components still read these) */
    root.style.setProperty('--accent', isDark ? mix(color, 255, 0.22) : color);
    root.style.setProperty('--accent-hover', isDark ? mix(color, 255, 0.40) : deriveDarker(color, 0.85));
    root.style.setProperty('--accent-tint', isDark ? `rgba(${r},${g},${b},0.22)` : `rgba(${r},${g},${b},0.12)`);
    root.style.setProperty('--accent-stroke', deriveAccentStroke(color));
    root.style.setProperty('--accent-fill', isDark ? mix(color, 255, 0.22) : color);
    root.style.setProperty('--accent-fill-ink', onAccent);
    root.style.setProperty('--h-active', isDark ? mix(color, 255, 0.22) : color);
    root.style.setProperty('--h-active-ink', onAccent);
    root.style.setProperty('--focus', `0 0 0 3px rgba(${r},${g},${b},0.28)`);
    root.style.setProperty('--ring', `rgba(${r},${g},${b},0.55)`);

    /* Legacy vars for existing components that depend on them */
    root.style.setProperty('--focus-color', color);
    root.style.setProperty('--focus-color-rgb', `${r},${g},${b}`);
  }, [accentColor, isDark]);

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
              <Route path="/menu/recipes" element={<R><HealthView topicNames={['Recipe', 'Recipes']} metaFields={[{ key: 'category', label: 'Category' }, { key: 'servings', label: 'Serves' }, { key: 'prepTime', label: 'Prep' }, { key: 'cookTime', label: 'Cook' }]} showDateFilter={false} title="Recipes" tabBar={<MealsTabBar />} /></R>} />
              <Route path="/menu/meals" element={<R><MealsLogView title="Meals" tabBar={<MealsTabBar />} /></R>} />
              <Route path="/shopping" element={<R><ShoppingListsView /></R>} />

              {/* Health */}
              <Route path="/health" element={<R><HealthDashboardView /></R>} />
              <Route path="/health/meds" element={<R><HealthView topicNames={['Medication']} metaFields={[{ key: 'dosage', label: 'Dosage' }, { key: 'frequency', label: 'Frequency' }, { key: 'isActive', label: 'Active' }]} showDateFilter={false} printable printTitle="Medications" /></R>} />
              <Route path="/health/schedule" element={<R><MedicationScheduleView /></R>} />
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
          </BrowserRouter>
        </EncryptionProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
