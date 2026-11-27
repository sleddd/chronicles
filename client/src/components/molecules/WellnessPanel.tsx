import styled from 'styled-components';
import { MaterialIcon } from '../atoms/MaterialIcon.js';
import { MoodFace, type MoodFaceName } from '../atoms/MoodFace.js';
import { Icon } from '../atoms/core/Icon.jsx';
import { glassCard } from '../../styles/wallpaper.js';

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

/* Shown worst to happiest. `value` is what the picker reports: 1–5 the scale,
   6–8 the moods beside it, saved as words (utils/moodFields) — the order shown
   never changes what's saved */
const MOODS: { value: number; icon: MoodFaceName; label: string }[] = [
  { value: 8, icon: 'sick', label: 'Sick' },
  { value: 1, icon: 'sentiment_sad', label: 'Very low' },
  { value: 7, icon: 'sentiment_stressed', label: 'Stressed' },
  { value: 2, icon: 'sentiment_dissatisfied', label: 'Low' },
  { value: 3, icon: 'sentiment_neutral', label: 'Okay' },
  { value: 6, icon: 'sentiment_calm', label: 'Calm' },
  { value: 4, icon: 'sentiment_satisfied', label: 'Good' },
  { value: 5, icon: 'sentiment_excited', label: 'Great' },
];

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
  &:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
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
  &:focus-visible + ${Thumb} { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
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

/* Water as glasses and nothing else (no figure, no + / −): one small outlined
   glass per glass of the goal, the ones drunk filled solid in the accent, the
   rest grey outlines. A tap fills up to that glass; tapping the last full one again empties it */
/* Full size always: short of room, the icons go on to a second line rather than shrink */
const GlassRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 6px;
  min-width: 0;
`;

const GlassBtn = styled.button<{ $full: boolean }>`
  flex: none;
  width: 22px;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  line-height: 0;
  color: ${({ $full }) => ($full ? 'var(--color-accent-fill, var(--color-accent))' : 'var(--border-strong)')};
  transition: color 150ms, transform 120ms;
  svg { display: block; width: 100%; height: auto; }
  &:hover:not(:disabled) { color: ${({ $full }) => ($full ? 'var(--color-accent-fill, var(--color-accent))' : 'var(--text-muted)')}; }
  &:active:not(:disabled) { transform: scale(0.92); }
  &:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; border-radius: 3px; }
  @media (prefers-reduced-motion: reduce) { transition: none; &:active:not(:disabled) { transform: none; } }
`;

/** A tumbler, 22 × 28: an outline, filled solid about three-quarters up once it's drunk */
function Glass({ full }: { full: boolean }) {
  return (
    <svg viewBox="0 0 22 28" fill="none" aria-hidden="true">
      {/* The water: the glass's own sides from the bottom up to three-quarters of its height */}
      {full && <path d="M2.95 8.25 H19.05 L17.9 24.4 A2.6 2.6 0 0 1 15.3 27 H6.7 A2.6 2.6 0 0 1 4.1 24.4 Z" fill="currentColor" />}
      <path d="M2.5 2 H19.5 L17.9 24.4 A2.6 2.6 0 0 1 15.3 27 H6.7 A2.6 2.6 0 0 1 4.1 24.4 Z"
        stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

/* Sleep the same way: one Partly Cloudy Night icon per hour of the goal, the
   hours slept filled solid in the accent (the icon font's FILL axis), the rest
   grey outlines */
const NightIcon = styled(MaterialIcon)<{ $full: boolean }>`
  font-size: 24px;
  ${({ $full }) => ($full ? "font-variation-settings: 'FILL' 1, 'wght' 300, 'GRAD' 0, 'opsz' 24;" : '')}
`;

const NightBtn = styled(GlassBtn)`
  width: auto;
`;

/** What a row of tap icons counts: water in glasses, sleep in hours */
export type TapKind = 'glass' | 'hour';
const TAP_WORDS: Record<TapKind, [string, string]> = { glass: ['glass', 'glasses'], hour: ['hour', 'hours'] };

/** One icon per unit of the goal: a tap fills up to it, tapping the last full one empties it */
function TapIcons({ kind, label, value, goal, onChange }: { kind: TapKind; label: string; value: number; goal: number; onChange: (v: number) => void }) {
  const [one, many] = TAP_WORDS[kind];
  const Btn = kind === 'glass' ? GlassBtn : NightBtn;
  return (
    <GlassRow role="group" aria-label={label} aria-description={`${value} of ${goal} ${many}`}>
      {Array.from({ length: goal }, (_, i) => {
        const n = i + 1;
        const full = value >= n;
        const Name = one[0].toUpperCase() + one.slice(1);
        return (
          <Btn key={n} type="button" $full={full} aria-pressed={full}
            aria-label={`${Name} ${n} of ${goal}`} title={value === n ? `Take away ${one} ${n}` : `${n} ${n === 1 ? one : many}`}
            onClick={() => onChange(value === n ? n - 1 : n)}>
            {kind === 'glass' ? <Glass full={full} /> : <NightIcon $full={full} aria-hidden="true">partly_cloudy_night</NightIcon>}
          </Btn>
        );
      })}
    </GlassRow>
  );
}

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
  &:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
  @media (max-width: 480px) { width: 50px; height: 50px; & > span { font-size: 60px; } }
  /* The faces are drawn outlines (atoms/MoodFace), never font glyphs: the variable icon
     font came out thick on iPhone / iPad whatever weight was asked for */
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
  &:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
`;

/* Cycle as icons (the home dashboard's strip), all one size, no words (the name is
   the tooltip): a crossed-out drop for None, then one, one, two and three drops.
   Chosen = the accent, like the mood faces — no fill */
const FLOW_ICONS: Record<string, { drops: number; size: number; label: string }> = {
  '': { drops: 0, size: 19, label: 'None' },
  spotting: { drops: 1, size: 19, label: 'Spotting' },
  light: { drops: 1, size: 19, label: 'Light' },
  medium: { drops: 2, size: 19, label: 'Medium' },
  heavy: { drops: 3, size: 19, label: 'Heavy' },
};

/* The cycle icons: in one row from the left, evenly spaced */
const TwoUp = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  align-items: center;
  gap: 10px 12px;
`;

const FlowBtn = styled.button<{ $active: boolean }>`
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  /* A chip: a light outline round each set of drops, the chosen one's in the accent */
  min-width: 44px;
  height: 36px;
  padding: 0 12px;
  border: 1px solid ${({ $active }) => ($active ? 'var(--color-accent-line, var(--color-accent))' : 'var(--border-card)')};
  border-radius: 999px;
  background: transparent;
  cursor: pointer;
  color: ${({ $active }) => ($active ? 'var(--color-accent)' : 'var(--text-disabled)')};
  transition: color 120ms;
  &:hover { color: var(--color-accent); }
  &:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
  .drops { display: inline-flex; align-items: center; height: 22px; gap: 0; }
  .drops > span { font-weight: 300; font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24; }
  small { font-family: var(--font-sans); font-size: 12px; color: ${({ $active }) => ($active ? 'var(--color-accent-soft)' : 'var(--text-muted)')}; }
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

/* Home dashboard: the card is narrower there, so slightly smaller faces (32px),
   going on to a second line when they don't all fit */
const SmallFacesQuad = styled(QuadWrapper)`
  &&& ${Faces} { flex-wrap: wrap; gap: 12px 16px; }
  &&& ${FaceBtn} {
    width: 32px;
    height: 32px;
    & > span { font-size: 38px; }
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
  /* The faces at 32px, going on to a second line when the cell is too narrow for them all */
  && ${Faces} { flex-wrap: wrap; gap: 12px 14px; }
  && ${FaceBtn} { flex: none; width: 32px; height: 32px; & > span { font-size: 38px; } }
`;

/* The journal / Quick entry: no outer border or fill (the entry card is the
   container) — only the rules between the cells; overflow clips the outer edges' rules */
const Row4 = styled.div`
  display: grid;
  /* Mood gets room for its five faces; Cycle's chips wrap in a narrower cell */
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.7fr) minmax(0, 1.4fr);
  overflow: hidden;
  /* No outer box, so the outer cells' padding hangs outside: the first cell's
     text lines up with the card's labels, the last cell's with its right edge */
  margin: 0 calc(-1 * var(--cell-x));
  --cell-x: 18px; /* Your day's bar lines up with the cells */
  & > * {
    min-width: 0;
    padding: 22px var(--cell-x) 24px;
    box-shadow: -1px 0 0 var(--border-card), 0 -1px 0 var(--border-card); /* rules between cells */
  }
  /* Four across where there's room; two by two (Water | Sleep over Mood | Cycle) in a
     narrower card — the journal beside its list, the Quick entry — so nothing squeezes */
  @container (max-width: 1000px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @container (max-width: 480px) { grid-template-columns: minmax(0, 1fr); & > * { padding: 20px; } }
  /* Cycle tracking off: Water | Sleep | Mood, and Mood across when two by two */
  &[data-no-cycle] { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.7fr); }
  @container (max-width: 1000px) { &[data-no-cycle] { grid-template-columns: repeat(2, minmax(0, 1fr)); } &[data-no-cycle] > :nth-child(3) { grid-column: 1 / -1; } }
  @container (max-width: 480px) { &[data-no-cycle] { grid-template-columns: minmax(0, 1fr); } }
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
  &:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
`;

/* − / + beside the figure (the home dashboard's strip, in place of the slider):
   round outline buttons like the app's other round controls */
const Steps = styled.div`
  display: flex;
  gap: 14px;
  margin-left: auto;
  flex: none;
`;

const StepBtn = styled.button`
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--border-pill, var(--border-card));
  border-radius: 50%;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: border-color 120ms, color 120ms;
  &:hover:not(:disabled) { border-color: var(--color-accent-line, var(--color-accent)); color: var(--text-primary); }
  &:disabled { opacity: 0.4; cursor: default; }
  &:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
`;

const Quad = styled.div`
  background: var(--bg-tracker, var(--bg-panel)); /* the dashboards' cards' panel colour */
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  /* No outline: a soft shadow, like the dashboard's cards (the rules between cells stay) */
  border: 1px solid transparent;
  box-shadow: var(--shadow-card); /* even, all the way round the card */
  border-radius: 16px;
  overflow: hidden;
  /* The same see-through panel as the dashboard's other cards under a wallpaper */
  ${glassCard}
  --cell-x: 26px;
  & > * {
    min-width: 0;
    padding: 24px var(--cell-x);
    box-shadow: -1px 0 0 var(--border-card), 0 -1px 0 var(--border-card); /* rules between cells */
  }
  /* Two by two down to a narrow card (a dashboard column); stacked only below that */
  @container (max-width: 560px) { --cell-x: 18px; & > * { padding: 20px var(--cell-x); } }
  @container (max-width: 360px) { grid-template-columns: minmax(0, 1fr); & > * { padding: 20px; } }
  /* Cycle tracking off: Mood takes the whole second row */
  &[data-no-cycle] > :nth-child(3) { grid-column: 1 / -1; }
  /* Light: no fill, just the edge (--shadow-card's ring) */
  html[data-theme='light'] & { background: transparent; }
`;

/* Strip (home dashboard): Water | Sleep | Mood | Cycle as four equal cells
   across one lifted card, rules between; under 860px Water | Sleep share a
   row and Mood, then Cycle, take a row each */
const StripWrapper = styled(CompactWrapper)`
  /* The cell titles (Water, Sleep, Mood, Cycle) a little faded */
  && ${Label} { font-size: 16px; color: color-mix(in srgb, var(--text-secondary) 70%, transparent); }
  /* Every cell on the same two lines: the labels one height, then the figures,
     faces and drops one row height, centred — so all four line up across */
  && ${Head}, && ${Meter} > ${Label} { display: flex; align-items: center; height: 24px; margin: 0 0 18px; }
  && ${MeterMain}, && ${Faces}, && ${TwoUp} { min-height: 44px; align-items: center; }
  && ${MeterMain} { gap: 14px; }
  && ${Badge} { width: 38px; height: 38px; & > span { font-size: 21px; } }
  && ${Fig} { font-size: 40px; font-weight: 300; color: var(--text-primary); }
  && ${Unit} { font-size: 15px; color: var(--text-muted); }
  && ${Slider} { margin-top: 18px; }
  && ${MoodName} { font-size: 15px; font-weight: 600; }
  /* The faces at 30px, going on to a second line when the cell is too narrow for them all
     (the glyph is 1.2× its box and reaches a little past it) */
  && ${Faces} { display: flex; flex-wrap: wrap; gap: 12px; }
  && ${FaceBtn} { flex: none; width: 30px; height: 30px; & > span { font-size: 36px; } }
  /* "Next: Nov 14" right beside the word Cycle, in italics, centred on it */
  && ${Head}.cycle-head { justify-content: flex-start; gap: 10px; }
  && ${Head}.cycle-head ${CycleNote} { font-style: italic; }
  && ${CycleNote} { font-size: 13px; }
  && ${Chips} { gap: 10px 8px; }
  /* The cycle chips on one row too: smaller drops, snugger chips */
  && ${TwoUp} { flex-wrap: nowrap; gap: 6px; }
  && ${FlowBtn} { flex: none; min-width: 32px; height: 30px; padding: 0 7px; }
  && ${FlowBtn} .drops { height: 16px; }
  && ${FlowBtn} .drops > span { font-size: 15px; }
  && ${Chip} { height: 34px; padding: 0 16px; font-size: 15px; font-weight: 400; }
`;

const Strip = styled.div<{ $flat?: boolean }>`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  /* A card: the panel colour with a light shadow, the rules between cells
     (the clip hides the outer cells' rules at the edges) */
  border-radius: 16px;
  background: var(--bg-panel);
  box-shadow: var(--shadow-card);
  overflow: hidden;
  --cell-x: 26px; /* Your day's bar lines up with the cells */
  & > * {
    min-width: 0;
    padding: 26px var(--cell-x) 28px;
    box-shadow: -1px 0 0 var(--border-card), 0 -1px 0 var(--border-card); /* rules between cells */
  }
  /* Narrower: two by two — Water | Sleep over Mood | Cycle (Your day stays full width) */
  @container (max-width: 860px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  @container (max-width: 480px) { --cell-x: 22px; & > * { padding: 22px var(--cell-x) 24px; } }
  /* Inside a panel of its own (the Health dashboard): no card of its own, only the
     rules between cells; the outer cells' padding hangs outside so the first lines up
     with the panel's title */
  ${({ $flat }) => ($flat ? `
    background: transparent;
    box-shadow: none;
    border-radius: 0;
    margin: 0 calc(-1 * var(--cell-x));
  ` : '')}
  /* Cycle tracking off: Water | Sleep | Mood across */
  &[data-no-cycle] { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  @container (max-width: 860px) { &[data-no-cycle] { grid-template-columns: repeat(2, minmax(0, 1fr)); } &[data-no-cycle] > :nth-child(3) { grid-column: 1 / -1; } }
  /* Light: no fill, just the edge (--shadow-card's ring) */
  html[data-theme='light'] & { background: transparent; }
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
  /** No round icon (the strip): the figure and the rule only */
  noBadge?: boolean;
  /** − / + buttons beside the figure, and no slider (the strip) */
  stepper?: boolean;
  /** Only a row of tap icons (one per unit of the goal): no figure, badge, − / + or slider — water's glasses, sleep's hours */
  taps?: TapKind;
}

function MeterTile({ label, icon, color, value, goal, max, unit, noun, one, onChange, minus, noBadge, stepper, taps }: MeterProps) {
  const pct = Math.min(100, (value / goal) * 100);
  // Water and sleep: just the icons
  if (taps) return (
    <Meter>
      <Label>{label}</Label>
      <TapIcons kind={taps} label={label} value={value} goal={goal} onChange={v => onChange(Math.min(max, v))} />
    </Meter>
  );
  return (
    <Meter>
      <Label>{label}</Label>
      <MeterMain>
        {!noBadge && <Badge type="button" $color={color} aria-label={`Add one ${one}`} title={`Add one ${one}`}
          disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
          <MaterialIcon $size={26}>{icon}</MaterialIcon>
        </Badge>}
        <Figure>
          <Fig aria-label={`${value} ${noun}`}>{value}</Fig>
          <Unit>{unit}</Unit>
        </Figure>
        {minus && (
          <Minus type="button" aria-label={`Take away one ${one}`} title={`Take away one ${one}`}
            disabled={value <= 0} onClick={() => onChange(Math.max(0, value - 1))}>−</Minus>
        )}
        {stepper && (
          <Steps>
            <StepBtn type="button" aria-label={`Take away one ${one}`} title={`Take away one ${one}`}
              disabled={value <= 0} onClick={() => onChange(Math.max(0, value - 1))}>
              <Icon name="minus" size={16} strokeWidth={2} aria-hidden="true" />
            </StepBtn>
            <StepBtn type="button" aria-label={`Add one ${one}`} title={`Add one ${one}`}
              disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
              <Icon name="plus" size={16} strokeWidth={2} aria-hidden="true" />
            </StepBtn>
          </Steps>
        )}
      </MeterMain>
      {!stepper && <Slider>
        <Track><Fill $pct={pct} $color={color} /></Track>
        {/* Spans 0 to the goal; past it, tap the icon */}
        <Range type="range" min={0} max={goal} step={1} value={Math.min(value, goal)}
          aria-label={label} aria-valuetext={`${value} ${noun}`}
          onChange={e => onChange(Number(e.target.value))} />
        <Thumb $pct={pct} aria-hidden="true" />
      </Slider>}
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
  /** Strip: Water | Sleep | Mood | Cycle across one lifted card (home dashboard), no icon
   *  badges; its footer (Your day) as a full-width last row */
  strip?: boolean;
  /** The strip without a card of its own (it sits in a panel) */
  flat?: boolean;
  /** A full-width last row inside the box (row, quad and strip layouts) — Your day */
  footer?: React.ReactNode;
}


export function WellnessPanel({
  water, waterGoal = WATER_GOAL, sleep, mood, flow,
  onWater, onSleep, onMood, onFlow, showCycle = true, cycleNote, compact, quad, smallFaces, row, strip, flat, footer,
}: WellnessPanelProps) {
  // One colour throughout: the accent (no per-metric blues, violets or mood hues)
  const accent = 'var(--color-accent)';
  const water$ = (
    <MeterTile label="Water" icon="water_drop" color={accent} value={water} goal={waterGoal}
      max={WATER_MAX} unit={row ? `/ ${waterGoal}` : `of ${waterGoal} glasses`} noun="glasses of water" one="glass of water" onChange={onWater} minus={row} noBadge={strip} stepper={strip} taps="glass" />
  );
  const sleep$ = (
    <MeterTile label="Sleep" icon="partly_cloudy_night" color={accent} value={sleep} goal={SLEEP_GOAL}
      max={SLEEP_MAX} unit={row ? 'h' : 'hours'} noun="hours of sleep" one="hour of sleep" onChange={onSleep} minus={row} noBadge={strip} stepper={strip} taps="hour" />
  );
  const mood$ = (
    <Cell>
      <Head>
        <Label>Mood</Label>
        {mood > 0 && <MoodName $color={accent}>{MOODS.find(m => m.value === mood)?.label}</MoodName>}
      </Head>
      <Faces role="group" aria-label="Mood">
        {MOODS.map(m => (
          <FaceBtn key={m.icon} type="button" $active={mood === m.value} $color={accent}
            aria-label={`Mood: ${m.label}`} aria-pressed={mood === m.value}
            onClick={() => onMood(mood === m.value ? 0 : m.value)}>
            <MoodFace name={m.icon} />
          </FaceBtn>
        ))}
      </Faces>
    </Cell>
  );
  const cycleIcons$ = showCycle && (
    <Cell>
      <Head className="cycle-head"><Label>Cycle</Label>{cycleNote && <CycleNote>{cycleNote}</CycleNote>}</Head>
      <TwoUp role="group" aria-label="Cycle">
        {/* None, one drop, two drops, three drops (a day logged as Spotting shows as one drop) */}
        {(['', 'light', 'medium', 'heavy'] as FlowIntensity[]).map(f => {
          const ic = FLOW_ICONS[f];
          const on = flow === f || (f === 'light' && flow === 'spotting');
          return (
            <FlowBtn key={f || 'none'} type="button" $active={on} aria-pressed={on}
              aria-label={`Cycle: ${ic.label}`} title={ic.label} onClick={() => onFlow(f)}>
              <span className="drops" aria-hidden="true">
                {ic.drops === 0
                  ? <MaterialIcon $size={ic.size}>format_color_reset</MaterialIcon>
                  : Array.from({ length: ic.drops }, (_, i) => <MaterialIcon key={i} $size={ic.size}>water_drop</MaterialIcon>)}
              </span>
            </FlowBtn>
          );
        })}
      </TwoUp>
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

  if (strip) {
    return <StripWrapper><Strip $flat={flat} data-no-cycle={showCycle ? undefined : ''}>{water$}{sleep$}{mood$}{cycleIcons$}{footer && <FullRow>{footer}</FullRow>}</Strip></StripWrapper>;
  }

  if (row) {
    return <RowWrapper><Row4 data-no-cycle={showCycle ? undefined : ''}>{water$}{sleep$}{mood$}{cycle$}{footer && <FullRow>{footer}</FullRow>}</Row4></RowWrapper>;
  }

  if (quad) {
    const Wrap = smallFaces ? SmallFacesQuad : QuadWrapper;
    return <Wrap><Quad data-no-cycle={showCycle ? undefined : ''}>{water$}{sleep$}{mood$}{cycle$}{footer && <FullRow>{footer}</FullRow>}</Quad></Wrap>;
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
