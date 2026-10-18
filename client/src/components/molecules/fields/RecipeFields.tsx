import { useState } from 'react';
import styled from 'styled-components';
import { TitleInput } from './TitleInput.js';
import { Icon } from '../../atoms/core/Icon.jsx';
import type { RecipeFieldValues, RecipeIngredient, RecipeStep, RecipeCategory, RecipeDifficulty } from '../../../types/fields.js';
export type { RecipeFieldValues } from '../../../types/fields.js';

/* Recipe fields in the journal editor: the name as a big borderless title and
   a one-line description under it; an outlined strip of small facts
   (category, cuisine, servings, prep, cook time, calories) split by rules;
   Difficulty as outline chips; Ingredients and Method as lists with an
   outlined "add" box each (Enter adds); linked shopping lists as chips with a
   dashed "+ Link a list". Sentence-case section labels; colours are the card
   mockup tokens. Props only. */

const CATEGORIES: { value: RecipeCategory; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
  { value: 'dessert', label: 'Dessert' },
];

const DIFFICULTIES: { value: RecipeDifficulty; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
];

/** "2 cups rice" → amount "2 cups", name "rice"; text with no leading amount is all name */
export function splitIngredient(text: string): { amount: string; name: string } {
  const m = text.trim().match(/^((?:\d+(?:[./]\d+)?|[¼½¾⅓⅔⅛])(?:\s*(?:-|to)\s*\d+(?:[./]\d+)?)?(?:\s+(?:cups?|c|tbsps?|tablespoons?|tsps?|teaspoons?|g|grams?|kg|ml|l|liters?|litres?|oz|ounces?|lbs?|pounds?|cloves?|pinch(?:es)?|cans?|slices?|pieces?|handfuls?|sprigs?|bunch(?:es)?|sticks?|large|medium|small))?)\s+(.+)$/i);
  return m ? { amount: m[1].trim(), name: m[2].trim() } : { amount: '', name: text.trim() };
}

/* ── Styles ── */

/* Margins, not gaps: the journal editor zeroes gaps on its field wrappers */
const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
`;

const Section = styled.section`
  display: flex;
  flex-direction: column;
  margin-top: 32px;
`;

/* The shared title field (wraps and grows to fit), a size up */
const NameInput = styled(TitleInput)`
  && { font-size: 38px; }
`;

const DescInput = styled.input`
  && {
    width: 100%;
    margin-top: 12px;
    padding: 0;
    border: none !important;
    background: transparent !important;
    outline: none;
    font-family: var(--font-sans);
    font-size: 17px;
    color: var(--text-soft);
  }
  &::placeholder { color: var(--text-hint); }
`;

/* The facts strip: one outlined box, cells split by vertical rules */
const Strip = styled.div`
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  margin-top: 32px;
  border: 1px solid var(--border-card);
  border-radius: 10px;
  overflow: hidden;
  @media (max-width: 900px) { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  @media (max-width: 520px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
`;

const Cell = styled.label`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 14px 16px;
  box-shadow: -1px 0 0 var(--border-card), 0 -1px 0 var(--border-card); /* rules between cells */
  cursor: text;
  &:focus-within { box-shadow: inset 0 0 0 1px var(--color-accent); }
`;

const CellLabel = styled.span`
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-muted);
`;

const CellValue = styled.span`
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
`;

const CellInput = styled.input`
  && {
    flex: 1;
    width: 100%;
    min-width: 0;
    padding: 0;
    border: none !important;
    background: transparent !important;
    outline: none;
    font-family: var(--font-sans);
    font-size: 17px;
    color: var(--text-secondary);
    -moz-appearance: textfield;
    appearance: textfield;
  }
  &::-webkit-inner-spin-button, &::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
  &::placeholder { color: var(--text-hint); }
`;

const CellSelect = styled.select`
  && {
    width: 100%;
    min-width: 0;
    padding: 0;
    border: none !important;
    background: transparent !important;
    appearance: none;
    outline: none;
    font-family: var(--font-sans);
    font-size: 17px;
    color: var(--text-secondary);
    cursor: pointer;
  }
  option { color: var(--text-primary); background: var(--bg-surface); }
`;

const Unit = styled.span`
  flex: none;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
`;

const SectionHead = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
`;

const SectionLabel = styled.h3`
  margin: 0;
  font-family: var(--font-sans);
  font-size: 16px;
  font-weight: 500;
  color: var(--text-soft);
`;

const Count = styled.span`
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-muted);
`;

const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
`;

/* Outline chip: chosen = accent outline + accent text, never a fill */
const Chip = styled.button<{ $active: boolean }>`
  height: 36px;
  padding: 0 18px;
  border-radius: 999px;
  border: 1px solid ${({ $active }) => ($active ? 'var(--color-accent)' : 'var(--border-card)')};
  background: transparent;
  font-family: var(--font-sans);
  font-size: 16px;
  color: ${({ $active }) => ($active ? 'var(--color-accent)' : 'var(--text-soft)')};
  cursor: pointer;
  &:hover { border-color: ${({ $active }) => ($active ? 'var(--color-accent)' : 'var(--control-border)')}; }
`;

const List = styled.ol`
  list-style: none;
  margin: 0 0 14px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  &:empty { display: none; }
`;

const Row = styled.li`
  display: flex;
  align-items: flex-start;
  gap: 14px;
`;

const Lead = styled.span`
  flex: none;
  min-width: 18px;
  padding-top: 3px;
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: 600;
  color: var(--text-muted);
`;

/* Inline-edited text in a list row — no box */
const RowInput = styled.input<{ $w?: string; $strong?: boolean }>`
  && {
    flex: ${({ $w }) => ($w ? 'none' : '1')};
    width: ${({ $w }) => $w ?? 'auto'};
    min-width: 0;
    padding: 2px 0;
    border: none !important;
    background: transparent !important;
    outline: none;
    font-family: var(--font-sans);
    font-size: 17px;
    font-weight: ${({ $strong }) => ($strong ? 500 : 400)};
    color: var(--text-secondary);
  }
  &::placeholder { color: var(--text-hint); }
`;

const RowText = styled.textarea`
  && {
    width: 100%;
    min-height: 26px;
    padding: 2px 0;
    border: none !important;
    background: transparent !important;
    outline: none;
    resize: none;
    field-sizing: content;
    font-family: var(--font-sans);
    font-size: 17px;
    line-height: 1.5;
    color: var(--text-secondary);
  }
  &::placeholder { color: var(--text-hint); }
`;

const StepBody = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
`;

const RemoveBtn = styled.button`
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  background: none;
  color: var(--control-border);
  cursor: pointer;
  &:hover { color: var(--text-primary); }
`;

/* Outlined add box: "+" (ingredients) or the next step number, Enter adds */
const AddBox = styled.form`
  display: flex;
  align-items: center;
  gap: 18px;
  height: 46px;
  padding: 0 18px;
  border: 1px solid var(--border-card);
  border-radius: 10px;
  color: var(--text-muted);
  &:focus-within { border-color: var(--color-accent); }
  & > span { font-family: var(--font-sans); font-size: 15px; font-weight: 600; }
`;

const AddInput = styled.input`
  && {
    flex: 1;
    min-width: 0;
    padding: 0;
    border: none !important;
    background: transparent !important;
    outline: none;
    font-family: var(--font-sans);
    font-size: 17px;
    color: var(--text-secondary);
  }
  &::placeholder { color: var(--text-hint); }
`;

/* Linked shopping list: accent-tinted chip with × */
const LinkedChip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  height: 36px;
  padding: 0 10px 0 16px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-accent) 11%, var(--bg-app));
  font-family: var(--font-sans);
  font-size: 16px;
  color: var(--color-accent-soft);
  max-width: 100%;
  & > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  & > button {
    display: inline-flex; padding: 0; border: none; background: none; cursor: pointer;
    color: color-mix(in srgb, var(--color-accent) 60%, var(--bg-app));
    &:hover { color: var(--color-accent-soft); }
  }
`;

/* "+ Link a list ⌄": a native select dressed as a dashed pill */
const LinkPill = styled.label`
  position: relative;
  display: inline-flex;
  align-items: center;
  height: 36px;
  border: 1.5px dashed var(--border-dashed);
  border-radius: 999px;
  color: var(--text-muted);
  &:focus-within { border-color: var(--color-accent); }
  select {
    height: 100%;
    padding: 0 40px 0 16px;
    border: none;
    background: transparent;
    appearance: none;
    outline: none;
    font-family: var(--font-sans);
    font-size: 16px;
    color: var(--text-soft);
    cursor: pointer;
  }
  option { color: var(--text-primary); background: var(--bg-surface); }
  & > span { position: absolute; right: 14px; pointer-events: none; display: inline-flex; }
`;

const Empty = styled.span`
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-muted);
`;

/* ── Component ── */

interface RecipeFieldsProps {
  values: RecipeFieldValues;
  onChange: (values: RecipeFieldValues) => void;
  shoppingListOptions?: { id: number; title: string }[];
}

export function RecipeFields({ values, onChange, shoppingListOptions = [] }: RecipeFieldsProps) {
  const ingredients = values.ingredients || [];
  const steps = values.steps || [];
  const linkedShoppingListIds = values.linkedShoppingListIds || [];
  const [newIngredient, setNewIngredient] = useState('');
  const [newStep, setNewStep] = useState('');

  const set = (patch: Partial<RecipeFieldValues>) => onChange({ ...values, ...patch });

  const updateIngredient = (index: number, patch: Partial<RecipeIngredient>) =>
    set({ ingredients: ingredients.map((ing, i) => (i === index ? { ...ing, ...patch } : ing)) });
  const removeIngredient = (index: number) => set({ ingredients: ingredients.filter((_, i) => i !== index) });
  const addIngredient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIngredient.trim()) return;
    set({ ingredients: [...ingredients, { id: crypto.randomUUID(), ...splitIngredient(newIngredient) }] });
    setNewIngredient('');
  };

  const updateStep = (index: number, patch: Partial<RecipeStep>) =>
    set({ steps: steps.map((s, i) => (i === index ? { ...s, ...patch } : s)) });
  const removeStep = (index: number) => set({ steps: steps.filter((_, i) => i !== index) });
  const addStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStep.trim()) return;
    set({ steps: [...steps, { id: crypto.randomUUID(), title: '', text: newStep.trim() }] });
    setNewStep('');
  };

  const availableToLink = shoppingListOptions.filter(sl => !linkedShoppingListIds.includes(sl.id));

  return (
    <Wrapper>
      <NameInput
        value={values.recipeName ?? ''}
        onChange={e => set({ recipeName: e.target.value })}
        placeholder="What is the recipe?"
        aria-label="Recipe name"
      />
      <DescInput
        value={values.description ?? ''}
        onChange={e => set({ description: e.target.value })}
        placeholder="A short, appetizing one-liner…"
        aria-label="Description"
      />

      <Strip>
        <Cell>
          <CellLabel>Category</CellLabel>
          <CellSelect value={values.category ?? ''} onChange={e => set({ category: e.target.value as RecipeCategory | '' })}>
            <option value="">Choose</option>
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </CellSelect>
        </Cell>
        <Cell>
          <CellLabel>Cuisine</CellLabel>
          <CellInput value={values.cuisine} onChange={e => set({ cuisine: e.target.value })} placeholder="e.g. Italian" />
        </Cell>
        <Cell>
          <CellLabel>Servings</CellLabel>
          <CellInput type="number" min="1" inputMode="numeric" value={values.servings}
            onChange={e => set({ servings: e.target.value })} placeholder="4" />
        </Cell>
        <Cell>
          <CellLabel>Prep time</CellLabel>
          <CellValue>
            <CellInput inputMode="numeric" value={values.prepTime} onChange={e => set({ prepTime: e.target.value })} placeholder="10" />
            <Unit>min</Unit>
          </CellValue>
        </Cell>
        <Cell>
          <CellLabel>Cook time</CellLabel>
          <CellValue>
            <CellInput inputMode="numeric" value={values.cookTime} onChange={e => set({ cookTime: e.target.value })} placeholder="20" />
            <Unit>min</Unit>
          </CellValue>
        </Cell>
        <Cell>
          <CellLabel>Calories</CellLabel>
          <CellValue>
            <CellInput inputMode="numeric" value={values.calories ?? ''} onChange={e => set({ calories: e.target.value })} placeholder="320" />
            <Unit>kcal</Unit>
          </CellValue>
        </Cell>
      </Strip>

      <Section aria-label="Difficulty">
        <SectionHead><SectionLabel>Difficulty</SectionLabel></SectionHead>
        <Chips>
          {DIFFICULTIES.map(d => (
            <Chip key={d.value} type="button" $active={values.difficulty === d.value} aria-pressed={values.difficulty === d.value}
              onClick={() => set({ difficulty: values.difficulty === d.value ? '' : d.value })}>
              {d.label}
            </Chip>
          ))}
        </Chips>
      </Section>

      <Section aria-label="Ingredients">
        <SectionHead>
          <SectionLabel>Ingredients</SectionLabel>
          <Count>{ingredients.length === 0 ? 'None yet' : `${ingredients.length} ${ingredients.length === 1 ? 'ingredient' : 'ingredients'}`}</Count>
        </SectionHead>
        <List>
          {ingredients.map((ing, index) => (
            <Row key={ing.id}>
              <RowInput $w="110px" value={ing.amount} onChange={e => updateIngredient(index, { amount: e.target.value })}
                placeholder="Amount" aria-label="Amount" />
              <RowInput value={ing.name} onChange={e => updateIngredient(index, { name: e.target.value })}
                placeholder="Ingredient" aria-label="Ingredient" />
              <RemoveBtn type="button" onClick={() => removeIngredient(index)} aria-label="Remove ingredient">
                <Icon name="x" size={14} strokeWidth={2} />
              </RemoveBtn>
            </Row>
          ))}
        </List>
        <AddBox onSubmit={addIngredient}>
          <Icon name="plus" size={18} strokeWidth={1.8} aria-hidden="true" />
          <AddInput value={newIngredient} onChange={e => setNewIngredient(e.target.value)}
            placeholder="Add an ingredient, e.g. 2 cups rice" aria-label="Add an ingredient" />
        </AddBox>
      </Section>

      <Section aria-label="Method">
        <SectionHead><SectionLabel>Method</SectionLabel></SectionHead>
        <List>
          {steps.map((step, index) => (
            <Row key={step.id}>
              <Lead>{index + 1}</Lead>
              <StepBody>
                {step.title && (
                  <RowInput $strong value={step.title} onChange={e => updateStep(index, { title: e.target.value })}
                    placeholder="Step title" aria-label={`Step ${index + 1} title`} />
                )}
                <RowText rows={1} value={step.text} onChange={e => updateStep(index, { text: e.target.value })}
                  placeholder="What to do…" aria-label={`Step ${index + 1}`} />
              </StepBody>
              <RemoveBtn type="button" onClick={() => removeStep(index)} aria-label="Remove step">
                <Icon name="x" size={14} strokeWidth={2} />
              </RemoveBtn>
            </Row>
          ))}
        </List>
        <AddBox onSubmit={addStep}>
          <span aria-hidden="true">{steps.length + 1}</span>
          <AddInput value={newStep} onChange={e => setNewStep(e.target.value)}
            placeholder="Describe the next step" aria-label="Add a step" />
        </AddBox>
        {/* Legacy free-text method — shown only when it still has content */}
        {values.instructions?.trim() && (
          <RowText style={{ marginTop: 14 }} value={values.instructions}
            onChange={e => set({ instructions: e.target.value })} aria-label="Instructions (free text)" />
        )}
      </Section>

      <Section aria-label="Shopping lists">
        <SectionHead><SectionLabel>Shopping lists</SectionLabel></SectionHead>
        <Chips>
          {linkedShoppingListIds.map(id => {
            const sl = shoppingListOptions.find(s => s.id === id);
            return (
              <LinkedChip key={id}>
                <span>{sl?.title || `Shopping List #${id}`}</span>
                <button type="button" aria-label="Unlink"
                  onClick={() => set({ linkedShoppingListIds: linkedShoppingListIds.filter(x => x !== id) })}>
                  <Icon name="x" size={13} strokeWidth={2} />
                </button>
              </LinkedChip>
            );
          })}
          {availableToLink.length > 0 && (
            <LinkPill>
              <select value="" aria-label="Link a shopping list"
                onChange={e => { if (e.target.value) set({ linkedShoppingListIds: [...linkedShoppingListIds, Number(e.target.value)] }); }}>
                <option value="">+ Link a list</option>
                {availableToLink.map(sl => <option key={sl.id} value={sl.id}>{sl.title}</option>)}
              </select>
              <span aria-hidden="true"><Icon name="chevron-down" size={14} strokeWidth={2} /></span>
            </LinkPill>
          )}
          {linkedShoppingListIds.length === 0 && availableToLink.length === 0 && <Empty>No shopping lists to link yet.</Empty>}
        </Chips>
      </Section>
    </Wrapper>
  );
}
