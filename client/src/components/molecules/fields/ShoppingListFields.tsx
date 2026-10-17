import { useMemo, useState } from 'react';
import styled from 'styled-components';
import { Icon } from '../../atoms/core/Icon.jsx';
import { RecipeAutocomplete } from '../RecipeAutocomplete.js';
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

/* Journal editor fields for a shopping list: Items (round tick-off circles,
   an editable name, a category pill and ×; an outlined "+ Add an item" box),
   Notes (an outlined box) and Recipes (accent chips + "Link a recipe").
   Sentence-case section labels. Colours are the card-mockup tokens. */

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
`;

/* Space between Items, Notes and Recipes — margins, since the journal editor
   zeroes gaps on its field wrappers */
const Section = styled.section`
  display: flex;
  flex-direction: column;
  & + & { margin-top: 44px; }
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
  font-weight: 400;
  color: var(--text-soft);
`;

const Count = styled.span`
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-muted);
`;

const Items = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const ItemRow = styled.li`
  display: flex;
  align-items: center;
  gap: 14px;
`;

const Tick = styled.button<{ $done: boolean }>`
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border-radius: 50%;
  border: 1.5px solid ${({ $done }) => ($done ? 'var(--color-accent)' : 'var(--control-border)')};
  background: transparent;
  color: var(--color-accent);
  cursor: pointer;
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

/* The item's name, edited in place — no box */
const NameInput = styled.input<{ $done: boolean }>`
  && {
    flex: 1;
    min-width: 0;
    padding: 2px 0;
    border: none !important;
    background: transparent !important;
    outline: none;
    font-family: var(--font-sans);
    font-size: 17px;
    color: ${({ $done }) => ($done ? 'var(--text-muted)' : 'var(--text-secondary)')};
    text-decoration: ${({ $done }) => ($done ? 'line-through' : 'none')};
  }
  &::placeholder { color: var(--text-placeholder); }
`;

/* Category as a small outlined pill with a chevron */
const CategoryPill = styled.label`
  position: relative;
  flex: none;
  display: inline-flex;
  align-items: center;
  height: 28px;
  border: 1px solid var(--border-card);
  border-radius: 999px;
  color: var(--text-muted);
  &:focus-within { border-color: var(--color-accent); }
  select {
    height: 100%;
    padding: 0 30px 0 12px;
    border: none;
    background: transparent;
    appearance: none;
    font-family: var(--font-sans);
    font-size: 14px;
    color: var(--text-soft);
    cursor: pointer;
    outline: none;
  }
  option { color: var(--text-primary); background: var(--bg-surface); }
  & > span { position: absolute; right: 10px; pointer-events: none; display: inline-flex; }
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

/* Outlined "+ Add an item" box — Enter adds */
const AddBox = styled.form`
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 22px;
  height: 46px;
  padding: 0 16px;
  border: 1px solid var(--border-card);
  border-radius: var(--r-lg, 6px);
  color: var(--text-muted);
  &:focus-within { border-color: var(--color-accent); }
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
    font-size: 16px;
    color: var(--text-secondary);
  }
  &::placeholder { color: var(--text-placeholder); }
`;

const NotesBox = styled.textarea`
  && {
    width: 100%;
    min-height: 112px;
    padding: 14px 16px;
    border: 1px solid var(--border-card) !important;
    border-radius: 8px;
    background: transparent !important;
    font-family: var(--font-sans);
    font-size: 16px;
    line-height: 1.5;
    color: var(--text-secondary);
    resize: vertical;
    outline: none;
  }
  &&:focus { border-color: var(--color-accent) !important; }
  &::placeholder { color: var(--text-placeholder); }
`;

const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
`;

/* A linked recipe: an accent-tinted chip with its name and × */
const Chip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  height: 34px;
  padding: 0 10px 0 14px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-accent) 11%, var(--bg-app));
  font-family: var(--font-sans);
  font-size: 16px;
  color: var(--color-accent-soft);
  max-width: 100%;
`;

const ChipName = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ChipX = styled.button`
  display: inline-flex;
  padding: 0;
  border: none;
  background: none;
  color: color-mix(in srgb, var(--color-accent) 60%, var(--bg-app));
  cursor: pointer;
  &:hover { color: var(--color-accent-soft); }
`;

const LinkBtn = styled.button`
  padding: 0;
  border: none;
  background: none;
  font-family: var(--font-sans);
  font-size: 16px;
  color: var(--text-placeholder);
  cursor: pointer;
  &:hover { color: var(--text-soft); }
`;

const Empty = styled.p`
  margin: 0;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-muted);
`;

interface ShoppingListFieldsProps {
  values: ShoppingListFieldValues;
  onChange: (values: ShoppingListFieldValues) => void;
  recipeOptions?: { id: number; title: string }[];
}

export function ShoppingListFields({ values, onChange, recipeOptions = [] }: ShoppingListFieldsProps) {
  const items = values.items || [];
  const linkedRecipeIds = values.linkedRecipeIds || [];
  const [draft, setDraft] = useState('');
  const [linking, setLinking] = useState(false);
  const left = items.filter(i => !i.checked).length;
  const unlinked = recipeOptions.filter(r => !linkedRecipeIds.includes(r.id));

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

  const addItem = (e: React.FormEvent) => {
    e.preventDefault();
    const name = draft.trim();
    if (!name) return;
    setDraft('');
    onChange({ ...values, items: [...items, { id: crypto.randomUUID(), name, category: 'other', checked: false }] });
  };

  return (
    <Wrapper>
      <Section aria-label="Items">
        <SectionHead>
          <SectionLabel>Items</SectionLabel>
          {items.length > 0 && <Count>{left} of {items.length} left to get</Count>}
        </SectionHead>
        {items.length === 0 && <Empty>No items yet. Add your first item below.</Empty>}
        <Items>
          {ordered.map(({ item, index }) => (
            <ItemRow key={item.id}>
              <Tick type="button" $done={item.checked} aria-pressed={item.checked}
                aria-label={item.checked ? `Mark ${item.name || 'item'} as still needed` : `Tick off ${item.name || 'item'}`}
                onClick={() => updateItem(index, { checked: !item.checked })}>
                {item.checked && <Icon name="check" size={11} strokeWidth={3} />}
              </Tick>
              <NameInput
                $done={item.checked}
                value={item.name}
                onChange={e => updateItem(index, { name: e.target.value })}
                placeholder="Item"
                aria-label="Item name"
              />
              <CategoryPill>
                <select
                  value={item.category}
                  onChange={e => updateItem(index, { category: e.target.value as ShoppingCategory })}
                  aria-label="Category"
                >
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
                <span aria-hidden="true"><Icon name="chevron-down" size={14} strokeWidth={2} /></span>
              </CategoryPill>
              <RemoveBtn type="button" onClick={() => removeItem(index)} aria-label="Remove item">
                <Icon name="x" size={14} strokeWidth={2} />
              </RemoveBtn>
            </ItemRow>
          ))}
        </Items>
        <AddBox onSubmit={addItem}>
          <Icon name="plus" size={18} strokeWidth={1.8} aria-hidden="true" />
          <AddInput value={draft} onChange={e => setDraft(e.target.value)} placeholder="Add an item" aria-label="Add an item" />
        </AddBox>
      </Section>

      <Section>
        <SectionHead><SectionLabel as="label" htmlFor="shopping-notes">Notes</SectionLabel></SectionHead>
        <NotesBox
          id="shopping-notes"
          value={values.notes || ''}
          onChange={e => onChange({ ...values, notes: e.target.value })}
          placeholder="General notes for this shopping list"
        />
      </Section>

      <Section aria-label="Recipes">
        <SectionHead><SectionLabel>Recipes</SectionLabel></SectionHead>
        <Chips>
          {linkedRecipeIds.map(id => {
            const recipe = recipeOptions.find(r => r.id === id);
            return (
              <Chip key={id}>
                <ChipName>{recipe?.title || `Recipe #${id}`}</ChipName>
                <ChipX
                  type="button"
                  onClick={() => onChange({ ...values, linkedRecipeIds: linkedRecipeIds.filter(rid => rid !== id) })}
                  aria-label="Unlink recipe"
                >
                  <Icon name="x" size={13} strokeWidth={2} />
                </ChipX>
              </Chip>
            );
          })}
          {unlinked.length > 0 && (linking ? (
            <RecipeAutocomplete
              size="md"
              recipes={unlinked}
              placeholder="Link a recipe…"
              onSelect={id => {
                setLinking(false);
                if (!linkedRecipeIds.includes(id)) onChange({ ...values, linkedRecipeIds: [...linkedRecipeIds, id] });
              }}
            />
          ) : (
            <LinkBtn type="button" onClick={() => setLinking(true)}>+ Link a recipe</LinkBtn>
          ))}
          {linkedRecipeIds.length === 0 && unlinked.length === 0 && <Empty>No recipes yet.</Empty>}
        </Chips>
      </Section>
    </Wrapper>
  );
}
