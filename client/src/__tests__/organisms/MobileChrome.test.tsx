import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '@shared/theme/tokens';
import { MobileChrome } from '@/components/organisms/MobileChrome';

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
  beforeEach(() => { vi.clearAllMocks(); open = true; });

  it('shows every destination as an icon over its name, marking the current one', () => {
    renderAt('/journal');
    for (const name of ['Journal', 'Topics', 'Health', 'Planning', 'Calendar', 'Kitchen', 'Settings']) {
      expect(screen.getByRole('button', { name: new RegExp(name), hidden: true })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: /Journal/, hidden: true })).toHaveAttribute('aria-current', 'page');
  });

  it('navigates and closes when a destination is tapped', () => {
    renderAt();
    fireEvent.click(screen.getByRole('button', { name: /Calendar/, hidden: true }));
    expect(mockNavigate).toHaveBeenCalledWith('/calendar');
    expect(mockSetOpen).toHaveBeenCalledWith(false);
  });

  it('is not shown while closed', () => {
    open = false;
    renderAt();
    expect(screen.queryByRole('navigation', { name: 'Main', hidden: true })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open menu', hidden: true })).toHaveAttribute('aria-expanded', 'false');
  });
});
