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
vi.mock('@/components/organisms/NotificationBell', () => ({ NotificationBell: () => null, BellBadge: 'span' }));
const mockLock = vi.hoisted(() => vi.fn());
vi.mock('@/contexts/EncryptionContext', () => ({ useEncryption: () => ({ lock: mockLock }) }));

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
    featureFlags = { medicationEnabled: true, foodEnabled: true, exerciseEnabled: true, allergiesEnabled: true };
  });

  it('renders every nav destination', () => {
    renderAt();
    expect(screen.queryByTitle('Today')).not.toBeInTheDocument();
    for (const title of ['Journal', 'Topics', 'Health', 'Planning', 'Calendar', 'Kitchen']) {
      expect(screen.getByTitle(title)).toBeInTheDocument();
    }
    // Settings lives in the ⋯ menu
    expect(screen.queryByTitle('Settings')).toBeNull();
  });

  it('the logo opens the dashboard (there is no dashboard item)', () => {
    renderAt();
    fireEvent.click(screen.getByTitle('Chronicles'));
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
  });

  it('ends with expand / collapse, then ⋯ (Settings, Lock, Sign out)', () => {
    renderAt();
    const titles = Array.from(document.querySelectorAll('aside button[title]')).map(b => b.getAttribute('title'));
    expect(titles.slice(-3)).toEqual(['Kitchen', 'Show names', 'Settings, lock and sign out']);
    const more = screen.getByRole('button', { name: 'More' });
    expect(more).toHaveAttribute('aria-haspopup', 'menu');
    fireEvent.click(more);
    const menu = screen.getByRole('menu', { name: 'More' });
    expect(within(menu).getAllByRole('menuitem').map(i => i.textContent?.replace(/^(settings|lock|logout)/, ''))).toEqual(['Settings', 'Lock', 'Sign out']);
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Settings/ }));
    expect(mockNavigate).toHaveBeenCalledWith('/settings');
    expect(screen.queryByRole('menu')).toBeNull();
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

  it('locks from the ⋯ menu', () => {
    renderAt();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Lock/ }));
    expect(mockLock).toHaveBeenCalledTimes(1);
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('shows ⋯ as active while in Settings', () => {
    renderAt('/settings');
    const more = screen.getByRole('button', { name: 'More' });
    const kitchen = screen.getByTitle('Kitchen');
    expect(more.className).not.toBe(kitchen.className);
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
});
