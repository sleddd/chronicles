import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
    featureFlags = { medicationEnabled: true, foodEnabled: true, exerciseEnabled: true, allergiesEnabled: true };
  });

  it('renders every nav destination', () => {
    renderAt();
    expect(screen.queryByTitle('Today')).not.toBeInTheDocument();
    for (const title of ['Journal', 'Topics', 'Health', 'Planning', 'Calendar', 'Kitchen', 'Settings']) {
      expect(screen.getByTitle(title)).toBeInTheDocument();
    }
  });

  it('the logo opens the dashboard (there is no dashboard item)', () => {
    renderAt();
    fireEvent.click(screen.getByTitle('Chronicles'));
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
  });

  it('has a Sign out button under Settings that signs out', () => {
    renderAt();
    const titles = Array.from(document.querySelectorAll('button[title]')).map(b => b.getAttribute('title'));
    expect(titles.slice(-3)).toEqual(['Settings', 'Lock — your password opens it again', 'Sign out']);
    fireEvent.click(screen.getByTitle('Sign out'));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('locks from the Lock button just above Sign out', () => {
    renderAt();
    fireEvent.click(screen.getByTitle('Lock — your password opens it again'));
    expect(mockLock).toHaveBeenCalledTimes(1);
    expect(mockSignOut).not.toHaveBeenCalled();
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
});
