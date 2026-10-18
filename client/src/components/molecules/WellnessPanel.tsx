import styled from 'styled-components';
import { MaterialIcon } from '../atoms/MaterialIcon.js';

/* The wellness check-in, one look everywhere (Health dashboard card + the
   journal's Wellness fields): Water and Sleep as tiles — a tinted round icon,
   a large thin Work Sans figure, −/+ round buttons and a progress rule —
   then Mood as five Material faces (the chosen one on a tinted disc, its name
   on the right), then Cycle as pill chips. Everything coloured uses the
   accent. Hairlines separate the sections. Props only. */

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

/* "Next period est. Fri, Nov 6" — across from the Cycle label */
const CycleNote = styled.span`
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--text-muted);
  text-align: right;
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
  background: var(--bg-control, transparent);
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  color: ${({ $color }) => $color};
  /* No fill — a thin circle outline */
  border: 1px solid var(--border-pill, var(--border-card));
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
  border: 1px solid var(--border-pill, var(--border-default));
  background: var(--bg-control, transparent);
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
  background: var(--progress-track, var(--bg-sunken));
  overflow: hidden;
`;

const Fill = styled.div<{ $pct: number; $color: string }>`
  height: 100%;
  width: ${({ $pct }) => $pct}%;
  border-radius: 2px;
  background: var(--color-accent-fill, ${({ $color }) => $color});
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
  /* The chosen face is the accent glyph — in light on a pale accent disc
     (--bg-selected, unset in dark: no disc there) */
  background: ${({ $active }) => ($active ? 'var(--bg-selected, transparent)' : 'transparent')};
  transition: color 120ms;
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
  border: 1px solid ${({ $active }) => ($active ? 'var(--color-accent-line)' : 'var(--border-pill, var(--border-default))')};
  /* Outline pill (like PillButton): chosen = accent outline + accent text
     (on the pale --bg-selected in light; no fill in dark) */
  background: ${({ $active }) => ($active ? 'var(--bg-selected, transparent)' : 'var(--bg-control, transparent)')};
  color: ${({ $active }) => ($active ? 'var(--color-accent-line)' : 'var(--text-tertiary)')};
  transition: border-color 120ms, color 120ms, background 120ms;
  &:hover { border-color: ${({ $active }) => ($active ? 'var(--color-accent-line)' : 'var(--border-strong)')}; }
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
/* Compact (Health dashboard, journal): Water | Sleep | Mood across, Cycle
   under Water; smaller figures, buttons and faces; no rules */
const CompactWrapper = styled(Wrapper)`
  && ${Head} { margin-bottom: 12px; }
  && ${Label} { font-size: 13px; color: var(--text-soft); }
  && ${Meter} { gap: 0; }
  && ${Meter} > ${Label} { margin-bottom: 12px; }
  && ${MeterMain} { gap: 12px; }
  && ${Track} { margin-top: 16px; height: 3px; }
  && ${Badge} { width: 38px; height: 38px; & > span { font-size: 22px; } }
  && ${Fig} { font-size: 32px; color: var(--text-secondary); }
  && ${Unit} { font-size: 13px; color: var(--text-muted); }
  && ${MoodName} { font-size: 13px; }
  && ${Steppers} { gap: 10px; }
  && ${StepBtn} { width: 30px; height: 30px; border-color: var(--border-card); color: var(--text-soft); & > span { font-size: 16px; } }
  && ${Faces} { gap: 6px 12px; }
  && ${FaceBtn} { width: 46px; height: 46px; & > span { font-size: 40px; } }
  && ${Chips} { gap: 10px 6px; /* room between wrapped rows */ }
  && ${Chip} { height: 29px; padding: 0 13px; font-size: 13px; font-weight: 400; }
  && ${Note} { margin-top: 6px; font-size: 12px; }
`;

const Grid3 = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 30px 40px;
  @container (max-width: 900px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @container (max-width: 560px) { grid-template-columns: minmax(0, 1fr); gap: 24px; }
`;

/* Four square (home dashboard): Water | Sleep over Mood | Cycle in one
   outlined card, rules between the cells; compact sizes, smaller faces so
   five fit a quarter-width cell; no tinted fills */
const QuadWrapper = styled(CompactWrapper)`
  display: grid;
  && ${Faces} { gap: 6px; }
  && ${FaceBtn} { width: 38px; height: 38px; & > span { font-size: 32px; } }
`;

const Quad = styled.div`
  background: var(--bg-tracker, transparent);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border: 1px solid var(--border-card);
  border-radius: 14px;
  overflow: hidden;
  & > * {
    min-width: 0;
    padding: 24px 26px;
    box-shadow: -1px 0 0 var(--border-card), 0 -1px 0 var(--border-card); /* rules between cells */
  }
  @container (max-width: 480px) { grid-template-columns: minmax(0, 1fr); & > * { padding: 20px; } }
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
  /** Four square: Water | Sleep over Mood | Cycle in an outlined 2×2 card (home dashboard) */
  quad?: boolean;
}


export function WellnessPanel({
  water, waterGoal = WATER_GOAL, sleep, mood, flow,
  onWater, onSleep, onMood, onFlow, showCycle = true, cycleNote, compact, quad,
}: WellnessPanelProps) {
  // One colour throughout: the accent (no per-metric blues, violets or mood hues)
  const accent = 'var(--color-accent)';
  const water$ = (
    <MeterTile label="Water" icon="water_drop" color={accent} value={water} goal={waterGoal}
      max={WATER_MAX} unit={`of ${waterGoal} glasses`} noun="glasses of water" onChange={onWater} />
  );
  const sleep$ = (
    <MeterTile label="Sleep" icon="dark_mode" color={accent} value={sleep} goal={SLEEP_GOAL}
      max={SLEEP_MAX} unit="hours" noun="hours of sleep" onChange={onSleep} />
  );
  const mood$ = (
    <Cell>
      <Head>
        <Label>Mood</Label>
        {mood > 0 && <MoodName $color={accent}>{MOODS[mood - 1].label}</MoodName>}
      </Head>
      <Faces role="group" aria-label="Mood">
        {MOODS.map((m, i) => (
          <FaceBtn key={m.icon} type="button" $active={mood === i + 1} $color={accent}
            aria-label={`Mood: ${m.label}`} aria-pressed={mood === i + 1}
            onClick={() => onMood(mood === i + 1 ? 0 : i + 1)}>
            <MaterialIcon $size={40}>{m.icon}</MaterialIcon>
          </FaceBtn>
        ))}
      </Faces>
    </Cell>
  );
  const cycle$ = showCycle && (
    <Cell>
      <Head><Label>Cycle</Label>{cycleNote && <CycleNote>{cycleNote}</CycleNote>}</Head>
      <Chips role="group" aria-label="Cycle">
        {(['', ...FLOW_OPTIONS] as FlowIntensity[]).map(f => (
          <Chip key={f || 'none'} type="button" $active={flow === f} aria-pressed={flow === f} onClick={() => onFlow(f)}>
            {f ? f[0].toUpperCase() + f.slice(1) : 'None'}
          </Chip>
        ))}
      </Chips>
    </Cell>
  );

  if (quad) {
    return <QuadWrapper><Quad>{water$}{sleep$}{mood$}{cycle$}</Quad></QuadWrapper>;
  }

  if (compact) {
    return <CompactWrapper><Grid3>{water$}{sleep$}{mood$}{cycle$}</Grid3></CompactWrapper>;
  }

  return (
    <Wrapper>
      <PairRow>{water$}{sleep$}</PairRow>
      {/* Mood | Cycle side by side, like Water | Sleep */}
      <PairRow>{mood$}{cycle$}</PairRow>
    </Wrapper>
  );
}
