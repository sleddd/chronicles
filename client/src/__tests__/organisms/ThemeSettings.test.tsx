import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '@shared/theme/tokens';
import { ThemeSettings } from '@/components/organisms/ThemeSettings';

const mockSetThemeMode = vi.fn();
const mockSetAccentColor = vi.fn();
const mockSetBackgroundImage = vi.fn();
const mockSetBackgroundOpacity = vi.fn();

vi.mock('@/stores/uiStore', () => ({
  useUIStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      themeMode: 'light',
      setThemeMode: mockSetThemeMode,
      accentColor: '#2d2c2a',
      setAccentColor: mockSetAccentColor,
      backgroundImage: '',
      setBackgroundImage: mockSetBackgroundImage,
      backgroundOpacity: 0.6,
      setBackgroundOpacity: mockSetBackgroundOpacity,
    }),
}));

const mockUpsert = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/services/api', () => ({
  settings: { upsert: mockUpsert },
}));

vi.mock('@/components/molecules/ColorPicker', () => ({
  ColorPicker: ({ onChange }: { onChange: (c: string) => void }) => (
    <div data-testid="color-picker">
      <button onClick={() => onChange('#ff0000')}>Pick color</button>
    </div>
  ),
}));

vi.mock('@/components/molecules/BackgroundPicker', () => ({
  BackgroundPicker: ({ onImageChange }: { onImageChange: (img: string) => void }) => (
    <div data-testid="background-picker">
      <button onClick={() => onImageChange('/bg.jpg')}>Pick bg</button>
    </div>
  ),
}));

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>);
}

describe('ThemeSettings', () => {
  it('renders the Appearance and Accent color sections', () => {
    renderWithTheme(<ThemeSettings />);
    expect(screen.getByText('Appearance')).toBeInTheDocument();
    expect(screen.getByText('Accent color')).toBeInTheDocument();
  });

  it('offers the seven named DS accent presets', () => {
    renderWithTheme(<ThemeSettings />);
    for (const name of ['Ink', 'Sage', 'Clay', 'Amber', 'Teal', 'Rose', 'Slate']) {
      expect(screen.getByLabelText(name)).toBeInTheDocument();
    }
  });

  it('saves a custom accent color', () => {
    renderWithTheme(<ThemeSettings />);
    fireEvent.click(screen.getByText('Pick color'));
    expect(mockSetAccentColor).toHaveBeenCalledWith('#ff0000');
    expect(mockUpsert).toHaveBeenCalledWith('accentColor', '#ff0000');
  });

  it('renders background title', () => {
    renderWithTheme(<ThemeSettings />);
    expect(screen.getByText('Background')).toBeInTheDocument();
  });

  it('renders light and dark mode buttons', () => {
    renderWithTheme(<ThemeSettings />);
    expect(screen.getByText('Light')).toBeInTheDocument();
    expect(screen.getByText('Dark')).toBeInTheDocument();
  });

  it('calls setThemeMode when dark button is clicked', () => {
    renderWithTheme(<ThemeSettings />);
    fireEvent.click(screen.getByText('Dark'));
    expect(mockSetThemeMode).toHaveBeenCalledWith('dark');
  });

  it('renders color picker component', () => {
    renderWithTheme(<ThemeSettings />);
    expect(screen.getByTestId('color-picker')).toBeInTheDocument();
  });

  it('renders background picker component', () => {
    renderWithTheme(<ThemeSettings />);
    expect(screen.getByTestId('background-picker')).toBeInTheDocument();
  });
});
