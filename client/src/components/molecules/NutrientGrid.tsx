import styled from 'styled-components';
import { SuffixInput } from '../atoms/SuffixInput.js';

/* Nutrients as one compact row of small filled boxes (short label above,
   unit inside) instead of a full-width row each. Wraps two-up on phones.
   AI-estimated values show in italics. Props only. */

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
  gap: 10px;
`;

const Cell = styled.label<{ $ai?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  input { font-style: ${({ $ai }) => ($ai ? 'italic' : 'normal')}; }
`;

const CellLabel = styled.span`
  font-family: var(--font-label);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-tertiary);
`;

const Note = styled.p`
  margin: 6px 0 0;
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--text-tertiary);
`;

export interface NutrientGridItem {
  key: string;
  label: string;
  short: string;
  unit: string;
  step: string;
}

interface NutrientGridProps {
  nutrients: readonly NutrientGridItem[];
  values: Record<string, unknown>;
  onChange: (key: string, value: string) => void;
  /** Per-key placeholder (e.g. a value detected from the name) */
  placeholders?: Record<string, string>;
  /** Keys whose current value is an AI estimate */
  aiKeys?: ReadonlySet<string>;
  /** Muted line under the boxes */
  note?: string;
}

export function NutrientGrid({ nutrients, values, onChange, placeholders = {}, aiKeys, note }: NutrientGridProps) {
  const anyAi = nutrients.some(n => aiKeys?.has(n.key));
  return (
    <div>
      <Grid>
        {nutrients.map(n => {
          const ai = !!aiKeys?.has(n.key);
          return (
            <Cell key={n.key} $ai={ai} title={ai ? 'AI estimate — edit to override' : undefined}>
              <CellLabel>{n.short}</CellLabel>
              <SuffixInput
                type="number"
                step={n.step}
                min="0"
                inputMode="decimal"
                suffix={n.unit}
                value={String(values[n.key] ?? '')}
                onChange={e => onChange(n.key, e.target.value)}
                placeholder={placeholders[n.key] ?? ''}
                aria-label={`${n.label}${n.unit ? ` (${n.unit})` : ''}${ai ? ', AI estimate' : ''}`}
              />
            </Cell>
          );
        })}
      </Grid>
      {(note || anyAi) && <Note>{[note, anyAi ? 'Italic = AI estimate; edit to override.' : ''].filter(Boolean).join(' ')}</Note>}
    </div>
  );
}
