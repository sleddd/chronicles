import { useState, useMemo, useCallback, useEffect, useRef, Fragment } from 'react';
import styled from 'styled-components';
import { Icon } from '../components/atoms/core/Icon.jsx';
import { PillButton } from '../components/atoms/PillButton.js';
import { MaterialIcon } from '../components/atoms/MaterialIcon.js';
import { useOpenInJournal, useNewEntryInJournal } from '../hooks/useOpenInJournal.js';
import { ContentTemplate } from '../components/templates/ContentTemplate.js';
import { EmptyState } from '../components/atoms/EmptyState.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { KITCHEN_TITLE, MealsTabBar } from '../components/molecules/MealsTabBar.js';
import { RecipeAutocomplete } from '../components/molecules/RecipeAutocomplete.js';
import { UnlockDialog } from '../components/organisms/UnlockDialog.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { useEncryption } from '../contexts/EncryptionContext.js';
import { useInitializeData } from '../hooks/useInitializeData.js';
import { entries as entriesApi } from '../services/api.js';
import { stripHtml } from '../utils/stripHtml.js';
import { useNavigate } from 'react-router-dom';
import type { MenuPlanDay, MenuMealSlot, MealSlotType, RecipeIngredient, ShoppingItem } from '../types/fields.js';

/* ── Helpers ── */

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtShort(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtDay(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

/** "Oct 12 – 18", or "Oct 30 – Nov 5" across a month end */
function fmtWeek(start: Date): string {
  const end = addDays(start, 6);
  return start.getMonth() === end.getMonth()
    ? `${fmtShort(start)} – ${end.getDate()}`
    : `${fmtShort(start)} – ${fmtShort(end)}`;
}

const MEAL_SLOTS: { key: MealSlotType; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch',     label: 'Lunch' },
  { key: 'dinner',    label: 'Dinner' },
  { key: 'snack',     label: 'Snack' },
];

const emptySlot = (): MenuMealSlot => ({ mealName: '', recipeId: null, recipeName: '' });
const emptyDay  = (): MenuPlanDay  => ({ breakfast: emptySlot(), lunch: emptySlot(), dinner: emptySlot(), snack: emptySlot() });

const todayStr = toDateStr(new Date());

/* ── Layout (mirrors HealthView) ── */

const Page = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
`;

const Inner = styled.div`
  width: 100%;
  max-width: 1150px;
  margin: 0 auto;
  padding: 0 24px;
  @media (max-width: 768px) { padding: 0 16px; }
`;

const Head = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding: 53px 0 28px; /* room under the title before the tabs */
  flex-wrap: wrap;
`;

const Title = styled.h1`
  font-family: var(--font-display);
  font-size: 44px;
  font-weight: 200;
  line-height: 1;
  color: var(--text-primary);
  margin: 0;
  @media (max-width: 480px) { font-size: 34px; }
`;

const HeadActions = styled.div`
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
`;

/* ‹ Oct 12 – 18 › in an outlined pill */
const WeekNav = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  height: 46px;
  padding: 0 10px;
  border: 1px solid var(--border-card);
  border-radius: 999px;
`;

const WeekLabel = styled.span`
  font-family: var(--font-sans);
  font-size: 16px;
  font-weight: 500;
  color: var(--text-secondary);
  min-width: 120px;
  text-align: center;
  white-space: nowrap;
`;

const NavBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: none;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  color: var(--text-soft);
  &:hover { color: var(--text-primary); }
`;

const Divider = styled.span`
  width: 1px;
  height: 34px;
  background: var(--border-card);
  @media (max-width: 768px) { display: none; }
`;

/* Quiet sentence-case text actions ("New recipe", "Make shopping list") */
const TextBtn = styled.button`
  padding: 0;
  border: none;
  background: none;
  font-family: var(--font-sans);
  font-size: 16px;
  font-weight: 400;
  color: var(--text-soft);
  white-space: nowrap;
  cursor: pointer;
  &:hover:not(:disabled) { color: var(--text-primary); }
  &:disabled { opacity: 0.5; cursor: default; }
`;

const TabsRow = styled.div`
  margin: 0;
`;

const StatusMsg = styled.div`
  font-size: 13px;
  color: var(--text-secondary);
  padding: 8px 0;
`;

/* ── Desktop grid: meal slots down the side, days across; no cell rules ── */

const ScrollArea = styled.div`
  overflow: auto;
  padding: 28px 24px 48px;
  /* Wide enough for the whole week: no scroll box, so the recipe menu can
     float past the bottom row instead of being clipped */
  @media (min-width: 1400px) { overflow: visible; }
  @media (max-width: 640px) { display: none; }
`;

const PlannerGrid = styled.div`
  display: grid;
  grid-template-columns: 130px repeat(7, minmax(150px, 1fr));
  column-gap: 12px;
  row-gap: 14px;
  min-width: 1190px;
`;

const CornerCell = styled.div``;

/* "Mon 12" over a 2px rule; today's in the soft accent over an accent rule */
const HeaderCell = styled.div<{ $isToday?: boolean }>`
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 0 18px 14px;
  border-bottom: 2px solid ${({ $isToday }) => ($isToday ? 'var(--color-accent)' : 'var(--border-subtle)')};
`;

const DayName = styled.span<{ $isToday?: boolean }>`
  font-family: var(--font-sans);
  font-size: 17px;
  font-weight: 400;
  color: ${({ $isToday }) => ($isToday ? 'var(--color-accent-soft)' : 'var(--text-secondary)')};
`;

const DayDate = styled.span<{ $isToday?: boolean }>`
  font-family: var(--font-sans);
  font-size: 17px;
  font-weight: 400;
  color: var(--text-muted);
`;

const MealLabelCell = styled.div`
  padding-top: 22px;
  font-family: var(--font-sans);
  font-size: 17px;
  font-weight: 400;
  color: var(--text-muted);
`;

/* A day's slot. Today's column sits on a faint band. */
const MealCell = styled.div<{ $isToday?: boolean }>`
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 176px;
  padding: 6px;
  border-radius: 10px;
  background: ${({ $isToday }) => ($isToday ? 'var(--bg-today-col)' : 'transparent')};
`;

/* Empty slot: just a quiet + to add a meal */
const AddSlotBtn = styled.button`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 120px;
  border: 1.5px dashed transparent;
  border-radius: 10px;
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;
  transition: color 120ms, border-color 120ms;
  /* Hover: a dashed outline (no fill) and a brighter + */
  &:hover { color: var(--text-soft); border-color: var(--border-dashed); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: -2px; }
`;

/* A planned meal: a filled tile with its name, a × to clear it, and the recipe link */
const MealTile = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 20px;
  border-radius: 8px;
  background: var(--bg-tile);
`;

const TileTop = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 8px;
`;

const MealTitle = styled.button`
  flex: 1;
  min-width: 0;
  padding: 0;
  border: none;
  background: none;
  text-align: left;
  font-family: var(--font-sans);
  font-size: 17px;
  font-weight: 400;
  line-height: 1.4;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
  cursor: text;
`;

const MealPlaceholder = styled(MealTitle)`
  color: var(--text-placeholder);
  font-style: italic;
`;

const MealInput = styled.textarea`
  flex: 1;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  font-family: var(--font-sans);
  font-size: 17px;
  font-weight: 400;
  line-height: 1.4;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  resize: none;
  overflow: hidden;
  min-height: 24px;
  field-sizing: content;
  &::placeholder { color: var(--text-placeholder); font-style: italic; }
  &:focus { outline: none; }
`;

const RemoveBtn = styled.button`
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin: 1px -4px 0 0;
  padding: 0;
  border: none;
  background: none;
  color: var(--control-border);
  cursor: pointer;
  &:hover { color: var(--text-primary); }
`;

/* "🔗 Recipe" — opens the linked recipe, or links one */
const RecipeLink = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  align-self: flex-start;
  margin-top: auto;
  padding: 0;
  border: none;
  background: none;
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: 400;
  color: var(--color-accent-link);
  cursor: pointer;
  &:hover { text-decoration: underline; }
`;

const RecipePicker = styled.div`
  margin-top: auto;
`;

/* ── Mobile: one card per day ── */

const MobileArea = styled.div`
  display: none;
  flex-direction: column;
  gap: 18px;
  padding: 20px 0 40px;
  @media (max-width: 640px) { display: flex; }
`;

const DayCard = styled.div``;

const DayCardHeader = styled.div<{ $isToday?: boolean }>`
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 0 4px 10px;
  margin-bottom: 10px;
  border-bottom: 2px solid ${({ $isToday }) => ($isToday ? 'var(--color-accent)' : 'var(--border-subtle)')};
`;

const MobileSlotRow = styled.div`
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  padding: 4px 0;
`;

const MobileSlotLabel = styled.div`
  padding-top: 16px;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-muted);
`;

const MobileSlotInputs = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
  & ${AddSlotBtn} { min-height: 52px; justify-content: flex-start; padding-left: 14px; }
`;

/* ── Component ── */

export function MenuView() {
  const { isReady, isLoading, needsUnlock, handleUnlock } = useInitializeData();
  const entries              = useEntriesStore(s => s.decryptedEntries);
  const allTopics            = useEntriesStore(s => s.allTopics);
  const addDecryptedEntry    = useEntriesStore(s => s.addDecryptedEntry);
  const updateDecryptedEntry = useEntriesStore(s => s.updateDecryptedEntry);
  const { encryptPost } = useEncryption();
  const navigate = useNavigate();

  const [weekStart, setWeekStart]   = useState(() => getMonday(new Date()));
  const [meals, setMeals]           = useState<Record<string, MenuPlanDay>>({});
  const [isSaving, setIsSaving]     = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMsg, setStatusMsg]   = useState('');
  const [editingCell, setEditingCell] = useState<string | null>(null);
  // The slot whose recipe picker is open
  const [linkingCell, setLinkingCell] = useState<string | null>(null);
  // The empty slot opened from its + (meal box with recipe suggestions)
  const [pickingCell, setPickingCell] = useState<string | null>(null);
  const openInJournal = useOpenInJournal();
  const newEntry = useNewEntryInJournal();

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekStartStr = toDateStr(weekStart);

  const menuPlanTopicId     = useMemo(() => allTopics.find(t => t.name.toLowerCase() === 'menu plan')?.id,    [allTopics]);
  // Recipes live under "Recipes" or the older "Recipe" topic (accounts can
  // have both) — read both, like the Recipes tab, so none go missing
  const recipeTopicIds      = useMemo(() => new Set(
    allTopics.filter(t => ['recipes', 'recipe'].includes(t.name.toLowerCase())).map(t => t.id)
  ), [allTopics]);
  const shoppingListTopicId = useMemo(() => allTopics.find(t => t.name.toLowerCase() === 'shopping list')?.id, [allTopics]);

  const menuPlanEntry = useMemo(() => {
    if (!menuPlanTopicId) return undefined;
    return entries.find(e => {
      const meta = e.metadata as Record<string, unknown>;
      const cf   = meta?._customFields as Record<string, unknown> | undefined;
      return meta?._taxonomyId === menuPlanTopicId && cf?.weekStart === weekStartStr;
    });
  }, [entries, menuPlanTopicId, weekStartStr]);

  const recipes = useMemo(() => {
    if (recipeTopicIds.size === 0) return [];
    return entries
      .filter(e => recipeTopicIds.has((e.metadata as Record<string, unknown>)?._taxonomyId as number))
      .map(e => {
        const cf = (e.metadata as Record<string, unknown>)?._customFields as Record<string, unknown> | undefined;
        const name = typeof cf?.recipeName === 'string' ? cf.recipeName.trim() : '';
        return { id: e.id, title: name || stripHtml(e.content).slice(0, 60) || `Recipe #${e.id}` };
      });
  }, [entries, recipeTopicIds]);

  // Id of a week entry this page just created — loading it back would wipe
  // anything typed while that first save was in flight
  const createdEntryIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (menuPlanEntry && menuPlanEntry.id === createdEntryIdRef.current) return;
    if (menuPlanEntry) {
      const cf = (menuPlanEntry.metadata as Record<string, unknown>)?._customFields as Record<string, unknown>;
      setMeals((cf?.days as Record<string, MenuPlanDay>) || {});
    } else {
      setMeals({});
    }
  }, [menuPlanEntry?.id, weekStartStr]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Autosave: edits schedule a save (short after a recipe pick, longer while
     typing a meal name). Saves run one at a time so the first save of a new
     week can't create the menu entry twice. */
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const handleSaveRef = useRef<() => Promise<void>>(async () => {});
  const runSave = useCallback(() => {
    // Bind now: a flush before a week switch must save the week being left
    const save = handleSaveRef.current;
    saveChainRef.current = saveChainRef.current.then(save);
  }, []);
  const scheduleSave = useCallback((delayMs: number) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { saveTimerRef.current = null; runSave(); }, delayMs);
  }, [runSave]);
  /** Save a pending edit right away (before switching weeks or leaving). */
  const flushSave = useCallback(() => {
    if (!saveTimerRef.current) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    runSave();
  }, [runSave]);
  useEffect(() => () => flushSave(), [flushSave]);

  const updateSlot = useCallback((dateStr: string, slot: MealSlotType, patch: Partial<MenuMealSlot>) => {
    scheduleSave(1000);
    setMeals(prev => ({
      ...prev,
      [dateStr]: {
        ...(prev[dateStr] || emptyDay()),
        [slot]: { ...(prev[dateStr]?.[slot] || emptySlot()), ...patch },
      },
    }));
  }, [scheduleSave]);

  const handleMealNameChange = useCallback((dateStr: string, slot: MealSlotType, mealName: string) => {
    updateSlot(dateStr, slot, { mealName });
  }, [updateSlot]);

  const handleRecipeChange = useCallback((dateStr: string, slot: MealSlotType, recipeId: number | null) => {
    const recipe = recipeId ? recipes.find(r => r.id === recipeId) : null;
    scheduleSave(150);
    setMeals(prev => {
      const existing = prev[dateStr]?.[slot] || emptySlot();
      // Clearing the link empties the whole slot, including the meal name.
      const next: MenuMealSlot = recipeId === null
        ? emptySlot()
        : {
            ...existing,
            recipeId,
            recipeName: recipe?.title || '',
            mealName: existing.mealName || recipe?.title || '',
          };
      return {
        ...prev,
        [dateStr]: {
          ...(prev[dateStr] || emptyDay()),
          [slot]: next,
        },
      };
    });
  }, [recipes, scheduleSave]);

  const handleSave = useCallback(async () => {
    if (!menuPlanTopicId) return;
    setIsSaving(true);
    setStatusMsg('');
    try {
      const weekEnd  = addDays(weekStart, 6);
      const content  = `<p>Menu: ${fmtShort(weekStart)} – ${fmtShort(weekEnd)}</p>`;
      const customFields = { weekStart: weekStartStr, days: meals };
      const metadata: Record<string, unknown> = { _taxonomyId: menuPlanTopicId, _customFields: customFields };

      // Read the week's entry from the store, not the render closure — an
      // autosave queued behind the first save must update the entry it created
      const menuPlanEntry = useEntriesStore.getState().decryptedEntries.find(e => {
        const meta = e.metadata as Record<string, unknown>;
        const cf   = meta?._customFields as Record<string, unknown> | undefined;
        return meta?._taxonomyId === menuPlanTopicId && cf?.weekStart === weekStartStr;
      });

      if (menuPlanEntry) {
        updateDecryptedEntry(menuPlanEntry.id, { metadata });
        const encrypted = await encryptPost(content, metadata);
        await entriesApi.update(menuPlanEntry.id, {
          contentEncrypted: encrypted.contentEncrypted, contentIv: encrypted.contentIv,
          metadataEncrypted: encrypted.metadataEncrypted, metadataIv: encrypted.metadataIv,
          taxonomyIds: [menuPlanTopicId],
        });
      } else {
        const encrypted = await encryptPost(content, metadata);
        const result = await entriesApi.create({
          contentEncrypted: encrypted.contentEncrypted, contentIv: encrypted.contentIv,
          metadataEncrypted: encrypted.metadataEncrypted, metadataIv: encrypted.metadataIv,
          isEncrypted: true, taxonomyIds: [menuPlanTopicId],
        });
        createdEntryIdRef.current = result.id as number;
        addDecryptedEntry({
          id: result.id as number, content, metadata, isEncrypted: true,
          createdAt: new Date(result.createdAt as string),
          updatedAt: new Date((result.updatedAt || result.createdAt) as string),
        });
      }
      setStatusMsg('Menu saved.');
    } catch (err) {
      console.error('Failed to save menu plan:', err);
      setStatusMsg('Save failed.');
    } finally {
      setIsSaving(false);
    }
  }, [menuPlanTopicId, weekStart, weekStartStr, meals, encryptPost, updateDecryptedEntry, addDecryptedEntry]);
  handleSaveRef.current = handleSave;

  const handleGenerateShoppingList = useCallback(async () => {
    if (!shoppingListTopicId) return;
    setIsGenerating(true);
    setStatusMsg('');
    try {
      const recipeIds = new Set<number>();
      Object.values(meals).forEach(day =>
        MEAL_SLOTS.forEach(({ key }) => {
          const slot = day[key];
          if (slot?.recipeId) recipeIds.add(slot.recipeId);
        })
      );

      const items: ShoppingItem[] = [];
      const linkedRecipeIds: number[] = [];

      recipeIds.forEach(recipeId => {
        const recipeEntry = entries.find(e => e.id === recipeId);
        if (!recipeEntry) return;
        linkedRecipeIds.push(recipeId);
        const cf = (recipeEntry.metadata as Record<string, unknown>)?._customFields as Record<string, unknown> | undefined;
        const ingredients = (cf?.ingredients as RecipeIngredient[]) || [];
        ingredients.forEach(ing => {
          items.push({
            id: crypto.randomUUID(),
            name: [ing.amount, ing.name].filter(Boolean).join(' '),
            category: 'other',
            checked: false,
          });
        });
      });

      const weekEnd = addDays(weekStart, 6);
      const content = `<p>Shopping List: ${fmtShort(weekStart)} – ${fmtShort(weekEnd)}</p>`;
      const customFields = { items, notes: '', linkedRecipeIds };
      const metadata: Record<string, unknown> = { _taxonomyId: shoppingListTopicId, _customFields: customFields };
      const encrypted = await encryptPost(content, metadata);
      const result = await entriesApi.create({
        contentEncrypted: encrypted.contentEncrypted, contentIv: encrypted.contentIv,
        metadataEncrypted: encrypted.metadataEncrypted, metadataIv: encrypted.metadataIv,
        isEncrypted: true, taxonomyIds: [shoppingListTopicId],
      });
      addDecryptedEntry({
        id: result.id as number, content, metadata, isEncrypted: true,
        createdAt: new Date(result.createdAt as string),
        updatedAt: new Date((result.updatedAt || result.createdAt) as string),
      });
      setStatusMsg(`Shopping list created with ${items.length} item${items.length !== 1 ? 's' : ''}.`);
    } catch (err) {
      console.error('Failed to generate shopping list:', err);
      setStatusMsg('Failed to generate shopping list.');
    } finally {
      setIsGenerating(false);
    }
  }, [meals, entries, weekStart, shoppingListTopicId, encryptPost, addDecryptedEntry]);

  /* ── Render helpers ── */

  const renderSlot = (dateStr: string, slotKey: MealSlotType) => {
    const slot = meals[dateStr]?.[slotKey] || emptySlot();
    const cellKey = `${dateStr}-${slotKey}`;
    const isEditing = editingCell === cellKey;
    const isLinking = linkingCell === cellKey;
    const label = MEAL_SLOTS.find(m => m.key === slotKey)?.label ?? slotKey;
    const placeholderMap: Record<MealSlotType, string> = {
      breakfast: "What's for breakfast?",
      lunch: "What's for lunch?",
      dinner: "What's for dinner?",
      snack: "What's for a snack?",
    };

    // Opened from its +: a meal box that also suggests recipes (pick one to link it)
    if (pickingCell === cellKey) {
      return (
        <RecipeAutocomplete
          autoFocus
          recipes={recipes}
          value={slot.mealName}
          onQueryChange={name => handleMealNameChange(dateStr, slotKey, name)}
          onSelect={id => { setPickingCell(null); handleRecipeChange(dateStr, slotKey, id); }}
          onCommit={() => setPickingCell(null)}
          onBlur={() => setPickingCell(null)}
          placeholder={placeholderMap[slotKey]}
          ariaLabel={`${label} for ${dateStr}`}
        />
      );
    }

    // Empty slot: a quiet + that opens it for a meal name
    if (!slot.mealName && slot.recipeId == null && !isEditing && !isLinking) {
      return (
        <AddSlotBtn type="button" aria-label={`Add ${label.toLowerCase()} for ${dateStr}`} onClick={() => setPickingCell(cellKey)}>
          <Icon name="plus" size={22} strokeWidth={1.5} />
        </AddSlotBtn>
      );
    }

    return (
      <MealTile>
        <TileTop>
          {isEditing ? (
            <MealInput
              autoFocus
              rows={1}
              value={slot.mealName}
              onChange={e => handleMealNameChange(dateStr, slotKey, e.target.value)}
              onBlur={() => setEditingCell(null)}
              onKeyDown={e => { if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } }}
              placeholder={placeholderMap[slotKey]}
              aria-label={`${label} for ${dateStr}`}
            />
          ) : slot.mealName ? (
            <MealTitle type="button" onClick={() => setEditingCell(cellKey)}>{slot.mealName}</MealTitle>
          ) : (
            <MealPlaceholder type="button" onClick={() => setEditingCell(cellKey)}>{placeholderMap[slotKey]}</MealPlaceholder>
          )}
          <RemoveBtn
            type="button"
            aria-label={`Clear ${label.toLowerCase()}`}
            title="Clear"
            onMouseDown={e => e.preventDefault()}
            onClick={() => { setEditingCell(null); setLinkingCell(null); handleRecipeChange(dateStr, slotKey, null); }}
          >
            <Icon name="x" size={14} strokeWidth={2} />
          </RemoveBtn>
        </TileTop>

        {slot.recipeId != null ? (
          <RecipeLink type="button" onClick={() => openInJournal(slot.recipeId as number)} title={slot.recipeName}>
            <MaterialIcon $size={18} aria-hidden="true">link</MaterialIcon>
            Recipe
          </RecipeLink>
        ) : isLinking && recipes.length > 0 ? (
          <RecipePicker>
            <RecipeAutocomplete
              autoFocus
              recipes={recipes}
              onSelect={id => { setLinkingCell(null); handleRecipeChange(dateStr, slotKey, id); }}
              onBlur={() => setLinkingCell(null)}
            />
          </RecipePicker>
        ) : (
          <RecipeLink
            type="button"
            // Keep the name field's blur from closing the tile before this click lands
            onMouseDown={e => e.preventDefault()}
            onClick={() => (recipes.length > 0 ? setLinkingCell(cellKey) : navigate('/menu/recipes'))}
          >
            <MaterialIcon $size={18} aria-hidden="true">link</MaterialIcon>
            {recipes.length > 0 ? 'Link recipe' : 'Add a recipe'}
          </RecipeLink>
        )}
      </MealTile>
    );
  };

  /* ── Guards ── */

  if (needsUnlock) {
    return (
      <>
        <ContentTemplate><EmptyState message="Unlock your journal to view your menu" /></ContentTemplate>
        <UnlockDialog onUnlock={handleUnlock} />
      </>
    );
  }

  if (isLoading || !isReady) {
    return (
      <ContentTemplate>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
          <Spinner size={40} />
        </div>
      </ContentTemplate>
    );
  }

  if (!menuPlanTopicId) {
    return (
      <ContentTemplate>
        <EmptyState
          message="Menu Plan topic not found."
          submessage="Make sure the Menu Plan topic exists in your Topics list."
        />
      </ContentTemplate>
    );
  }

  return (
    <ContentTemplate>
      <Page>
        <Inner>
          <Head>
            <Title>{KITCHEN_TITLE}</Title>
            <HeadActions>
              <WeekNav>
                <NavBtn onClick={() => { flushSave(); setWeekStart(w => addDays(w, -7)); }} aria-label="Previous week">
                  <Icon name="chevron-left" size={16} strokeWidth={2} />
                </NavBtn>
                <WeekLabel>{fmtWeek(weekStart)}</WeekLabel>
                <NavBtn onClick={() => { flushSave(); setWeekStart(w => addDays(w, 7)); }} aria-label="Next week">
                  <Icon name="chevron-right" size={16} strokeWidth={2} />
                </NavBtn>
              </WeekNav>
              <Divider aria-hidden="true" />
              <TextBtn type="button" onClick={() => {
                const recipeTopic = allTopics.find(t => recipeTopicIds.has(t.id));
                if (recipeTopic) newEntry(recipeTopic.id); else navigate('/menu/recipes');
              }}>New recipe</TextBtn>
              <TextBtn type="button" onClick={handleGenerateShoppingList} disabled={isGenerating}>
                {isGenerating ? 'Making list…' : 'Make shopping list'}
              </TextBtn>
              {/* The app's standard outlined action pill */}
              <PillButton type="button" onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving…' : 'Save menu'}
              </PillButton>
            </HeadActions>
          </Head>

          <TabsRow><MealsTabBar /></TabsRow>

          {statusMsg && <StatusMsg>{statusMsg}</StatusMsg>}
        </Inner>

        {/* Grid breaks out of Inner to fill full page width */}
        <ScrollArea>
          <PlannerGrid>
            <CornerCell />
            {weekDays.map(day => {
              const ds = toDateStr(day);
              const isToday = ds === todayStr;
              return (
                <HeaderCell key={ds} $isToday={isToday}>
                  <DayName $isToday={isToday}>{fmtDay(day)}</DayName>
                  <DayDate>{day.getDate()}</DayDate>
                </HeaderCell>
              );
            })}
            {MEAL_SLOTS.map(({ key, label }) => (
              <Fragment key={key}>
                <MealLabelCell>{label}</MealLabelCell>
                {weekDays.map(day => {
                  const dateStr = toDateStr(day);
                  return (
                    <MealCell key={`${dateStr}-${key}`} $isToday={dateStr === todayStr}>
                      {renderSlot(dateStr, key)}
                    </MealCell>
                  );
                })}
              </Fragment>
            ))}
          </PlannerGrid>
        </ScrollArea>

        <Inner>
          <MobileArea>
            {weekDays.map(day => {
              const dateStr = toDateStr(day);
              const isToday = dateStr === todayStr;
              return (
                <DayCard key={dateStr}>
                  <DayCardHeader $isToday={isToday}>
                    <DayName $isToday={isToday}>{fmtDay(day)}</DayName>
                    <DayDate>{day.getDate()}</DayDate>
                  </DayCardHeader>
                  {MEAL_SLOTS.map(({ key, label }) => (
                    <MobileSlotRow key={key}>
                      <MobileSlotLabel>{label}</MobileSlotLabel>
                      <MobileSlotInputs>
                        {renderSlot(dateStr, key)}
                      </MobileSlotInputs>
                    </MobileSlotRow>
                  ))}
                </DayCard>
              );
            })}
          </MobileArea>
        </Inner>
      </Page>
    </ContentTemplate>
  );
}
