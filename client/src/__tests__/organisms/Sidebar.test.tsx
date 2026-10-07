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
    for (const title of ['Dashboard', 'Journal', 'Topics', 'Health', 'Roadmap', 'Calendar', 'From the Kitchen', 'Settings']) {
      expect(screen.getByTitle(title)).toBeInTheDocument();
    }
  });

  it('navigates and closes the mobile drawer when a nav item is clicked', () => {
    renderAt();
    fireEvent.click(screen.getByTitle('Journal'));
    expect(mockNavigate).toHaveBeenCalledWith('/journal');
    expect(mockSetMobileNavOpen).toHaveBeenCalledWith(false);
  });

  it('routes the Kitchen and Health icons to their dashboards', () => {
    renderAt();
    fireEvent.click(screen.getByTitle('From the Kitchen'));
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
