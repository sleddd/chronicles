import { useId, useState } from 'react';
import styled from 'styled-components';
import type { WellnessFieldValues } from '../../types/fields.js';
import { JoinedGroup, JoinedBtn } from './fields/formKit.js';

/* "Your day" — the daily inventory questions the four-square check-in doesn't
   ask (Lifehacker's Daily Personal Inventory): Rested, Woke in the night,
   Ate, Work day, Social time and Procrastinated, two columns of labelled rows
   with hairlines between, each answer a joined group of buttons (tap the
   chosen one again to clear it), inside one outlined box whose bar —
   "Your day · 2 of 6" and "Tap to answer" ⌄ — opens them; closed by
   default. Used under the check-in on both dashboards and in the
   journal's Wellness entry. Props only (plus whether it's open). */

export type DayInventoryValues = Pick<WellnessFieldValues,
  'sleepQuality' | 'wokeAtNight' | 'eating' | 'workDay' | 'social' | 'procrastination'>;

export const QUALITY_WORDS = ['Poor', 'Fair', 'OK', 'Good', 'Great'];
export const RESTED_WORDS = ['Not at all', 'A little', 'Somewhat', 'Mostly', 'Fully'];
export const PROCRASTINATION_WORDS = ['Not at all', 'A little', 'Some', 'A lot', 'All day'];
export const HEALTHY_WORDS = ['Not at all', 'A little', 'Somewhat', 'Mostly', 'Very'];

/* "Your day" — one outlined box: a bar ("Your day · 2 of 6", "Tap to answer" ⌄)
   that opens the questions inside it (closed by default) */
const Box = styled.div<{ $inside?: boolean }>`
  margin-top: ${({ $inside }) => ($inside ? '0' : '24px')};
  border: ${({ $inside }) => ($inside ? 'none' : '1px solid var(--border-card)')};
  border-radius: 10px;
  background: ${({ $inside }) => ($inside ? 'transparent' : 'var(--bg-control, transparent)')};
`;

const Bar = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
  min-height: 52px;
  padding: 0 var(--cell-x, 22px);
  border: none;
  border-radius: 10px;
  background: none;
  font-family: var(--font-sans);
  text-align: left;
  cursor: pointer;
  .title { font-size: 16px; color: var(--text-secondary); }
  .count { font-size: 16px; color: var(--text-muted); }
  .hint { display: inline-flex; align-items: center; gap: 14px; font-size: 15px; color: var(--text-muted); }
  /* The app's chevron, turning as it opens */
  .hint::after {
    content: '';
    width: 6px;
    height: 6px;
    border-right: 1.5px solid currentColor;
    border-bottom: 1.5px solid currentColor;
    transform: translateY(-2px) rotate(45deg);
    transition: transform 0.15s ease;
  }
  &[aria-expanded='true'] .hint::after { transform: translateY(1px) rotate(-135deg); }
  &:hover .hint { color: var(--text-secondary); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

/* Two columns of labelled rows, hairlines between; one column when narrow */
const Body = styled.div`
  container-type: inline-size;
  padding: 0 var(--cell-x, 22px) 4px;
  border-top: 1px solid var(--border-subtle);
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 72px;
  & > div:nth-last-child(-n + 2) { border-bottom: none; }
  @container (max-width: 760px) {
    grid-template-columns: minmax(0, 1fr);
    & > div:nth-last-child(2) { border-bottom: 1px solid var(--border-subtle); }
  }
`;

const Item = styled.div`
  display: flex;
  align-items: center;
  gap: 8px 14px;
  min-height: 56px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-subtle);
  font-family: var(--font-sans);
  > span { flex: 0 0 166px; font-size: 16px; color: var(--text-secondary); }
  @media (max-width: 480px) { flex-wrap: wrap; > span { flex-basis: 100%; } }
`;

/** 1–5 as a joined group (the word for each as its label); tapping the chosen one again clears it */
export function RatingRow({ value, onChange, words, label }: {
  value: number;
  onChange: (v: number) => void;
  words: string[];
  label: string;
}) {
  return (
    <JoinedGroup role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map(n => (
        <JoinedBtn key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n}, ${words[n - 1]}`}
          title={words[n - 1]} $active={value === n} onClick={() => onChange(value === n ? 0 : n)}>
          {n}
        </JoinedBtn>
      ))}
    </JoinedGroup>
  );
}

const EATING: { value: NonNullable<DayInventoryValues['eating']>; label: string }[] = [
  { value: 'too_little', label: 'Too little' },
  { value: 'just_right', label: 'Just right' },
  { value: 'too_much', label: 'Too much' },
];

interface DayInventoryProps {
  values: DayInventoryValues;
  onChange: (patch: Partial<DayInventoryValues>) => void;
  /** As the last row inside the wellness box (WellnessPanel footer): no outline of its own */
  inside?: boolean;
}

export function DayInventory({ values, onChange, inside = false }: DayInventoryProps) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const woke = values.wokeAtNight;
  const answered = [
    !!values.sleepQuality, typeof woke === 'boolean', !!values.eating,
    !!values.workDay, !!values.social, !!values.procrastination,
  ].filter(Boolean).length;
  return (
    <Box as="section" aria-label="Your day" $inside={inside}>
      <Bar type="button" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(o => !o)}>
        <span><span className="title">Your day</span><span className="count"> · {answered} of 6</span></span>
        <span className="hint">{open ? 'Hide' : answered === 6 ? 'All answered' : 'Tap to answer'}</span>
      </Bar>
      {open && (
        <Body id={bodyId}>
          <Grid>
            <Item>
              <span>Rested when you woke</span>
              <RatingRow label="How rested you felt" value={values.sleepQuality || 0} words={RESTED_WORDS}
                onChange={v => onChange({ sleepQuality: v })} />
            </Item>
            <Item>
              <span>Woke in the night</span>
              <JoinedGroup role="radiogroup" aria-label="Woke in the night">
                {([[true, 'Yes'], [false, 'No']] as const).map(([v, label]) => (
                  <JoinedBtn key={label} type="button" role="radio" aria-checked={woke === v} $active={woke === v}
                    onClick={() => onChange({ wokeAtNight: woke === v ? null : v })}>{label}</JoinedBtn>
                ))}
              </JoinedGroup>
            </Item>
            <Item>
              <span>Ate today</span>
              <JoinedGroup role="radiogroup" aria-label="Ate today">
                {EATING.map(e => (
                  <JoinedBtn key={e.value} type="button" role="radio" aria-checked={values.eating === e.value} $active={values.eating === e.value}
                    onClick={() => onChange({ eating: values.eating === e.value ? '' : e.value })}>{e.label}</JoinedBtn>
                ))}
              </JoinedGroup>
            </Item>
            <Item>
              <span>Work day</span>
              <RatingRow label="Work day" value={values.workDay || 0} words={QUALITY_WORDS} onChange={v => onChange({ workDay: v })} />
            </Item>
            <Item>
              <span>Social time</span>
              <RatingRow label="Social time" value={values.social || 0} words={QUALITY_WORDS} onChange={v => onChange({ social: v })} />
            </Item>
            <Item>
              <span>Procrastinated</span>
              <RatingRow label="How much you procrastinated" value={values.procrastination || 0} words={PROCRASTINATION_WORDS}
                onChange={v => onChange({ procrastination: v })} />
            </Item>
          </Grid>
        </Body>
      )}
    </Box>
  );
}
