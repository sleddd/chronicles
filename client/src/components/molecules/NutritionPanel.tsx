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

export const SectionHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 40px;
  margin: 18px 0 4px;
  &:first-child { margin-top: 0; }
`;

export const SectionTitle = styled.h3`
  margin: 0;
  font-family: var(--font-label);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-tertiary);
`;

/* Estimate / Re-estimate: the app's outlined accent pill (PillButton) */
export const PillBtn = PillButton;

/* Panel + its note; the space below separates it from the next field's label */
const Block = styled.div`
  margin: 6px 0 18px;
`;

const Panel = styled.div`
  background: var(--bg-sunken);
  border: 1px solid var(--border-field, var(--border-default));
  border-radius: var(--r-lg, 6px);
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
  @media (max-width: 640px) { padding: 18px 18px; }
`;

const PanelLabel = styled.span`
  font-family: var(--font-sans);
  font-size: 12px;
  font-weight: 400;
  letter-spacing: 0.10rem;
  text-transform: uppercase;
  color: var(--text-secondary);
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
    font-size: 44px;
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
  border-top: 1px solid var(--border-field, var(--border-default));
  @media (max-width: 640px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
`;

const Cell = styled.label`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 16px 28px 18px;
  cursor: text;
  & + & { border-left: 1px solid var(--border-field, var(--border-default)); }
  &:focus-within { box-shadow: inset 0 0 0 1px var(--color-accent); }
  @media (max-width: 640px) {
    padding: 14px 18px 16px;
    &:nth-child(odd) { border-left: none; }
    &:nth-child(n + 3) { border-top: 1px solid var(--border-field, var(--border-default)); }
  }
  [data-compact] & { padding-left: 14px; padding-right: 14px; }
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
    font-size: 22px;
    line-height: 1.2;
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
                <PanelLabel>{n.label}</PanelLabel>
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
