import styled from 'styled-components';
import { ColorPicker } from '../molecules/ColorPicker.js';
import { BackgroundPicker } from '../molecules/BackgroundPicker.js';
import { useUIStore } from '../../stores/uiStore.js';
import { settings as settingsApi } from '../../services/api.js';
import { HEADER_COLORS } from '@shared/theme/accentColors';

const Section = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.xl}px;
`;

const SectionTitle = styled.h3`
  font-family: ${({ theme }) => theme.typography.h3.fontFamily};
  font-size: ${({ theme }) => theme.typography.h3.fontSize};
  font-weight: ${({ theme }) => theme.typography.h3.fontWeight};
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const ThemeModeToggle = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm}px;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const ModeButton = styled.button<{ $active: boolean; $mode?: string }>`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.sm}px ${({ theme }) => theme.spacing.md}px;
  font-family: var(--font-sans);
  font-size: ${({ theme }) => theme.fontSize.sm}px;
  font-weight: ${({ $active, theme }) => $active ? theme.fontWeight.semibold : theme.fontWeight.normal};
  color: ${({ $active }) => $active ? 'var(--on-accent)' : 'var(--text-secondary)'};
  background: ${({ $active }) => $active ? 'var(--color-accent)' : 'transparent'};
  border: 1px solid ${({ $active }) => $active ? 'var(--color-accent)' : 'var(--border-default)'};
  border-radius: var(--r-md, 1px);
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    border-color: ${({ $active }) => $active ? 'var(--color-accent)' : 'var(--border-strong)'};
  }
`;

/* DS named accent presets (base/500 of the original design-system accent ramps). */
const ACCENT_PRESETS: { value: string; label: string }[] = [
  { value: '#5b53d6', label: 'Ink' },
  { value: '#4c8a5f', label: 'Sage' },
  { value: '#bf6038', label: 'Clay' },
  { value: '#c2871a', label: 'Amber' },
  { value: '#1e8a87', label: 'Teal' },
  { value: '#c34a77', label: 'Rose' },
  { value: '#8b5cf6', label: 'Purple' },
  { value: '#5b636e', label: 'Slate' },
];

const PresetRow = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const PresetChip = styled.button<{ $active: boolean; $color: string }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;

  & > span.swatch {
    width: 34px;
    height: 34px;
    border-radius: var(--r-full, 999px);
    background: ${({ $color }) => $color};
    box-shadow: ${({ $active }) => $active ? '0 0 0 2px var(--bg-surface), 0 0 0 4px var(--color-accent)' : 'none'};
    transition: box-shadow 120ms ease;
  }
  & > span.label {
    font-family: var(--font-label);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: ${({ $active }) => $active ? 'var(--text-primary)' : 'var(--text-tertiary)'};
  }
`;

const SubLabel = styled.p`
  font-family: var(--font-label);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  margin: 0 0 10px;
`;

export function ThemeSettings() {
  const themeMode = useUIStore(s => s.themeMode);
  const setThemeMode = useUIStore(s => s.setThemeMode);
  const accentColor = useUIStore(s => s.accentColor);
  const setAccentColor = useUIStore(s => s.setAccentColor);
  const backgroundImage = useUIStore(s => s.backgroundImage);
  const setBackgroundImage = useUIStore(s => s.setBackgroundImage);
  const backgroundOpacity = useUIStore(s => s.backgroundOpacity);
  const setBackgroundOpacity = useUIStore(s => s.setBackgroundOpacity);

  const handleThemeModeChange = async (mode: 'light' | 'dark') => {
    setThemeMode(mode);
    await settingsApi.upsert('themeMode', mode).catch(() => {});
  };

  const handleColorChange = async (color: string) => {
    setAccentColor(color);
    await settingsApi.upsert('accentColor', color).catch(() => {});
  };

  const handleImageChange = async (image: string) => {
    setBackgroundImage(image);
    await settingsApi.upsert('backgroundImage', image).catch(() => {});
  };

  const handleOpacityChange = async (opacity: number) => {
    setBackgroundOpacity(opacity);
    await settingsApi.upsert('backgroundOpacity', String(opacity)).catch(() => {});
  };

  const presetActive = ACCENT_PRESETS.some(p => p.value.toLowerCase() === accentColor.toLowerCase());

  return (
    <>
      <Section>
        <SectionTitle>Appearance</SectionTitle>
        <ThemeModeToggle>
          <ModeButton $active={themeMode === 'light'} $mode="light" onClick={() => handleThemeModeChange('light')}>
            Light
          </ModeButton>
          <ModeButton $active={themeMode === 'dark'} $mode="dark" onClick={() => handleThemeModeChange('dark')}>
            Dark
          </ModeButton>
        </ThemeModeToggle>
      </Section>

      <Section>
        <SectionTitle>Accent color</SectionTitle>
        <SubLabel>Presets</SubLabel>
        <PresetRow>
          {ACCENT_PRESETS.map(p => (
            <PresetChip
              key={p.value}
              $active={accentColor.toLowerCase() === p.value.toLowerCase()}
              $color={p.value}
              onClick={() => handleColorChange(p.value)}
              title={p.label}
              aria-label={p.label}
            >
              <span className="swatch" />
              <span className="label">{p.label}</span>
            </PresetChip>
          ))}
        </PresetRow>
        <SubLabel>{presetActive ? 'Custom' : 'Custom (selected)'}</SubLabel>
        <ColorPicker
          colors={HEADER_COLORS}
          selected={accentColor}
          onChange={handleColorChange}
        />
      </Section>

      <Section>
        <SectionTitle>Background</SectionTitle>
        <BackgroundPicker
          selected={backgroundImage}
          onImageChange={handleImageChange}
        />
      </Section>
    </>
  );
}
