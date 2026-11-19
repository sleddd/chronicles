import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '@shared/theme/tokens';
import { Sidebar } from '@/components/organisms/Sidebar';

const mockNavigate = vi.fn();
const mockSetMobileNavOpen = vi.fn();
let featureFlags: Record<string, boolean> = {};

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => mockNavigate,
}));

vi.mock('@/stores/uiStore', () => ({
  useUIStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ mobileNavOpen: false, setMobileNavOpen: mockSetMobileNavOpen }),
}));

const mockSignOut = vi.fn().mockResolvedValue(undefined);
vi.mock('@/hooks/useSignOut', () => ({ useSignOut: () => mockSignOut }));
// The reminders bell has its own tests
vi.mock('@/components/organisms/NotificationBell', () => ({ NotificationBell: () => null }));

vi.mock('@/stores/entriesStore', () => ({
  useEntriesStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ featureFlags }),
}));

function renderAt(path = '/') {
  return render(
    <ThemeProvider theme={lightTheme}>
      <MemoryRouter initialEntries={[path]}><Sidebar /></MemoryRouter>
    </ThemeProvider>
  );
}

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // These look at the collapsed rail (icons, names as tooltips); it starts expanded now
    localStorage.setItem('nav-expanded-v1', '0');
    featureFlags = { medicationEnabled: true, foodEnabled: true, exerciseEnabled: true, allergiesEnabled: true };
  });

  it('renders every nav destination', () => {
    renderAt();
    expect(screen.queryByTitle('Today')).not.toBeInTheDocument();
    for (const title of ['Journal', 'Topics', 'Health', 'Planning', 'Calendar', 'Kitchen', 'Media']) {
      expect(screen.getByTitle(title)).toBeInTheDocument();
    }
    // Settings is its own row, above Collapse
    expect(screen.getByTitle('Settings')).toBeTruthy();
  });

  it('the logo opens the dashboard (there is no dashboard item)', () => {
    renderAt();
    fireEvent.click(screen.getByTitle('Chronicles'));
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
  });

  it('ends with Settings, expand / collapse, then ⋯ (Sign out — there is no Lock)', () => {
    renderAt();
    const titles = Array.from(document.querySelectorAll('aside button[title]')).map(b => b.getAttribute('title'));
    expect(titles.slice(-4)).toEqual(['Kitchen', 'Settings', 'Show names', 'Sign out']);
    // Media sits right under Journal
    expect(titles.indexOf('Media')).toBe(titles.indexOf('Journal') + 1);
    const more = screen.getByRole('button', { name: 'More' });
    expect(more).toHaveAttribute('aria-haspopup', 'menu');
    fireEvent.click(more);
    const menu = screen.getByRole('menu', { name: 'More' });
    expect(within(menu).getAllByRole('menuitem').map(i => i.textContent?.replace(/^(lock|logout)/, ''))).toEqual(['Sign out']);
    fireEvent.click(screen.getByTitle('Settings'));
    expect(mockNavigate).toHaveBeenCalledWith('/settings');
  });

  it('signs out from the ⋯ menu', () => {
    renderAt();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Sign out/ }));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('closes the ⋯ menu on Escape or a click outside', () => {
    renderAt();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('has no Report a bug button (that lives in Settings)', () => {
    renderAt();
    expect(screen.queryByTitle('Report a bug')).toBeNull();
  });

  it('has no Lock item: a signed-in tab is never left locked with its session alive', () => {
    renderAt();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.queryByRole('menuitem', { name: /Lock/ })).toBeNull();
  });

  it('lifts the Settings row while in Settings', () => {
    renderAt('/settings');
    expect(screen.getByTitle('Settings').className).not.toBe(screen.getByTitle('Kitchen').className);
  });

  it('navigates when a nav item is clicked', () => {
    renderAt();
    fireEvent.click(screen.getByTitle('Journal'));
    expect(mockNavigate).toHaveBeenCalledWith('/journal');
  });

  it('routes the Kitchen and Health icons to their dashboards', () => {
    renderAt();
    fireEvent.click(screen.getByTitle('Kitchen'));
    fireEvent.click(screen.getByTitle('Health'));
    expect(mockNavigate).toHaveBeenCalledWith('/kitchen');
    expect(mockNavigate).toHaveBeenCalledWith('/health');
  });

  it('hides Health when every health feature is turned off', () => {
    featureFlags = { medicationEnabled: false, foodEnabled: false, exerciseEnabled: false, allergiesEnabled: false };
    renderAt();
    expect(screen.queryByTitle('Health')).not.toBeInTheDocument();
  });

  it('keeps Health when any one health feature is on', () => {
    featureFlags = { medicationEnabled: false, foodEnabled: true, exerciseEnabled: false, allergiesEnabled: false };
    renderAt();
    expect(screen.getByTitle('Health')).toBeInTheDocument();
  });

  it('renders the active route differently from the rest', () => {
    renderAt('/calendar');
    const active = screen.getByTitle('Calendar');
    const inactive = screen.getByTitle('Journal');
    expect(active.className).not.toBe(inactive.className);
  });

  it('expands to show each item’s name, and remembers it', () => {
    const { unmount } = renderAt();
    const toggle = screen.getByRole('button', { name: 'Show names' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Collapse' })).toHaveAttribute('aria-expanded', 'true');
    // names are shown (no tooltips needed) and still name each button
    expect(screen.getByRole('button', { name: 'Journal' })).not.toHaveAttribute('title');
    expect(screen.getByText('Planning')).toBeVisible();
    unmount();
    renderAt();
    expect(screen.getByRole('button', { name: 'Collapse' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));
    expect(screen.getByTitle('Journal')).toBeInTheDocument();
  });

  it('starts expanded when nothing is remembered', () => {
    localStorage.clear();
    renderAt();
    expect(screen.getByRole('button', { name: 'Collapse' })).toHaveAttribute('aria-expanded', 'true');
  });

  describe('expanded: each section’s views', () => {
    beforeEach(() => { localStorage.clear(); });

    it('every section starts closed; its chevron opens its views, the one showing marked, and opening another closes it', () => {
      renderAt('/health/symptoms');
      expect(screen.queryByRole('list', { name: 'Health views' })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Show Health views' }));
      const health = screen.getByRole('list', { name: 'Health views' });
      expect(within(health).getAllByRole('button').map(b => b.textContent)).toEqual(
        ['Dashboard', 'Meals', 'Exercise', 'Habits', 'Symptoms', 'Med list', 'Med history', 'Allergies', 'Reports']);
      expect(within(health).getByRole('button', { name: 'Symptoms' })).toHaveAttribute('aria-current', 'page');
      // One at a time: opening Planning closes Health
      fireEvent.click(screen.getByRole('button', { name: 'Show Planning views' }));
      expect(screen.queryByRole('list', { name: 'Health views' })).toBeNull();
      const planning = screen.getByRole('list', { name: 'Planning views' });
      fireEvent.click(within(planning).getByRole('button', { name: 'Roadmap' }));
      expect(mockNavigate).toHaveBeenCalledWith('/goals/roadmap');
    });

    it('leaves out views whose feature is off, and remembers nothing: a reload starts closed', () => {
      featureFlags = { medicationEnabled: false, foodEnabled: true, exerciseEnabled: true, allergiesEnabled: true };
      localStorage.setItem('nav-sections-open-v1', '{"health":true}');
      const { unmount } = renderAt('/health');
      expect(screen.queryByRole('list', { name: 'Health views' })).toBeNull();
      expect(localStorage.getItem('nav-sections-open-v1')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Show Health views' }));
      expect(within(screen.getByRole('list', { name: 'Health views' })).queryByRole('button', { name: 'Med list' })).toBeNull();
      unmount();
      renderAt('/health');
      expect(screen.queryByRole('list', { name: 'Health views' })).toBeNull();
    });

    it('collapsed, no views show (icons only)', () => {
      localStorage.setItem('nav-expanded-v1', '0');
      renderAt('/health');
      expect(screen.queryByRole('list', { name: 'Health views' })).toBeNull();
    });
  });
});
