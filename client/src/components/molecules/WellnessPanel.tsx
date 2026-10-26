import styled from 'styled-components';
import { MaterialIcon } from '../atoms/MaterialIcon.js';
import { JoinedGroup, JoinedBtn } from './fields/formKit.js';

/* The wellness check-in, one look everywhere (Health dashboard card + the
   journal's Wellness fields): Water and Sleep as tiles — a round icon (tap it
   to add one), a large thin Work Sans figure and a progress rule you can drag
   like a slider —
   then Mood as five Material faces (the chosen one in the accent, no disc, its
   name on the right), then Cycle as pill chips. Everything coloured uses the
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

/* Round icon in the metric's colour — a button: each tap adds one */
const Badge = styled.button<{ $color: string }>`
  background: var(--bg-control, transparent);
  flex: none;
  padding: 0;
  cursor: pointer;
  transition: border-color 120ms, transform 120ms;
  &:hover:not(:disabled) { border-color: var(--border-strong); }
  &:active:not(:disabled) { transform: scale(0.94); }
  &:disabled { cursor: default; }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { transition: none; &:active:not(:disabled) { transform: none; } }
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  color: ${({ $color }) => $color};
  /* No fill — a thin light grey circle outline (the icon keeps the accent) */
  border: 1px solid var(--border-card);
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



/* The progress rule doubles as a slider: a range input lies invisibly over
   it (keyboard, touch and screen readers for free) and a dot marks the end */
const Slider = styled.div`
  position: relative;
  height: 24px;
  display: flex;
  align-items: center;
  margin: -10px 0; /* the larger touch area doesn't add space around the rule */
  touch-action: none; /* a sideways drag moves the value, not the page */
`;

const Track = styled.div`
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: var(--progress-track, var(--bg-sunken));
  overflow: hidden;
`;

/* Kept inside the rule at both ends (like a native thumb) */
const Thumb = styled.span<{ $pct: number }>`
  --thumb: 14px;
  position: absolute;
  top: 50%;
  left: calc(${({ $pct }) => $pct}% + (50 - ${({ $pct }) => $pct}) * var(--thumb) / 100);
  width: var(--thumb);
  height: var(--thumb);
  margin: calc(var(--thumb) / -2) 0 0 calc(var(--thumb) / -2);
  border-radius: 50%;
  background: var(--color-accent-fill, var(--color-accent));
  pointer-events: none;
  transition: left 200ms ease, transform 120ms;
  @media (prefers-reduced-motion: reduce) { transition: none; }
`;

const Range = styled.input`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
  &:focus-visible + ${Thumb} { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  &:active + ${Thumb} { transform: scale(1.25); }
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
  gap: 12px 22px; /* the glyphs reach a little past their boxes */
  @media (max-width: 480px) { gap: 12px 8px; justify-content: space-between; }
`;

const FaceBtn = styled.button<{ $active: boolean; $color: string }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* The face's drawn circle matches the Water / Sleep icon circles: the
     glyph's circle is 20/24 of its font size, so the glyph is 1.2× the box */
  width: 56px;
  height: 56px;
  padding: 0;
  border: none;
  border-radius: 50%;
  overflow: visible;
  & > span { font-size: 67px; }
  cursor: pointer;
  color: ${({ $active, $color }) => ($active ? $color : 'var(--text-disabled)')};
  /* The chosen face is just the accent glyph — never a disc behind it */
  background: transparent;
  transition: color 120ms;
  &:hover { color: ${({ $color }) => $color}; }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  @media (max-width: 480px) { width: 50px; height: 50px; & > span { font-size: 60px; } }
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
  border: 1px solid var(--border-pill, var(--border-default));
  /* Outline pill (like PillButton): chosen = a light grey fill in the body colour, no accent */
  background: ${({ $active }) => ($active ? 'var(--bg-tab-active)' : 'var(--bg-control, transparent)')};
  color: ${({ $active }) => ($active ? 'var(--text-primary)' : 'var(--text-tertiary)')};
  transition: border-color 120ms, color 120ms, background 120ms;
  &:hover { border-color: var(--border-strong); }
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
  && ${Slider} { margin-top: 6px; margin-bottom: -10px; }
  && ${Track} { height: 3px; }
  && ${Thumb} { --thumb: 12px; }
  && ${Badge} { width: 38px; height: 38px; & > span { font-size: 22px; } }
  && ${Fig} { font-size: 32px; color: var(--text-secondary); }
  && ${Unit} { font-size: 13px; color: var(--text-muted); }
  && ${MoodName} { font-size: 13px; }
  && ${Faces} { gap: 10px 16px; }
  && ${FaceBtn} { width: 38px; height: 38px; & > span { font-size: 46px; } }
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
  && ${Faces} { gap: 16px; }
`;

/* Home dashboard: the card is narrower there, so slightly smaller faces keep
   all five on one line — 32px, shrinking with the cell if it's narrower still
   (17% of the row each, the rest as gaps) */
const SmallFacesQuad = styled(QuadWrapper)`
  &&& ${Faces} { container-type: inline-size; flex-wrap: nowrap; gap: min(16px, 3.75cqi); }
  &&& ${FaceBtn} {
    width: min(32px, 17cqi);
    height: min(32px, 17cqi);
    & > span { font-size: min(38px, 20.4cqi); }
  }
`;

/* One row (journal / Quick entry Wellness, Health dashboard): Water | Sleep |
   Mood | Cycle across one outlined box, rules between the cells; two by two
   only under 760px, stacked on phones. Water and Sleep get a − button, Cycle
   a joined group */
const RowWrapper = styled(CompactWrapper)`
  display: grid;
  && ${Label} { font-size: 15px; color: var(--text-muted); }
  && ${Meter} > ${Label} { margin-bottom: 14px; }
  && ${Head} { margin-bottom: 14px; }
  && ${Badge} { width: 42px; height: 42px; & > span { font-size: 22px; } }
  && ${Fig} { font-size: 32px; color: var(--text-primary); }
  && ${Unit} { font-size: 14px; }
  && ${Slider} { margin-top: 12px; }
  && ${Faces} { flex-wrap: nowrap; gap: 14px; }
  && ${FaceBtn} { width: 32px; height: 32px; & > span { font-size: 38px; } }
`;

const Row4 = styled.div`
  background: var(--bg-tracker, transparent);
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.3fr) minmax(0, 2fr);
  border: 1px solid var(--border-card);
  border-radius: 10px;
  overflow: hidden;
  --cell-x: 18px; /* Your day's bar lines up with the cells */
  & > * {
    min-width: 0;
    padding: 22px var(--cell-x) 24px;
    box-shadow: -1px 0 0 var(--border-card), 0 -1px 0 var(--border-card); /* rules between cells */
  }
  /* Four across at any usual width; two by two only on a small screen */
  @container (max-width: 760px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @container (max-width: 480px) { grid-template-columns: minmax(0, 1fr); & > * { padding: 20px; } }
`;

/* A full-width last row inside the box (Your day) — its own padding */
const FullRow = styled.div`
  grid-column: 1 / -1;
  && { padding: 0; }
`;

/* "−" beside the figure (row layout): takes one away */
const Minus = styled.button`
  flex: none;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  font-family: var(--font-sans);
  font-size: 22px;
  line-height: 1;
  color: var(--text-muted);
  cursor: pointer;
  &:hover:not(:disabled) { color: var(--text-primary); background: var(--bg-hover); }
  &:disabled { opacity: 0.5; cursor: default; }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

const Quad = styled.div`
  background: var(--bg-tracker, transparent);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border: 1px solid var(--border-card);
  border-radius: 14px;
  overflow: hidden;
  --cell-x: 26px;
  & > * {
    min-width: 0;
    padding: 24px var(--cell-x);
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
  /** One of them, for the button labels ("glass of water") */
  one: string;
  onChange: (v: number) => void;
  /** A − button beside the figure */
  minus?: boolean;
}

function MeterTile({ label, icon, color, value, goal, max, unit, noun, one, onChange, minus }: MeterProps) {
  const pct = Math.min(100, (value / goal) * 100);
  return (
    <Meter>
      <Label>{label}</Label>
      <MeterMain>
        <Badge type="button" $color={color} aria-label={`Add one ${one}`} title={`Add one ${one}`}
          disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
          <MaterialIcon $size={26}>{icon}</MaterialIcon>
        </Badge>
        <Figure>
          <Fig aria-label={`${value} ${noun}`}>{value}</Fig>
          <Unit>{unit}</Unit>
        </Figure>
        {minus && (
          <Minus type="button" aria-label={`Take away one ${one}`} title={`Take away one ${one}`}
            disabled={value <= 0} onClick={() => onChange(Math.max(0, value - 1))}>−</Minus>
        )}
      </MeterMain>
      <Slider>
        <Track><Fill $pct={pct} $color={color} /></Track>
        {/* Spans 0 to the goal; past it, tap the icon */}
        <Range type="range" min={0} max={goal} step={1} value={Math.min(value, goal)}
          aria-label={label} aria-valuetext={`${value} ${noun}`}
          onChange={e => onChange(Number(e.target.value))} />
        <Thumb $pct={pct} aria-hidden="true" />
      </Slider>
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
  /** Slightly smaller mood faces, kept on one line (the home dashboard's narrow card) */
  smallFaces?: boolean;
  /** One row: Water | Sleep | Mood | Cycle in one outlined box (journal, Quick entry, Health dashboard) */
  row?: boolean;
  /** A full-width last row inside the box (row and quad layouts) — Your day */
  footer?: React.ReactNode;
}


export function WellnessPanel({
  water, waterGoal = WATER_GOAL, sleep, mood, flow,
  onWater, onSleep, onMood, onFlow, showCycle = true, cycleNote, compact, quad, smallFaces, row, footer,
}: WellnessPanelProps) {
  // One colour throughout: the accent (no per-metric blues, violets or mood hues)
  const accent = 'var(--color-accent)';
  const water$ = (
    <MeterTile label="Water" icon="water_drop" color={accent} value={water} goal={waterGoal}
      max={WATER_MAX} unit={row ? `/ ${waterGoal}` : `of ${waterGoal} glasses`} noun="glasses of water" one="glass of water" onChange={onWater} minus={row} />
  );
  const sleep$ = (
    <MeterTile label="Sleep" icon="dark_mode" color={accent} value={sleep} goal={SLEEP_GOAL}
      max={SLEEP_MAX} unit={row ? 'h' : 'hours'} noun="hours of sleep" one="hour of sleep" onChange={onSleep} minus={row} />
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
            <MaterialIcon>{m.icon}</MaterialIcon>
          </FaceBtn>
        ))}
      </Faces>
    </Cell>
  );
  const cycle$ = showCycle && (
    <Cell>
      <Head><Label>Cycle</Label>{cycleNote && <CycleNote>{cycleNote}</CycleNote>}</Head>
      {row ? (
        <JoinedGroup role="group" aria-label="Cycle">
          {(['', ...FLOW_OPTIONS] as FlowIntensity[]).map(f => (
            <JoinedBtn key={f || 'none'} type="button" $fill $active={flow === f} aria-pressed={flow === f} onClick={() => onFlow(f)}>
              {f ? f[0].toUpperCase() + f.slice(1) : 'None'}
            </JoinedBtn>
          ))}
        </JoinedGroup>
      ) : (
        <Chips role="group" aria-label="Cycle">
          {(['', ...FLOW_OPTIONS] as FlowIntensity[]).map(f => (
            <Chip key={f || 'none'} type="button" $active={flow === f} aria-pressed={flow === f} onClick={() => onFlow(f)}>
              {f ? f[0].toUpperCase() + f.slice(1) : 'None'}
            </Chip>
          ))}
        </Chips>
      )}
    </Cell>
  );

  if (row) {
    return <RowWrapper><Row4>{water$}{sleep$}{mood$}{cycle$}{footer && <FullRow>{footer}</FullRow>}</Row4></RowWrapper>;
  }

  if (quad) {
    const Wrap = smallFaces ? SmallFacesQuad : QuadWrapper;
    return <Wrap><Quad>{water$}{sleep$}{mood$}{cycle$}{footer && <FullRow>{footer}</FullRow>}</Quad></Wrap>;
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
