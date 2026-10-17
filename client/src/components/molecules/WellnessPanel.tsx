import styled from 'styled-components';
import { MaterialIcon } from '../atoms/MaterialIcon.js';

/* The wellness check-in, one look everywhere (Health dashboard card + the
   journal's Wellness fields): Water and Sleep as tiles — a tinted round icon,
   a large thin Work Sans figure, −/+ round buttons and a coloured progress
   rule — then Mood as five Material faces (the chosen one on a tinted disc,
   its name on the right in the mood's colour), then Cycle as pill chips.
   Hairlines separate the sections. Props only. */

export const WATER_GOAL = 8;
export const SLEEP_GOAL = 8;
const WATER_MAX = 20;
const SLEEP_MAX = 12;

const MOODS = [
  { icon: 'sentiment_very_dissatisfied', label: 'Very low' },
  { icon: 'sentiment_dissatisfied', label: 'Low' },
  { icon: 'sentiment_neutral', label: 'Okay' },
  { icon: 'sentiment_satisfied', label: 'Good' },
  { icon: 'sentiment_very_satisfied', label: 'Great' },
] as const;

export const FLOW_OPTIONS = ['spotting', 'light', 'medium', 'heavy'] as const;
export type FlowIntensity = typeof FLOW_OPTIONS[number] | '';

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  container-type: inline-size; /* pairs stack by the panel's own width (half-width cards) */
`;

const Section = styled.div`
  padding: 40px 0 24px;
  border-top: 1px solid var(--border-field, var(--border-default));
  &:first-child { border-top: none; padding-top: 4px; padding-bottom: 40px; }
  &:last-child { padding-bottom: 4px; }
`;

/* Two metrics side by side (Water | Sleep, Mood | Cycle); stacked on phones */
const PairRow = styled(Section)`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px 96px;
  @container (max-width: 900px) { gap: 24px 48px; }
  @container (max-width: 640px) { grid-template-columns: minmax(0, 1fr); gap: 32px; }
`;

const Cell = styled.div`
  min-width: 0;
`;

const Head = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
`;

const Label = styled.span`
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-disabled);
`;

const Meter = styled.div`
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
`;

const MeterMain = styled.div`
  display: flex;
  align-items: center;
  gap: 18px;
  min-width: 0;
`;

/* Round icon tile tinted with the metric's colour */
const Badge = styled.span<{ $color: string }>`
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  color: ${({ $color }) => $color};
  background: color-mix(in srgb, ${({ $color }) => $color} 16%, transparent);
`;

const Figure = styled.span`
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex: 1;
  min-width: 0;
`;

const Fig = styled.span`
  font-family: var(--font-display);
  font-size: 56px;
  font-weight: 300;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
`;

const Unit = styled.span`
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-disabled);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Steppers = styled.span`
  flex: none;
  display: flex;
  gap: 10px;
`;

const StepBtn = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid var(--border-default);
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: border-color 120ms, color 120ms;
  &:hover:not(:disabled) { border-color: var(--border-strong); color: var(--text-primary); }
  &:disabled { opacity: 0.4; cursor: default; }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

const Track = styled.div`
  height: 4px;
  border-radius: 2px;
  background: var(--bg-sunken);
  overflow: hidden;
`;

const Fill = styled.div<{ $pct: number; $color: string }>`
  height: 100%;
  width: ${({ $pct }) => $pct}%;
  border-radius: 2px;
  background: ${({ $color }) => $color};
  transition: width 200ms ease;
  @media (prefers-reduced-motion: reduce) { transition: none; }
`;

const MoodName = styled.span<{ $color: string }>`
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: 500;
  color: ${({ $color }) => $color};
`;

const Faces = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  @media (max-width: 480px) { gap: 8px 4px; justify-content: space-between; }
`;

const FaceBtn = styled.button<{ $active: boolean; $color: string }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  padding: 0;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  color: ${({ $active, $color }) => ($active ? $color : 'var(--text-disabled)')};
  background: ${({ $active, $color }) => ($active ? `color-mix(in srgb, ${$color} 16%, transparent)` : 'transparent')};
  transition: color 120ms, background 120ms;
  &:hover { color: ${({ $color }) => $color}; }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  @media (max-width: 480px) { width: 54px; height: 54px; }
  /* Thin faces: lightest weight at the large optical size */
  & > span { font-variation-settings: 'FILL' 0, 'wght' 100, 'GRAD' 0, 'opsz' 48; }
`;

const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
`;

const Chip = styled.button<{ $active: boolean }>`
  padding: 9px 22px;
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: 500;
  border-radius: 999px;
  cursor: pointer;
  border: 1px solid ${({ $active }) => ($active ? 'var(--color-accent)' : 'var(--border-default)')};
  /* Chosen = solid accent with --on-accent text (white, or dark on a light accent); never a see-through tint */
  background: ${({ $active }) => ($active ? 'var(--color-accent)' : 'transparent')};
  color: ${({ $active }) => ($active ? 'var(--on-accent, #ffffff)' : 'var(--text-tertiary)')};
  transition: border-color 120ms, color 120ms;
  &:hover { border-color: ${({ $active }) => ($active ? 'var(--color-accent)' : 'var(--border-strong)')}; }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

const Note = styled.p`
  margin: 14px 0 0;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-disabled);
`;

/* Compact (Health dashboard): about half the height — smaller figures,
   buttons and faces, tighter spacing; same layout and divider */
const CompactWrapper = styled(Wrapper)`
  && ${Section} { padding: 22px 0 4px; }
  && ${Section}:first-child { padding-top: 0; padding-bottom: 22px; }
  && ${Head} { margin-bottom: 8px; }
  && ${Meter} { gap: 10px; }
  && ${MeterMain} { gap: 12px; }
  && ${Badge} { width: 38px; height: 38px; & > span { font-size: 20px; } }
  && ${Fig} { font-size: 38px; }
  && ${Unit}, && ${Label}, && ${MoodName} { font-size: 14px; }
  && ${Steppers} { gap: 6px; }
  && ${StepBtn} { width: 32px; height: 32px; & > span { font-size: 18px; } }
  && ${Faces} { gap: 4px 6px; }
  && ${FaceBtn} { width: 44px; height: 44px; & > span { font-size: 30px; } }
  && ${Chip} { padding: 6px 16px; font-size: 14px; }
  && ${Note} { margin-top: 8px; font-size: 13px; }
`;

interface MeterProps {
  label: string;
  icon: string;
  color: string;
  value: number;
  goal: number;
  max: number;
  unit: string;
  noun: string;
  onChange: (v: number) => void;
}

function MeterTile({ label, icon, color, value, goal, max, unit, noun, onChange }: MeterProps) {
  const pct = Math.min(100, (value / goal) * 100);
  return (
    <Meter>
      <Label>{label}</Label>
      <MeterMain>
        <Badge $color={color} aria-hidden="true"><MaterialIcon $size={26}>{icon}</MaterialIcon></Badge>
        <Figure>
          <Fig aria-label={`${value} ${noun}`}>{value}</Fig>
          <Unit>{unit}</Unit>
        </Figure>
        <Steppers>
          <StepBtn type="button" aria-label={`One less ${noun.replace(/s$/, '')}`} disabled={value <= 0} onClick={() => onChange(Math.max(0, value - 1))}>
            <MaterialIcon $size={22}>remove</MaterialIcon>
          </StepBtn>
          <StepBtn type="button" aria-label={`One more ${noun.replace(/s$/, '')}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
            <MaterialIcon $size={22}>add</MaterialIcon>
          </StepBtn>
        </Steppers>
      </MeterMain>
      <Track><Fill $pct={pct} $color={color} /></Track>
    </Meter>
  );
}

interface WellnessPanelProps {
  water: number;
  waterGoal?: number;
  sleep: number;
  mood: number;
  flow: FlowIntensity;
  onWater: (v: number) => void;
  onSleep: (v: number) => void;
  /** Tapping the chosen face again clears it (0) */
  onMood: (v: number) => void;
  onFlow: (v: FlowIntensity) => void;
  /** Show the Cycle chips */
  showCycle?: boolean;
  /** Line under the cycle chips, e.g. the next expected period */
  cycleNote?: React.ReactNode;
  /** About half the height (Health dashboard card) */
  compact?: boolean;
}

function PanelRoot({ $compact, children }: { $compact?: boolean; children: React.ReactNode }) {
  return $compact ? <CompactWrapper>{children}</CompactWrapper> : <Wrapper>{children}</Wrapper>;
}

export function WellnessPanel({
  water, waterGoal = WATER_GOAL, sleep, mood, flow,
  onWater, onSleep, onMood, onFlow, showCycle = true, cycleNote, compact,
}: WellnessPanelProps) {
  const moodColor = mood ? `var(--mood-${mood})` : 'var(--text-disabled)';
  return (
    <PanelRoot $compact={compact}>
      <PairRow>
        <MeterTile label="Water" icon="water_drop" color="var(--chart-blue)" value={water} goal={waterGoal}
          max={WATER_MAX} unit={`of ${waterGoal} glasses`} noun="glasses of water" onChange={onWater} />
        <MeterTile label="Sleep" icon="dark_mode" color="var(--chart-violet)" value={sleep} goal={SLEEP_GOAL}
          max={SLEEP_MAX} unit="hours" noun="hours of sleep" onChange={onSleep} />
      </PairRow>

      {/* Mood | Cycle side by side, like Water | Sleep */}
      <PairRow>
        <Cell>
          <Head>
            <Label>Mood</Label>
            {mood > 0 && <MoodName $color={moodColor}>{MOODS[mood - 1].label}</MoodName>}
          </Head>
          <Faces role="group" aria-label="Mood">
            {MOODS.map((m, i) => (
              <FaceBtn key={m.icon} type="button" $active={mood === i + 1} $color={`var(--mood-${i + 1})`}
                aria-label={`Mood: ${m.label}`} aria-pressed={mood === i + 1}
                onClick={() => onMood(mood === i + 1 ? 0 : i + 1)}>
                <MaterialIcon $size={40}>{m.icon}</MaterialIcon>
              </FaceBtn>
            ))}
          </Faces>
        </Cell>

        {showCycle && (
          <Cell>
            <Head><Label>Cycle</Label></Head>
            <Chips role="group" aria-label="Cycle">
              {(['', ...FLOW_OPTIONS] as FlowIntensity[]).map(f => (
                <Chip key={f || 'none'} type="button" $active={flow === f} aria-pressed={flow === f} onClick={() => onFlow(f)}>
                  {f ? f[0].toUpperCase() + f.slice(1) : 'None'}
                </Chip>
              ))}
            </Chips>
            {cycleNote && <Note>{cycleNote}</Note>}
          </Cell>
        )}
      </PairRow>
    </PanelRoot>
  );
}
