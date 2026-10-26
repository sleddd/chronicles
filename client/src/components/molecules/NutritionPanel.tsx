import styled from 'styled-components';
import { PillButton } from '../atoms/PillButton.js';
import { NUTRIENTS, type NutrientKey } from '../../types/nutrition.js';

/* The nutrition panel shared by every meal form (journal editor, Health → Log a
   Meal, home Quick Entry): an optional NUTRITION heading with an action, one
   outlined panel — calories as a large figure + kcal over a column-ruled strip
   of micronutrients — and an optional note under it. Italic = AI estimate.
   Props only. */

/** Everything but calories, which leads the panel */
const MICRONUTRIENTS = NUTRIENTS.filter(n => n.key !== 'calories');

/* Same heading as the other field forms (formKit): sentence case, soft grey */
export const SectionHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 0 0 14px;
`;

export const SectionTitle = styled.h3`
  margin: 0;
  font-family: var(--font-sans);
  font-size: 16px;
  font-weight: 500;
  color: var(--text-soft);
`;

/* Estimate / Re-estimate: the app's outlined accent pill (PillButton) */
export const PillBtn = PillButton;

/* Panel + its note; the space below separates it from the next field's label.
   The layout follows the panel's own width (container queries), not the
   screen's: a tablet is wide, but the journal or Log a Meal card is not */
const Block = styled.div`
  container: nutrition / inline-size;
`;

/* Outlined (no fill), like the other field boxes */
const Panel = styled.div`
  background: transparent;
  border: 1px solid var(--border-card);
  border-radius: 10px;
  overflow: hidden;
`;

const CaloriesRow = styled.label`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  padding: 22px 28px;
  cursor: text;
  &:focus-within { box-shadow: inset 0 0 0 1px var(--color-accent); }
  @container nutrition (max-width: 560px) { padding: 18px 18px; }
`;

const PanelLabel = styled.span`
  font-family: var(--font-sans);
  font-size: 12px;
  font-weight: 400;
  letter-spacing: 0.10rem;
  text-transform: uppercase;
  color: var(--text-secondary);
  /* Light: sentence case at normal spacing */
  html[data-theme='light'] & { text-transform: none; letter-spacing: normal; font-size: 14px; font-weight: 500; }
  /* Narrow cards (Log a Meal): smaller, tighter labels that stay on one line */
  [data-compact] & {
    font-size: 10px;
    letter-spacing: 0.05rem;
    white-space: nowrap;
  }
`;

const CaloriesValue = styled.span`
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
`;

/* Inputs inside the panel sit on the panel's fill — no box of their own */
const BareInput = styled.input<{ $ai?: boolean }>`
  &&&& {
    min-width: 0;
    min-height: 0;
    padding: 0;
    background: transparent !important;
    border: none !important;
    border-radius: 0;
    outline: none !important;
    box-shadow: none;
    color: var(--text-primary);
    font-family: var(--font-sans);
    font-weight: 600;
    font-style: ${({ $ai }) => ($ai ? 'italic' : 'normal')};
    font-variant-numeric: tabular-nums;
    -moz-appearance: textfield;
    appearance: textfield;
  }
  &::-webkit-inner-spin-button, &::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
  &::placeholder { color: var(--text-disabled); font-weight: 400; }
`;

const CaloriesInput = styled(BareInput)`
  &&&& {
    width: 5.5ch;
    text-align: right;
    /* The app's thin large figure (italic still = AI), not a bold number */
    font-family: var(--font-display);
    font-size: 44px;
    font-weight: 300;
    line-height: 1.1;
  }
`;

const Unit = styled.span`
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-tertiary);
`;

const Strip = styled.div`
  display: grid;
  grid-template-columns: repeat(${MICRONUTRIENTS.length}, minmax(0, 1fr));
  border-top: 1px solid var(--border-card);
  /* One row when the panel is wide; narrower ones (tablets, phones, cards) get
     two rows of four with the short names, so nothing squeezes */
  @container nutrition (max-width: 880px) {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    /* Seven cells leave the eighth slot empty: an empty cell with the same
       rules closes the grid instead of leaving a gap at the bottom right */
    &::after {
      content: '';
      border-left: 1px solid var(--border-card);
      border-top: 1px solid var(--border-card);
    }
  }
`;

const Cell = styled.label`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 16px 28px 18px;
  cursor: text;
  & + & { border-left: 1px solid var(--border-card); }
  &:focus-within { box-shadow: inset 0 0 0 1px var(--color-accent); }
  @container nutrition (max-width: 1000px) { padding: 14px 12px 16px; }
  [data-compact] & { padding-left: 12px; padding-right: 12px; }
  /* Two rows of four: no rule before each row's first cell, a rule above the second row */
  @container nutrition (max-width: 880px) {
    padding: 12px 10px 14px;
    &:nth-child(4n + 1) { border-left: none; }
    &:nth-child(n + 5) { border-top: 1px solid var(--border-card); }
  }
  /* The full name, or the short one in two rows ("Vit D", "B12") */
  .short { display: none; }
  @container nutrition (max-width: 880px) { .full { display: none; } .short { display: inline; } }
`;

const CellValue = styled.span`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
`;

const CellInput = styled(BareInput)`
  &&&& {
    flex: 1;
    width: 100%;
    /* Thin Work Sans figures like the calories — not bold */
    font-family: var(--font-display);
    font-size: 22px;
    font-weight: 300;
    line-height: 1.2;
    @container nutrition (max-width: 1000px) { font-size: 19px; }
  }
`;

const Note = styled.p<{ $error?: boolean }>`
  margin: 12px 0 0;
  font-family: var(--font-sans);
  font-size: 14px;
  color: ${({ $error }) => ($error ? 'var(--color-danger)' : 'var(--text-tertiary)')};
  em { font-style: italic; }
`;

interface NutritionPanelProps {
  /** Current values by nutrient key (strings or numbers; blank = empty) */
  values: Partial<Record<NutrientKey, unknown>>;
  onChange: (key: NutrientKey, value: string) => void;
  /** Which values are AI estimates (shown italic) */
  isAi?: (key: NutrientKey) => boolean;
  /** Heading action, e.g. the Estimate / Re-estimate pill */
  action?: React.ReactNode;
  /** An error replaces the AI note */
  error?: string;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  /** Narrow containers (Log a Meal card): smaller one-line labels, tighter cells */
  compact?: boolean;
}

export function NutritionPanel({ values, onChange, isAi = () => false, action, error, onKeyDown, compact }: NutritionPanelProps) {
  const str = (key: NutrientKey) => String(values[key] ?? '');
  const ai = (key: NutrientKey) => isAi(key) && !!str(key);
  const anyAi = NUTRIENTS.some(n => ai(n.key));

  return (
    <>
      <SectionHead>
        <SectionTitle>Nutrition</SectionTitle>
        {action}
      </SectionHead>
      <Block data-compact={compact || undefined}>
        <Panel>
          <CaloriesRow>
            <PanelLabel>Calories</PanelLabel>
            <CaloriesValue>
              <CaloriesInput
                type="number"
                min="0"
                inputMode="numeric"
                $ai={ai('calories')}
                value={str('calories')}
                onChange={e => onChange('calories', e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="0"
                aria-label={`Calories${ai('calories') ? ', AI estimate' : ''}`}
              />
              <Unit>kcal</Unit>
            </CaloriesValue>
          </CaloriesRow>
          <Strip>
            {MICRONUTRIENTS.map(n => (
              <Cell key={n.key} title={ai(n.key) ? 'AI estimate — edit to override' : undefined}>
                <PanelLabel><span className="full">{n.label}</span><span className="short">{n.short}</span></PanelLabel>
                <CellValue>
                  <CellInput
                    type="number"
                    step={n.step}
                    min="0"
                    inputMode="decimal"
                    $ai={ai(n.key)}
                    value={str(n.key)}
                    onChange={e => onChange(n.key, e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="0"
                    aria-label={`${n.label} (${n.unit})${ai(n.key) ? ', AI estimate' : ''}`}
                  />
                  <Unit>{n.unit}</Unit>
                </CellValue>
              </Cell>
            ))}
          </Strip>
        </Panel>
        {error
          ? <Note $error role="status">{error}</Note>
          : anyAi && <Note><em>Italic</em> values are AI estimates. Edit any to override.</Note>}
      </Block>
    </>
  );
}
