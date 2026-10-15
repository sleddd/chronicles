import { useMemo } from 'react';
import styled from 'styled-components';
import { Icon } from '../../../../../design-system/components/core/Icon.jsx';
import { TextInput } from '../../atoms/TextInput.js';
import { Select } from '../../atoms/Select.js';
import { Checkbox } from '../../atoms/Checkbox.js';
import { Textarea } from '../../atoms/Textarea.js';
import { FormField } from '../FormField.js';
import { RecipeAutocomplete } from '../RecipeAutocomplete.js';
import { PillButton } from '../../atoms/PillButton.js';
import type { ShoppingListFieldValues, ShoppingItem, ShoppingCategory } from '../../../types/fields.js';
export type { ShoppingListFieldValues } from '../../../types/fields.js';

const CATEGORIES: { value: ShoppingCategory; label: string }[] = [
  { value: 'produce',      label: 'Produce' },
  { value: 'meat',         label: 'Meat' },
  { value: 'dairy',        label: 'Dairy' },
  { value: 'bakery',       label: 'Bakery' },
  { value: 'frozen',       label: 'Frozen' },
  { value: 'beverages',    label: 'Beverages' },
  { value: 'sundries',     label: 'Sundries' },
  { value: 'personal_care',label: 'Personal Care' },
  { value: 'household',    label: 'Household' },
  { value: 'other',        label: 'Other' },
];

const CATEGORY_ORDER = CATEGORIES.map(c => c.value);

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0;
`;

const ItemRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
`;

const NameInput = styled(TextInput)`
  flex: 1;
  min-width: 0;
`;

const CategorySelect = styled(Select)`
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

/* Standard pill action, left-aligned under the list */
const AddRow = styled.div`
  margin-top: 16px;
`;

const NotesSection = styled.div`
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
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

const Empty = styled.p`
  font-size: 15px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;
  padding: 8px 0;
`;

interface ShoppingListFieldsProps {
  values: ShoppingListFieldValues;
  onChange: (values: ShoppingListFieldValues) => void;
  recipeOptions?: { id: number; title: string }[];
}

export function ShoppingListFields({ values, onChange, recipeOptions = [] }: ShoppingListFieldsProps) {
  const items = values.items || [];
  const linkedRecipeIds = values.linkedRecipeIds || [];

  // One flat list, still sorted by category so items cluster by aisle — no headers
  const ordered = useMemo(() => (
    items
      .map((item, index) => ({ item, index }))
      .sort((a, b) =>
        CATEGORY_ORDER.indexOf(a.item.category) - CATEGORY_ORDER.indexOf(b.item.category) || a.index - b.index)
  ), [items]);

  const updateItem = (index: number, patch: Partial<ShoppingItem>) => {
    onChange({ ...values, items: items.map((item, i) => i === index ? { ...item, ...patch } : item) });
  };

  const removeItem = (index: number) => {
    onChange({ ...values, items: items.filter((_, i) => i !== index) });
  };

  const addItem = () => {
    const newItem: ShoppingItem = {
      id: crypto.randomUUID(),
      name: '',
      category: 'other',
      checked: false,
    };
    onChange({ ...values, items: [...items, newItem] });
  };

  return (
    <Wrapper>
      {items.length === 0 && <Empty>No items yet. Add your first item below.</Empty>}
      {ordered.map(({ item, index }) => (
        <ItemRow key={item.id}>
          <Checkbox
            checked={item.checked}
            onChange={v => updateItem(index, { checked: v })}
          />
          <NameInput
            value={item.name}
            onChange={e => updateItem(index, { name: e.target.value })}
            placeholder="Item"
          />
          <CategorySelect
            value={item.category}
            onChange={e => updateItem(index, { category: e.target.value as ShoppingCategory })}
          >
            {CATEGORIES.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </CategorySelect>
          <RemoveBtn type="button" onClick={() => removeItem(index)} aria-label="Remove item">
            <Icon name="x" size={14} strokeWidth={2} />
          </RemoveBtn>
        </ItemRow>
      ))}
      <AddRow>
        <PillButton type="button" onClick={addItem}>
          <Icon name="plus" size={12} strokeWidth={2} />
          Add item
        </PillButton>
      </AddRow>
      <NotesSection>
        <FormField label="Notes">
          <Textarea
            value={values.notes || ''}
            onChange={e => onChange({ ...values, notes: e.target.value })}
            placeholder="General notes for this shopping list"
            style={{ minHeight: 60 }}
          />
        </FormField>
      </NotesSection>

      <FormField label="Recipes">
        <div>
          {recipeOptions.filter(r => !linkedRecipeIds.includes(r.id)).length > 0 && (
            <RecipeAutocomplete
              size="md"
              recipes={recipeOptions.filter(r => !linkedRecipeIds.includes(r.id))}
              placeholder="Link a recipe…"
              onSelect={id => {
                if (!linkedRecipeIds.includes(id)) {
                  onChange({ ...values, linkedRecipeIds: [...linkedRecipeIds, id] });
                }
              }}
            />
          )}
          {linkedRecipeIds.length > 0 && (
            <LinkedList>
              {linkedRecipeIds.map(id => {
                const recipe = recipeOptions.find(r => r.id === id);
                return (
                  <LinkedItem key={id}>
                    <LinkedItemTitle>{recipe?.title || `Recipe #${id}`}</LinkedItemTitle>
                    <UnlinkBtn
                      type="button"
                      onClick={() => onChange({ ...values, linkedRecipeIds: linkedRecipeIds.filter(rid => rid !== id) })}
                      aria-label="Unlink recipe"
                    >
                      <Icon name="x" size={12} strokeWidth={2} />
                    </UnlinkBtn>
                  </LinkedItem>
                );
              })}
            </LinkedList>
          )}
        </div>
      </FormField>
    </Wrapper>
  );
}
