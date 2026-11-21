import styled from 'styled-components';
import { Checkbox } from '../atoms/core/Checkbox.jsx';
import { Section, SectionHead, SectionLabel, FieldNote } from './fields/formKit.js';
import type { KitchenAllergy } from '../../utils/aiKitchen.js';
import type { RecipeFieldValues } from '../../types/fields.js';

/*
 * Pieces shared by the AI kitchen dialogs (AI menu, Recipe from ingredients).
 * Props only.
 */

export const ALLERGEN_NOTE = 'Written by an AI model. The AI can get allergens wrong, so check every ingredient yourself before you cook or eat anything.';

/** Said wherever an AI price shows, and kept in a saved list's notes */
export const PRICE_NOTE = 'Prices are estimates. They vary by store and by where you live, and the AI may not estimate them accurately.';

export const KitchenNote = styled.p<{ $error?: boolean }>`
  margin: 0 0 16px;
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.5;
  color: ${({ $error }) => ($error ? 'var(--color-danger)' : 'var(--text-muted)')};
`;

export const KitchenCenter = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 32px 0;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-muted);
`;

/** A heading over review rows, like the AI plan's */
export const ReviewSection = styled.section`
  & + & { margin-top: 26px; }
  h3 {
    margin: 0 0 4px;
    font-family: var(--font-display);
    font-size: 20px;
    font-weight: 300;
    color: var(--text-primary);
  }
  ul { list-style: none; margin: 0; padding: 0; }
  li { padding: 12px 0; border-bottom: 1px solid var(--border-subtle); }
`;

export const ReviewDetail = styled.div<{ $flush?: boolean }>`
  margin: 2px 0 0 ${({ $flush }) => ($flush ? 0 : 30)}px;
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-muted);
  overflow-wrap: anywhere;
`;

export const AllergenFlag = styled.div<{ $flush?: boolean }>`
  margin: 4px 0 0 ${({ $flush }) => ($flush ? 0 : 30)}px;
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 600;
  color: var(--color-danger);
`;

/** Space between the set-up form's rows */
export const SetupForm = styled.div`
  display: flex;
  flex-direction: column;
  gap: 26px;
  ${Section} + ${Section} { margin-top: 0; }
`;

/** "Include my allergies": unticked every time the dialog opens; says exactly what would go */
export function AllergyTick({ allergies, checked, onChange }: {
  allergies: KitchenAllergy[];
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <Section>
      <SectionHead><SectionLabel>Allergies</SectionLabel></SectionHead>
      {allergies.length === 0 ? (
        <FieldNote>No allergies saved. Add them as Allergy entries in your journal to use them here.</FieldNote>
      ) : (<>
        <Checkbox label="Include my allergies" checked={checked} onChange={e => onChange(e.target.checked)} />
        <FieldNote>
          {checked
            ? `Sent this time: ${allergies.map(a => a.allergen).join(', ')}, with each reaction and severity.`
            : `Not sent. Tick to send ${allergies.map(a => a.allergen).join(', ')} so the AI can avoid them.`}
        </FieldNote>
      </>)}
    </Section>
  );
}

const Facts = styled.div`
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-muted);
`;

const Lists = styled.div<{ $flush?: boolean }>`
  margin: 8px 0 0 ${({ $flush }) => ($flush ? 0 : 30)}px;
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.55;
  color: var(--text-secondary);
  h4 {
    margin: 10px 0 4px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-soft);
  }
  ul, ol { margin: 0; padding-left: 20px; }
  ul { list-style: disc; }
  li { padding: 2px 0; border: none; }
`;

/** A recipe's description, facts, ingredients and method, for review (indented under its tick unless `flush`) */
export function RecipeDetails({ fields, flush }: { fields: RecipeFieldValues; flush?: boolean }) {
  const facts = [
    fields.servings && `Serves ${fields.servings}`,
    fields.prepTime && `Prep ${fields.prepTime} min`,
    fields.cookTime && `Cook ${fields.cookTime} min`,
    fields.cuisine,
    fields.difficulty && fields.difficulty[0].toUpperCase() + fields.difficulty.slice(1),
  ].filter(Boolean).join(' · ');
  return (
    <Lists $flush={flush}>
      {fields.description && <div>{fields.description}</div>}
      {facts && <Facts>{facts}</Facts>}
      <h4>Ingredients</h4>
      <ul>{fields.ingredients.map(i => <li key={i.id}>{[i.amount, i.name].filter(Boolean).join(' ')}</li>)}</ul>
      {(fields.steps?.length ?? 0) > 0 && (<>
        <h4>Method</h4>
        <ol>{fields.steps!.map(s => <li key={s.id}>{s.title ? `${s.title}: ` : ''}{s.text}</li>)}</ol>
      </>)}
    </Lists>
  );
}
