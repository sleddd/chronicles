import styled from 'styled-components';
import { Icon } from '../../atoms/core/Icon.jsx';
import { TextInput } from '../../atoms/TextInput.js';
import { Select } from '../../atoms/Select.js';
import { Textarea } from '../../atoms/Textarea.js';
import { FormField } from '../FormField.js';
import type { RecipeFieldValues, RecipeIngredient, RecipeStep, RecipeCategory, RecipeDifficulty } from '../../../types/fields.js';
export type { RecipeFieldValues } from '../../../types/fields.js';

/* ── Styled components ── */

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 15px;
`;

/* Single column: paired fields join the form's column so every label lines up */
const Row = styled.div`
  display: contents;
`;

const SectionLabel = styled.div`
  font-family: var(--font-label);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: ${({ theme }) => theme.colors.textSecondary};
  padding-bottom: 8px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  margin: 16px 0 12px;
`;

const IngredientRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
`;

const AmountInput = styled(TextInput)`
  width: 90px;
  flex-shrink: 0;
`;

const IngredientName = styled(TextInput)`
  flex: 1;
  min-width: 0;
`;

const RemoveBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  background: none;
  border: none;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.textSecondary};
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
  &:hover { color: ${({ theme }) => theme.colors.danger}; background: ${({ theme }) => theme.colors.surfaceHover}; }
`;

const StepEditRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 0;
  & + & { border-top: 1px dashed var(--border-subtle, ${({ theme }) => theme.colors.border}); }
`;

const StepEditNum = styled.div`
  font-family: var(--font-display);
  font-weight: 300;
  font-size: 20px;
  line-height: 34px;
  color: var(--color-accent, ${({ theme }) => theme.colors.accent});
  flex-shrink: 0;
  min-width: 18px;
`;

const StepEditFields = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const AddBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 12px 0;
  padding: 6px 12px;
  font-family: var(--font-label);
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  background: none;
  border: 1px dashed ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  cursor: pointer;
  &:hover { color: ${({ theme }) => theme.colors.text}; border-color: ${({ theme }) => theme.colors.textSecondary}; }
`;

const LinkedList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
`;

const LinkedItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  font-size: 15px;
  background: ${({ theme }) => theme.colors.surfaceHover};
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
`;

const LinkedItemTitle = styled.span`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${({ theme }) => theme.colors.text};
`;

const UnlinkBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  background: none;
  border: none;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.textMuted};
  border-radius: 4px;
  &:hover { color: ${({ theme }) => theme.colors.danger}; }
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

  const updateIngredient = (index: number, patch: Partial<RecipeIngredient>) => {
    onChange({ ...values, ingredients: ingredients.map((ing, i) => i === index ? { ...ing, ...patch } : ing) });
  };

  const removeIngredient = (index: number) => {
    onChange({ ...values, ingredients: ingredients.filter((_, i) => i !== index) });
  };

  const addIngredient = () => {
    onChange({ ...values, ingredients: [...ingredients, { id: crypto.randomUUID(), amount: '', name: '' }] });
  };

  const updateStep = (index: number, patch: Partial<RecipeStep>) => {
    onChange({ ...values, steps: steps.map((s, i) => i === index ? { ...s, ...patch } : s) });
  };

  const removeStep = (index: number) => {
    onChange({ ...values, steps: steps.filter((_, i) => i !== index) });
  };

  const addStep = () => {
    onChange({ ...values, steps: [...steps, { id: crypto.randomUUID(), title: '', text: '' }] });
  };

  const linkShoppingList = (slId: number) => {
    if (!linkedShoppingListIds.includes(slId)) {
      onChange({ ...values, linkedShoppingListIds: [...linkedShoppingListIds, slId] });
    }
  };

  const unlinkShoppingList = (slId: number) => {
    onChange({ ...values, linkedShoppingListIds: linkedShoppingListIds.filter(id => id !== slId) });
  };

  const availableToLink = shoppingListOptions.filter(sl => !linkedShoppingListIds.includes(sl.id));

  return (
    <Wrapper>
      <FormField label="Recipe Name">
        <TextInput
          value={values.recipeName ?? ''}
          onChange={e => onChange({ ...values, recipeName: e.target.value })}
          placeholder="What is the recipe?"
        />
      </FormField>

      <FormField label="Description">
        <Textarea
          value={values.description ?? ''}
          onChange={e => onChange({ ...values, description: e.target.value })}
          placeholder="A short, appetizing one-liner…"
          style={{ minHeight: 56 }}
        />
      </FormField>

      <Row>
        <FormField label="Category">
          <Select
            value={values.category ?? ''}
            onChange={e => onChange({ ...values, category: e.target.value as RecipeCategory | '' })}
          >
            <option value="">—</option>
            <option value="breakfast">Breakfast</option>
            <option value="lunch">Lunch</option>
            <option value="dinner">Dinner</option>
            <option value="snack">Snack</option>
            <option value="dessert">Dessert</option>
          </Select>
        </FormField>
        <FormField label="Difficulty">
          <Select
            value={values.difficulty ?? ''}
            onChange={e => onChange({ ...values, difficulty: e.target.value as RecipeDifficulty | '' })}
          >
            <option value="">—</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </Select>
        </FormField>
        <FormField label="Cuisine">
          <TextInput
            value={values.cuisine}
            onChange={e => onChange({ ...values, cuisine: e.target.value })}
            placeholder="e.g. Italian"
          />
        </FormField>
      </Row>

      <Row>
        <FormField label="Servings">
          <TextInput
            type="number"
            min="1"
            value={values.servings}
            onChange={e => onChange({ ...values, servings: e.target.value })}
            placeholder="4"
          />
        </FormField>
        <FormField label="Prep (min)">
          <TextInput
            value={values.prepTime}
            onChange={e => onChange({ ...values, prepTime: e.target.value })}
            placeholder="10"
          />
        </FormField>
        <FormField label="Cook (min)">
          <TextInput
            value={values.cookTime}
            onChange={e => onChange({ ...values, cookTime: e.target.value })}
            placeholder="20"
          />
        </FormField>
        <FormField label="Calories (kcal)">
          <TextInput
            value={values.calories ?? ''}
            onChange={e => onChange({ ...values, calories: e.target.value })}
            placeholder="320"
          />
        </FormField>
      </Row>

      <div>
        <SectionLabel>Ingredients</SectionLabel>
        {ingredients.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '4px 0 8px' }}>No ingredients yet.</div>
        )}
        {ingredients.map((ing, index) => (
          <IngredientRow key={ing.id}>
            <AmountInput
              value={ing.amount}
              onChange={e => updateIngredient(index, { amount: e.target.value })}
              placeholder="Amount"
            />
            <IngredientName
              value={ing.name}
              onChange={e => updateIngredient(index, { name: e.target.value })}
              placeholder="Ingredient"
            />
            <RemoveBtn type="button" onClick={() => removeIngredient(index)} aria-label="Remove ingredient">
              <Icon name="x" size={14} strokeWidth={2} />
            </RemoveBtn>
          </IngredientRow>
        ))}
        <AddBtn type="button" onClick={addIngredient}>
          <Icon name="plus" size={12} strokeWidth={2} />
          Add Ingredient
        </AddBtn>
      </div>

      <div>
        <SectionLabel>Method</SectionLabel>
        {steps.map((step, index) => (
          <StepEditRow key={step.id}>
            <StepEditNum>{index + 1}</StepEditNum>
            <StepEditFields>
              <TextInput
                value={step.title}
                onChange={e => updateStep(index, { title: e.target.value })}
                placeholder="Step title (e.g. Toast the bread)"
              />
              <Textarea
                value={step.text}
                onChange={e => updateStep(index, { text: e.target.value })}
                placeholder="What to do…"
                style={{ minHeight: 52 }}
              />
            </StepEditFields>
            <RemoveBtn type="button" onClick={() => removeStep(index)} aria-label="Remove step">
              <Icon name="x" size={14} strokeWidth={2} />
            </RemoveBtn>
          </StepEditRow>
        ))}
        <AddBtn type="button" onClick={addStep}>
          <Icon name="plus" size={12} strokeWidth={2} />
          Add Step
        </AddBtn>
      </div>

      {/* Legacy free-text method — shown only when it still has content */}
      {values.instructions?.trim() && (
        <FormField label="Instructions (free text)">
          <Textarea
            value={values.instructions}
            onChange={e => onChange({ ...values, instructions: e.target.value })}
            placeholder="Step-by-step instructions..."
            style={{ minHeight: 100 }}
          />
        </FormField>
      )}

      <div>
        <SectionLabel>Linked Shopping Lists</SectionLabel>
        {availableToLink.length > 0 && (
          <Select
            value=""
            onChange={e => { if (e.target.value) linkShoppingList(parseInt(e.target.value)); }}
          >
            <option value="">Link a shopping list...</option>
            {availableToLink.map(sl => (
              <option key={sl.id} value={sl.id}>{sl.title}</option>
            ))}
          </Select>
        )}
        {linkedShoppingListIds.length > 0 && (
          <LinkedList>
            {linkedShoppingListIds.map(id => {
              const sl = shoppingListOptions.find(s => s.id === id);
              return (
                <LinkedItem key={id}>
                  <LinkedItemTitle>{sl?.title || `Shopping List #${id}`}</LinkedItemTitle>
                  <UnlinkBtn type="button" onClick={() => unlinkShoppingList(id)} aria-label="Unlink">
                    <Icon name="x" size={12} strokeWidth={2} />
                  </UnlinkBtn>
                </LinkedItem>
              );
            })}
          </LinkedList>
        )}
        {linkedShoppingListIds.length === 0 && availableToLink.length === 0 && (
          <div style={{ fontSize: 13, fontStyle: 'italic', color: 'inherit', opacity: 0.5, padding: '4px 0' }}>
            No shopping lists available to link.
          </div>
        )}
      </div>
    </Wrapper>
  );
}
