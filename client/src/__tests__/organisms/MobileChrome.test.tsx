import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '@shared/theme/tokens';
import { MobileChrome } from '@/components/organisms/MobileChrome';
import { resetNavSections } from '@/hooks/useNavSections';

const mockNavigate = vi.fn();
const mockSetOpen = vi.fn();
let open = true;

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => mockNavigate,
}));

vi.mock('@/stores/uiStore', () => ({
  useUIStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ mobileNavOpen: open, setMobileNavOpen: mockSetOpen }),
}));

const mockSignOut = vi.fn().mockResolvedValue(undefined);
vi.mock('@/hooks/useSignOut', () => ({ useSignOut: () => mockSignOut }));

vi.mock('@/stores/entriesStore', () => ({
  useEntriesStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ featureFlags: { foodEnabled: true } }),
}));

function renderAt(path = '/journal') {
  return render(
    <ThemeProvider theme={lightTheme}>
      <MemoryRouter initialEntries={[path]}><MobileChrome /></MemoryRouter>
    </ThemeProvider>
  );
}

// The bar and menu are display:none outside the phone breakpoint (jsdom), so queries include hidden elements
describe('MobileChrome drop-down menu', () => {
  beforeEach(() => {
    resetNavSections();
    localStorage.clear(); vi.clearAllMocks(); open = true; });

  it('shows every destination as an icon over its name, marking the current one', () => {
    renderAt('/journal');
    for (const name of ['Home', 'Journal', 'Topics', 'Health', 'Planning', 'Calendar', 'Kitchen', 'Settings']) {
      expect(screen.getByRole('button', { name: new RegExp(`${name}$`), hidden: true })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: /Journal/, hidden: true })).toHaveAttribute('aria-current', 'page');
  });

  it('sections start closed; one opens at a time under its row, and a view closes the menu on the way there', () => {
    renderAt('/goals/planner');
    expect(screen.queryByRole('list', { name: 'Planning views', hidden: false })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show Planning views', hidden: true }));
    const planning = screen.getByRole('list', { name: 'Planning views', hidden: true });
    expect(within(planning).getByRole('button', { name: 'Planner', hidden: true })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: 'Show Kitchen views', hidden: true }));
    expect(screen.getByRole('button', { name: 'Show Planning views', hidden: true })).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(within(screen.getByRole('list', { name: 'Kitchen views', hidden: true })).getByRole('button', { name: 'Recipes', hidden: true }));
    expect(mockNavigate).toHaveBeenCalledWith('/menu/recipes');
    expect(mockSetOpen).toHaveBeenCalledWith(false);
  });

  it('navigates and closes when a destination is tapped', () => {
    renderAt();
    fireEvent.click(screen.getByRole('button', { name: /Calendar/, hidden: true }));
    expect(mockNavigate).toHaveBeenCalledWith('/calendar');
    expect(mockSetOpen).toHaveBeenCalledWith(false);
  });

  it('signs out from under Settings, closing the menu', () => {
    renderAt();
    fireEvent.click(screen.getByRole('button', { name: /Sign out/, hidden: true }));
    expect(mockSetOpen).toHaveBeenCalledWith(false);
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('has no Lock row: Settings, then Sign out', () => {
    renderAt();
    const rows = screen.getAllByRole('button', { hidden: true }).map(b => b.textContent);
    expect(rows.some(r => /Lock/.test(r ?? ''))).toBe(false);
    expect(rows.at(-1)).toBe('logoutSign out');
  });

  it('is not shown while closed', () => {
    open = false;
    renderAt();
    expect(screen.queryByRole('navigation', { name: 'Main', hidden: true })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open menu', hidden: true })).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens the menu from the logo', () => {
    open = false;
    renderAt();
    fireEvent.click(screen.getByRole('button', { name: 'Open menu', hidden: true }));
    expect(mockSetOpen).toHaveBeenCalledWith(true);
  });

  it('starts the menu with Home, which opens the dashboard', () => {
    renderAt('/journal');
    fireEvent.click(screen.getByRole('button', { name: /Home/, hidden: true }));
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
  });
});
