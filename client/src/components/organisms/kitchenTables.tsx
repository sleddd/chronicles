import type { DecryptedPost } from '@shared/crypto/types';
import { PlanMuted } from '../molecules/PlanTable.js';
import type { EntryTableColumn } from './EntryTableList.js';
import type { ShoppingItem } from '../../types/fields.js';

/* The Kitchen's lists as tables (EntryTableList): a recipe's stats, a shopping list's item count */

const fieldsOf = (e: DecryptedPost) =>
  ((e.metadata as Record<string, unknown>)?._customFields as Record<string, unknown> | undefined) ?? {};

const none = <PlanMuted>—</PlanMuted>;

/** "15" → "15 min"; anything with its own unit ("1 hr") as typed */
function minutes(v: unknown) {
  const t = typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '';
  if (!t) return none;
  return /^\d+$/.test(t) ? `${t} min` : t;
}

function text(v: unknown) {
  const t = typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '';
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : none;
}

export const RECIPE_COLUMNS: EntryTableColumn[] = [
  { label: 'Prep', width: '90px', end: true, cell: e => minutes(fieldsOf(e).prepTime) },
  { label: 'Cook', width: '90px', end: true, cell: e => minutes(fieldsOf(e).cookTime) },
  { label: 'Serves', width: '80px', end: true, cell: e => text(fieldsOf(e).servings) },
  { label: 'Difficulty', width: '110px', end: true, cell: e => text(fieldsOf(e).difficulty) },
];

/** A recipe's one-line description, muted beside its name */
export const recipeNote = (e: DecryptedPost) => {
  const d = fieldsOf(e).description;
  return typeof d === 'string' && d.trim() ? d.trim() : undefined;
};

export function shoppingItems(e: DecryptedPost): ShoppingItem[] {
  const items = fieldsOf(e).items;
  return Array.isArray(items) ? (items as ShoppingItem[]) : [];
}

export const SHOPPING_COLUMNS: EntryTableColumn[] = [
  { label: 'Items', width: '80px', end: true, cell: e => String(shoppingItems(e).length) },
];
