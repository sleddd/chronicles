import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { SettingsView } from '@/views/SettingsView';
import { renderWithTheme } from '../testUtils';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(() => mockNavigate),
  useLocation: vi.fn(() => ({ pathname: '/settings', search: '' })),
  Link: ({ children, to, ...props }: any) => <a href={to} {...props}>{children}</a>,
}));

vi.mock('@/hooks/useInitializeData', () => ({
  useInitializeData: vi.fn(() => ({
    isReady: true,
    isLoading: false,
    needsUnlock: false,
    handleUnlock: vi.fn(),
  })),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    user: { email: 'test@example.com' },
    logout: vi.fn(),
  })),
}));

vi.mock('@/contexts/EncryptionContext', () => ({
  useEncryption: vi.fn(() => ({
    lock: vi.fn(),
    rewrapMasterKey: vi.fn().mockResolvedValue({ salt: 's', wrappedMK: 'w', wrapIv: 'iv' }),
    encryptPost: vi.fn(),
  })),
}));

vi.mock('@/stores/uiStore', () => ({
  useUIStore: vi.fn((selector: (s: any) => any) =>
    selector({
      headerColor: '#2d2c2a',
      setHeaderColor: vi.fn(),
      themeMode: 'light',
      setThemeMode: vi.fn(),
      backgroundImage: '',
      setBackgroundImage: vi.fn(),
      backgroundOpacity: 0.5,
      setBackgroundOpacity: vi.fn(),
    })
  ),
}));

vi.mock('@/stores/entriesStore', () => ({
  useEntriesStore: vi.fn((selector: (s: any) => any) =>
    selector({
      clearAll: vi.fn(),
      addDecryptedEntry: vi.fn(),
      decryptedEntries: [],
      allTopics: [],
      setTopics: vi.fn(),
      topics: [],
      setFeatureFlags: vi.fn(),
    })
  ),
}));

vi.mock('@/services/api', () => ({
  auth: { changePassword: vi.fn() },
  settings: { getAll: vi.fn().mockResolvedValue([]), upsert: vi.fn() },
  sessions: { getAll: vi.fn().mockResolvedValue([]), revoke: vi.fn() },
  topics: { getAll: vi.fn().mockResolvedValue([]) },
  calendar: {
    getStatus: vi.fn().mockResolvedValue({ googleConnected: false, googleEmail: null, icsEnabled: false, icsToken: null }),
    getAuthUrl: vi.fn(),
    getAccessToken: vi.fn(),
    disconnectGoogle: vi.fn(),
    enableIcs: vi.fn(),
    regenerateIcs: vi.fn(),
    disableIcs: vi.fn(),
    uploadIcs: vi.fn(),
  },
}));

vi.mock('@/components/templates/SettingsTemplate', () => ({
  SettingsTemplate: ({ title, children }: any) => (
    <div data-testid="settings-template">
      {title && <h1>{title}</h1>}
      {children}
    </div>
  ),
}));

vi.mock('@/components/molecules/SettingsCard', () => ({
  SettingsCard: ({ children }: any) => <div data-testid="settings-card">{children}</div>,
  SettingsRow: ({ title, description, action }: any) => (
    <div data-testid="settings-row">
      <span>{title}</span>
      <span>{description}</span>
      {action}
    </div>
  ),
}));

vi.mock('@/components/molecules/SettingsSection', () => ({
  HeaderRow: ({ children }: any) => <div data-testid="header-row">{children}</div>,
  Title: ({ children }: any) => <h1 data-testid="settings-title">{children}</h1>,
  SectionTitle: ({ children }: any) => <h2 data-testid="section-title">{children}</h2>,
  SectionDescription: ({ children }: any) => <p>{children}</p>,
  DangerTitle: ({ children }: any) => <h2 data-testid="danger-title">{children}</h2>,
  CollapsibleHeader: ({ children, onClick }: any) => <div onClick={onClick}>{children}</div>,
  CollapsibleTitle: ({ children }: any) => <span>{children}</span>,
  CollapsibleDesc: ({ children }: any) => <span>{children}</span>,
  CollapsibleBody: ({ children }: any) => <div>{children}</div>,
  PrivacyCard: ({ children }: any) => <div data-testid="privacy-card">{children}</div>,
  DangerCard: ({ children }: any) => <div data-testid="danger-card">{children}</div>,
  PasswordForm: ({ children }: any) => <div>{children}</div>,
  SessionsList: ({ children }: any) => <div>{children}</div>,
  SessionItem: ({ children }: any) => <div>{children}</div>,
  ColorSection: ({ children }: any) => <div>{children}</div>,
  ColorSectionTitle: ({ children }: any) => <span>{children}</span>,
  ColorSectionDesc: ({ children }: any) => <span>{children}</span>,
}));

vi.mock('@/components/atoms/SettingsAtoms', () => ({
  ActionButton: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  SignOutButton: ({ children, ...props }: any) => <button data-testid="sign-out-btn" {...props}>{children}</button>,
  SelectedColorLabel: ({ children }: any) => <span>{children}</span>,
  BackLink: ({ children, to }: any) => <a href={to}>{children}</a>,
}));

vi.mock('@/components/atoms/Toggle', () => ({
  Toggle: ({ checked, onChange }: any) => (
    <input type="checkbox" checked={checked} onChange={(e: any) => onChange(e.target.checked)} data-testid="toggle" />
  ),
}));

vi.mock('@/components/atoms/Select', () => ({
  Select: ({ children, ...props }: any) => <select {...props}>{children}</select>,
}));

vi.mock('@/components/atoms/PasswordInput', () => ({
  PasswordInput: (props: any) => <input type="password" {...props} />,
}));

vi.mock('@/components/atoms/Button', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

vi.mock('@/components/atoms/Spinner', () => ({
  Spinner: () => <span data-testid="spinner">Loading...</span>,
}));

vi.mock('@/components/molecules/FormField', () => ({
  FormField: ({ label, children }: any) => <div><label>{label}</label>{children}</div>,
}));

vi.mock('@/components/molecules/ColorPicker', () => ({
  ColorPicker: () => <div data-testid="color-picker" />,
}));

vi.mock('@/components/molecules/BackgroundPicker', () => ({
  BackgroundPicker: () => <div data-testid="background-picker" />,
}));

vi.mock('@/components/molecules/SessionRow', () => ({
  SessionRow: () => <div data-testid="session-row" />,
}));

vi.mock('@shared/theme/accentColors', () => ({
  HEADER_COLORS: [
    { value: '#2d2c2a', label: 'Dark' },
    { value: '#1e3a5f', label: 'Navy' },
  ],
}));

vi.mock('@/utils/seedTestData', () => ({
  seedTestData: vi.fn(),
}));

vi.mock('@/utils/stripHtml', () => ({
  builtinEntryName: (cf: Record<string, unknown> | undefined | null) => { if (!cf) return ''; for (const k of ['eventName','meetingName','goalObjective','milestoneObjective','taskDescription','mealDescription']) { const v = cf[k]; if (typeof v === 'string' && v.trim()) return v.trim(); } return ''; },
  stripHtml: vi.fn((html: string) => html.replace(/<[^>]*>/g, '')),
}));

describe('SettingsView', () => {
  it('renders without crashing', () => {
    renderWithTheme(<SettingsView />);
    expect(screen.getByTestId('settings-template')).toBeInTheDocument();
  });

  it('displays the Settings title', () => {
    renderWithTheme(<SettingsView />);
    expect(screen.getByTestId('settings-title')).toHaveTextContent('Settings');
  });

  it('displays user email', () => {
    renderWithTheme(<SettingsView />);
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
  });

  it('renders account section', () => {
    renderWithTheme(<SettingsView />);
    expect(screen.getByText('Account')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
  });

  it('renders preferences section with timezone', () => {
    renderWithTheme(<SettingsView />);
    expect(screen.getByText('Preferences')).toBeInTheDocument();
    expect(screen.getByText('Timezone')).toBeInTheDocument();
  });

  it('renders theme section', () => {
    renderWithTheme(<SettingsView />);
    expect(screen.getByText('Theme')).toBeInTheDocument();
    expect(screen.getByText('Light')).toBeInTheDocument();
    expect(screen.getByText('Dark')).toBeInTheDocument();
  });

  it('renders security section', () => {
    renderWithTheme(<SettingsView />);
    expect(screen.getByText('Security')).toBeInTheDocument();
    expect(screen.getByText('Password')).toBeInTheDocument();
    expect(screen.getByText('Active Sessions')).toBeInTheDocument();
  });

  it('renders features section with toggles', () => {
    renderWithTheme(<SettingsView />);
    expect(screen.getByText('Features')).toBeInTheDocument();
    expect(screen.getByText('Meals')).toBeInTheDocument();
    expect(screen.getByText('Medication')).toBeInTheDocument();
  });

  it('renders privacy card', () => {
    renderWithTheme(<SettingsView />);
    expect(screen.getByTestId('privacy-card')).toBeInTheDocument();
  });

  it('renders danger zone with sign out', () => {
    renderWithTheme(<SettingsView />);
    expect(screen.getByTestId('danger-card')).toBeInTheDocument();
    expect(screen.getByTestId('sign-out-btn')).toBeInTheDocument();
  });

  it('renders the theme mode and accent presets', () => {
    renderWithTheme(<SettingsView />);
    expect(screen.getByText('Accent Color')).toBeInTheDocument();
    for (const name of ['Teal', 'Ink', 'Rose', 'Amber', 'Sage']) {
      expect(screen.getByTitle(name)).toBeInTheDocument();
    }
  });

  it('renders data section with export and seed options', () => {
    renderWithTheme(<SettingsView />);
    expect(screen.getByText('Data')).toBeInTheDocument();
    expect(screen.getByText('Default Topics')).toBeInTheDocument();
    expect(screen.getByText('Export Entries')).toBeInTheDocument();
  });

  it('gates behind the unlock dialog when the journal is locked', async () => {
    const { useInitializeData } = await import('@/hooks/useInitializeData');
    vi.mocked(useInitializeData).mockReturnValueOnce({
      isReady: false,
      isLoading: false,
      needsUnlock: true,
      handleUnlock: vi.fn(),
    });
    renderWithTheme(<SettingsView />);
    expect(screen.getByText('Unlock Your Journal')).toBeInTheDocument();
    expect(screen.getByText('Unlock your journal to view settings')).toBeInTheDocument();
    // No settings content while locked
    expect(screen.queryByText('Danger Zone')).not.toBeInTheDocument();
  });
});
