import styled from 'styled-components';
import { Icon } from '../../atoms/core/Icon.jsx';
import type { WellnessFieldValues } from '../../../types/fields.js';
export type { WellnessFieldValues } from '../../../types/fields.js';

const WATER_GOAL = 8;
const SLEEP_GOAL = 10;
const MOOD_ICONS: Array<'mood-1' | 'mood-2' | 'mood-3' | 'mood-4' | 'mood-5'> = ['mood-1', 'mood-2', 'mood-3', 'mood-4', 'mood-5'];
const MOOD_LABELS = ['Very sad', 'Sad', 'Neutral', 'Good', 'Great'] as const;
const FLOW_OPTIONS = ['spotting', 'light', 'medium', 'heavy'] as const;
const FLOW_INDEX: Record<string, number> = { '': 0, spotting: 1, light: 2, medium: 3, heavy: 4 };

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
`;

const WSection = styled.div`
  padding: 14px 0;
  & + & { border-top: 1px solid ${({ theme }) => theme.colors.border}; }
`;

const WSectionLabel = styled.div`
  font-family: ${({ theme }) => theme.fontFamily.ui};
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: ${({ theme }) => theme.colors.textMuted};
  margin-bottom: 10px;
`;

const GlassRow = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
  flex-wrap: wrap;
`;

const GlassBtn = styled.button<{ $filled: boolean }>`
  background: none;
  border: none;
  padding: 4px 3px;
  cursor: pointer;
  font-size: 20px;
  line-height: 1;
  /* Selected = accent (same as the dashboard check-in); unselected = light grey */
  color: ${({ $filled }) => ($filled ? 'var(--color-accent)' : 'var(--border-strong)')};
  transition: color 0.1s, transform 0.1s;
  &:hover { color: var(--color-accent); transform: scale(1.15); }
  &:active { transform: scale(0.88); }
`;

const GlassCount = styled.span`
  font-family: ${({ theme }) => theme.fontFamily.ui};
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textMuted};
  margin-left: 6px;
`;

const MoodRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const MoodBtn = styled.button<{ $active: boolean }>`
  background: none;
  border: none;
  padding: 4px;
  cursor: pointer;
  font-size: 25px;
  line-height: 1;
  color: ${({ $active }) => ($active ? 'var(--color-accent)' : 'var(--border-strong)')};
  transition: color 0.1s, transform 0.1s;
  &:hover { color: var(--color-accent); transform: scale(1.15); }
  &:active { transform: scale(0.88); }
`;

const DateLabel = styled.div`
  font-family: ${({ theme }) => theme.fontFamily.ui};
  font-size: 15px;
  color: ${({ theme }) => theme.colors.textMuted};
  padding: 4px 0;
`;

interface WellnessFieldsProps {
  values: WellnessFieldValues;
  onChange: (values: WellnessFieldValues) => void;
  cycleTrackingEnabled?: boolean;
  onAutoSave?: () => void;
}

export function WellnessFields({ values, onChange, cycleTrackingEnabled, onAutoSave }: WellnessFieldsProps) {
  const water = values.waterGlasses || 0;
  const goal = values.waterGoal || WATER_GOAL;
  const mood = values.moodScore || 0;
  const sleep = values.sleepHours || 0;
  const flow = values.flowIntensity || '';

  const change = (v: WellnessFieldValues) => {
    onChange(v);
    onAutoSave?.();
  };

  const handleGlass = (i: number) => change({ ...values, waterGlasses: i < water ? i : i + 1 });
  const handleMood = (score: number) => change({ ...values, moodScore: mood === score ? 0 : score });
  const handleSleep = (i: number) => change({ ...values, sleepHours: i < sleep ? i : i + 1 });
  const handleFlow = (f: string) => {
    const newFlow = flow === f ? '' : f;
    change({ ...values, flowIntensity: newFlow, periodToday: newFlow !== '' });
  };

  return (
    <Wrapper>
      {values.date && (
        <WSection>
          <WSectionLabel>Check-in Date</WSectionLabel>
          <DateLabel>{values.date}</DateLabel>
        </WSection>
      )}

      <WSection>
        <WSectionLabel>Water</WSectionLabel>
        <GlassRow>
          {Array.from({ length: goal }, (_, i) => (
            <GlassBtn key={i} $filled={i < water} onClick={() => handleGlass(i)} title={`${i + 1} glass${i !== 0 ? 'es' : ''}`} type="button">
              <Icon name="droplet" size={20} strokeWidth={2} />
            </GlassBtn>
          ))}
          <GlassCount>{water}/{goal}</GlassCount>
        </GlassRow>
      </WSection>

      <WSection>
        <WSectionLabel>Mood</WSectionLabel>
        <MoodRow>
          {MOOD_ICONS.map((iconName, i) => (
            <MoodBtn key={i} $active={mood === i + 1} onClick={() => handleMood(i + 1)} title={MOOD_LABELS[i]} type="button">
              <Icon name={iconName} size={25} strokeWidth={2} />
            </MoodBtn>
          ))}
        </MoodRow>
      </WSection>

      <WSection>
        <WSectionLabel>Sleep</WSectionLabel>
        <GlassRow>
          {Array.from({ length: SLEEP_GOAL }, (_, i) => (
            <GlassBtn key={i} $filled={i < sleep} onClick={() => handleSleep(i)} title={`${i + 1}h`} type="button">
              <Icon name="cloud" size={20} strokeWidth={2} />
            </GlassBtn>
          ))}
          <GlassCount>{sleep > 0 ? `${sleep}h` : '—'}</GlassCount>
        </GlassRow>
      </WSection>

      {cycleTrackingEnabled && (
        <WSection>
          <WSectionLabel>Cycle</WSectionLabel>
          <GlassRow>
            {Array.from({ length: 4 }, (_, i) => (
              <GlassBtn key={i} $filled={i < FLOW_INDEX[flow]} onClick={() => handleFlow(FLOW_OPTIONS[i])} title={FLOW_OPTIONS[i]} type="button">
                <Icon name="droplet" size={20} strokeWidth={2} />
              </GlassBtn>
            ))}
            <GlassCount>{flow || '—'}</GlassCount>
          </GlassRow>
        </WSection>
      )}
    </Wrapper>
  );
}
