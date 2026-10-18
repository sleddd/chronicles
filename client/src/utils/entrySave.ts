import { autoCaloriesOnSave } from '../services/aiAssistant.js';
import { stripHtml, summarizeUserFields } from './stripHtml.js';
import { defaultShoppingListTitle } from './kitchen.js';
import type { UserFieldDef } from '../types/userFields.js';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** A Priorities list's title: "Priorities: 10/18/2026" (the list's date) */
export function prioritiesTitle(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `Priorities: ${pad(date.getMonth() + 1)}/${pad(date.getDate())}/${date.getFullYear()}`;
}

/** Whether an editor state has anything worth saving */
export function hasEntryData(content: string, customFields: Record<string, unknown>, userFieldDefs: UserFieldDef[], imageCount = 0): boolean {
  const userFieldValues = (customFields._userFields as Record<string, unknown>) ?? {};
  return !!stripHtml(content).trim()
    || content.includes('data-type="drawing"')
    || (userFieldDefs.length > 0 && summarizeUserFields(userFieldDefs, userFieldValues) !== '')
    || Object.keys(customFields).length > 0
    || imageCount > 0;
}

/**
 * The text and fields an entry is saved with — shared by the journal editor
 * and the dashboard's Quick entry so both save the same way:
 * - a shopping list with no title gets a dated one
 * - a Priorities list with no text gets "Priorities: mm/dd/yyyy"
 * - a fields-only entry gets its field summary as the text
 * - Meals / Exercise get blank (or stale AI) calories estimated; a failed
 *   estimate never blocks the save
 */
export async function prepareEntryForSave(
  content: string,
  customFields: Record<string, unknown>,
  topicName: string | undefined,
  userFieldDefs: UserFieldDef[],
): Promise<{ content: string; customFields: Record<string, unknown> }> {
  const hasText = !!stripHtml(content).trim() || content.includes('data-type="drawing"');
  const userFieldValues = (customFields._userFields as Record<string, unknown>) ?? {};
  const fieldSummary = userFieldDefs.length > 0 ? summarizeUserFields(userFieldDefs, userFieldValues) : '';
  let finalContent = content;
  if (!hasText && topicName === 'shopping list') finalContent = `<p>${defaultShoppingListTitle()}</p>`;
  else if (!hasText && topicName === 'priorities') finalContent = `<p>${prioritiesTitle()}</p>`;
  else if (!hasText && fieldSummary) finalContent = `<p>${escapeHtml(fieldSummary)}</p>`;

  let fields = customFields;
  const calorieKind = topicName === 'meals' ? 'food' : topicName === 'exercise' ? 'exercise' : null;
  if (calorieKind) {
    const estimated = await autoCaloriesOnSave(calorieKind, stripHtml(finalContent), customFields).catch(() => null);
    if (estimated) fields = estimated;
  }
  return { content: finalContent, customFields: fields };
}
