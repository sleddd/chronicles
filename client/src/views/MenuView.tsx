import { useState, useMemo, useCallback, useEffect, Fragment } from 'react';
import styled from 'styled-components';
import { faChevronLeft, faChevronRight, faCartShopping, faXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
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
  return d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
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
  padding: 53px 0 16px;
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
  gap: 8px;
  flex-wrap: wrap;
`;

const WeekNav = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
`;

const WeekLabel = styled.span`
  font-family: var(--font-label);
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  min-width: 150px;
  text-align: center;
`;

const NavBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-secondary);
  &:hover { color: var(--text-primary); }
`;

const ActionBtn = styled.button<{ $primary?: boolean }>`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  border-radius: var(--r-md);
  cursor: pointer;
  white-space: nowrap;
  transition: opacity 0.15s;

  ${({ $primary }) => $primary ? `
    background: transparent;
    color: var(--color-accent);
    border: 1px solid var(--color-accent);
    border-radius: var(--r-full);
  ` : `
    background: transparent;
    color: var(--color-accent);
    border: none;
  `}

  &:disabled { opacity: 0.5; cursor: not-allowed; }
  &:hover:not(:disabled) { opacity: 0.7; }
`;

const TabsRow = styled.div`
  margin: 0;
`;

const StatusMsg = styled.div`
  font-size: 13px;
  color: var(--text-secondary);
  padding: 8px 0;
`;

/* ── Desktop grid ── */

const ScrollArea = styled.div`
  overflow: auto;
  @media (max-width: 640px) { display: none; }
`;

const PlannerGrid = styled.div`
  display: grid;
  grid-template-columns: 80px repeat(7, minmax(130px, 1fr));
  min-width: 760px;
`;

const CornerCell = styled.div`
  border-bottom: 2px solid var(--border-subtle);
  border-right: 1px solid var(--border-subtle);
  background: var(--bg-app);
`;

const HeaderCell = styled.div<{ $isToday?: boolean }>`
  padding: 10px 10px 0;
  text-align: center;
  border-bottom: 2px solid ${({ $isToday }) => $isToday ? 'var(--color-accent)' : 'var(--border-subtle)'};
  border-right: 1px solid var(--border-subtle);
  background: ${({ $isToday }) => $isToday ? 'var(--bg-active)' : 'var(--bg-app)'};
  &:last-child { border-right: none; }
  padding-bottom: 8px;
`;

const DayName = styled.div<{ $isToday?: boolean }>`
  font-family: var(--font-label);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-secondary);
`;

const DayDate = styled.div`
  font-size: 13px;
  color: var(--text-tertiary);
  margin-top: 2px;
`;

const MealLabelCell = styled.div`
  padding: 10px 8px 10px 0;
  display: flex;
  align-items: flex-start;
  padding-top: 14px;
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-tertiary);
  border-bottom: 1px solid var(--border-subtle);
  border-right: 1px solid var(--border-subtle);
  background: var(--bg-app);
`;

const MealCell = styled.div<{ $isToday?: boolean }>`
  padding: 8px;
  border-bottom: 1px solid var(--border-subtle);
  border-right: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: ${({ $isToday }) => $isToday ? 'var(--bg-active)' : 'transparent'};
  &:last-child { border-right: none; }
`;

const MealNameBlock = styled.div<{ $hasContent: boolean }>`
  display: flex;
  gap: 0;
  min-height: 42px;
`;

const MealAccentBar = styled.div`
  width: 3px;
  border-radius: 2px;
  background: var(--color-accent);
  margin-right: 8px;
  flex-shrink: 0;
  align-self: stretch;
`;

const MealNameArea = styled.div`
  flex: 1;
  min-width: 0;
`;

const MealTitle = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.35;
  white-space: pre-wrap;
  word-break: break-word;
`;

const MealPlaceholder = styled.div`
  font-size: 13px;
  color: var(--text-tertiary);
  font-style: italic;
  line-height: 1.35;
  padding-top: 2px;
`;

const MealInput = styled.textarea`
  width: 100%;
  box-sizing: border-box;
  font-size: 14px;
  font-weight: 600;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-family: inherit;
  resize: none;
  overflow: hidden;
  min-height: 20px;
  line-height: 1.35;
  field-sizing: content;
  &::placeholder { color: var(--text-tertiary); font-style: italic; font-weight: 400; }
  &:focus { outline: none; }
`;

const RecipeSelectWrap = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`;

const LinkedRecipeName = styled.span`
  flex: 1;
  min-width: 0;
  font-size: 12px;
  padding: 4px 0;
  color: var(--text-secondary);
  font-family: var(--font-label);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const ClearRecipeBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-tertiary);
  &:hover { color: var(--text-primary); }
`;

const LinkRecipeBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-tertiary);
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 0;
  &:hover { color: var(--text-secondary); }
`;

/* ── Mobile cards ── */

const MobileArea = styled.div`
  display: none;
  flex-direction: column;
  @media (max-width: 640px) { display: flex; }
`;

const DayCard = styled.div`
  border-bottom: 1px solid var(--border-subtle);
`;

const DayCardHeader = styled.div<{ $isToday?: boolean }>`
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 10px 16px 6px;
  background: ${({ $isToday }) => $isToday ? 'var(--bg-active)' : 'var(--bg-surface)'};
  border-bottom: 1px solid var(--border-subtle);
  border-left: 3px solid ${({ $isToday }) => $isToday ? 'var(--color-accent)' : 'transparent'};
`;

const DayCardName = styled.span`
  font-family: var(--font-label);
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-secondary);
`;

const DayCardDate = styled.span`
  font-size: 13px;
  color: var(--text-tertiary);
`;

const MobileSlotRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border-subtle);
  &:last-child { border-bottom: none; }
`;

const MobileSlotLabel = styled.div`
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-tertiary);
  width: 65px;
  flex-shrink: 0;
  padding-top: 3px;
`;

const MobileSlotInputs = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
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

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekStartStr = toDateStr(weekStart);

  const menuPlanTopicId     = useMemo(() => allTopics.find(t => t.name.toLowerCase() === 'menu plan')?.id,    [allTopics]);
  // Prefer the current "Recipes" topic; the retired singular "Recipe" topic
  // is only a fallback so menu link options never mix in stale entries
  const recipeTopicId       = useMemo(() => (
    allTopics.find(t => t.name.toLowerCase() === 'recipes')?.id
      ?? allTopics.find(t => t.name.toLowerCase() === 'recipe')?.id
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
    if (!recipeTopicId) return [];
    return entries
      .filter(e => (e.metadata as Record<string, unknown>)?._taxonomyId === recipeTopicId)
      .map(e => {
        const cf = (e.metadata as Record<string, unknown>)?._customFields as Record<string, unknown> | undefined;
        const name = typeof cf?.recipeName === 'string' ? cf.recipeName.trim() : '';
        return { id: e.id, title: name || stripHtml(e.content).slice(0, 60) || `Recipe #${e.id}` };
      });
  }, [entries, recipeTopicId]);

  useEffect(() => {
    if (menuPlanEntry) {
      const cf = (menuPlanEntry.metadata as Record<string, unknown>)?._customFields as Record<string, unknown>;
      setMeals((cf?.days as Record<string, MenuPlanDay>) || {});
    } else {
      setMeals({});
    }
  }, [menuPlanEntry?.id, weekStartStr]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateSlot = useCallback((dateStr: string, slot: MealSlotType, patch: Partial<MenuMealSlot>) => {
    setMeals(prev => ({
      ...prev,
      [dateStr]: {
        ...(prev[dateStr] || emptyDay()),
        [slot]: { ...(prev[dateStr]?.[slot] || emptySlot()), ...patch },
      },
    }));
  }, []);

  const handleMealNameChange = useCallback((dateStr: string, slot: MealSlotType, mealName: string) => {
    updateSlot(dateStr, slot, { mealName });
  }, [updateSlot]);

  const handleRecipeChange = useCallback((dateStr: string, slot: MealSlotType, recipeId: number | null) => {
    const recipe = recipeId ? recipes.find(r => r.id === recipeId) : null;
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
  }, [recipes]);

  const handleSave = useCallback(async () => {
    if (!menuPlanTopicId) return;
    setIsSaving(true);
    setStatusMsg('');
    try {
      const weekEnd  = addDays(weekStart, 6);
      const content  = `<p>Menu: ${fmtShort(weekStart)} – ${fmtShort(weekEnd)}</p>`;
      const customFields = { weekStart: weekStartStr, days: meals };
      const metadata: Record<string, unknown> = { _taxonomyId: menuPlanTopicId, _customFields: customFields };

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
  }, [menuPlanTopicId, menuPlanEntry, weekStart, weekStartStr, meals, encryptPost, updateDecryptedEntry, addDecryptedEntry]);

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

  const renderSlot = (dateStr: string, slotKey: MealSlotType, compact = false) => {
    const slot = meals[dateStr]?.[slotKey] || emptySlot();
    const cellKey = `${dateStr}-${slotKey}`;
    const isEditing = editingCell === cellKey;
    const placeholderMap: Record<MealSlotType, string> = {
      breakfast: "What's for breakfast?",
      lunch: "What's for lunch?",
      dinner: "What's for dinner?",
      snack: "What's for a snack?",
    };

    return (
      <>
        <MealNameBlock $hasContent={!!slot.mealName}>
          <MealNameArea>
            {isEditing ? (
              <MealInput
                autoFocus
                rows={1}
                value={slot.mealName}
                onChange={e => {
                  const el = e.target as HTMLTextAreaElement;
                  el.style.height = 'auto';
                  el.style.height = el.scrollHeight + 'px';
                  handleMealNameChange(dateStr, slotKey, el.value);
                }}
                onBlur={() => setEditingCell(null)}
                placeholder={placeholderMap[slotKey]}
              />
            ) : slot.mealName ? (
              <MealTitle onClick={() => setEditingCell(cellKey)}>{slot.mealName}</MealTitle>
            ) : (
              <MealPlaceholder onClick={() => setEditingCell(cellKey)}>
                {compact ? placeholderMap[slotKey] : placeholderMap[slotKey]}
              </MealPlaceholder>
            )}
          </MealNameArea>
        </MealNameBlock>

        {recipes.length > 0 ? (
          <RecipeSelectWrap>
            {slot.recipeId != null ? (
              <>
                <LinkedRecipeName title={slot.recipeName}>{slot.recipeName}</LinkedRecipeName>
                <ClearRecipeBtn
                  type="button"
                  onClick={() => handleRecipeChange(dateStr, slotKey, null)}
                  aria-label="Remove linked recipe"
                  title="Remove linked recipe"
                >
                  <FontAwesomeIcon icon={faXmark} size="xs" />
                </ClearRecipeBtn>
              </>
            ) : (
              <RecipeAutocomplete
                recipes={recipes}
                onSelect={id => handleRecipeChange(dateStr, slotKey, id)}
              />
            )}
          </RecipeSelectWrap>
        ) : (
          <LinkRecipeBtn onClick={() => navigate('/')}>+ Link recipe</LinkRecipeBtn>
        )}
      </>
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
                <NavBtn onClick={() => setWeekStart(w => addDays(w, -7))} aria-label="Previous week">
                  <FontAwesomeIcon icon={faChevronLeft} size="xs" />
                </NavBtn>
                <WeekLabel>{fmtShort(weekStart)} – {fmtShort(addDays(weekStart, 6))}</WeekLabel>
                <NavBtn onClick={() => setWeekStart(w => addDays(w, 7))} aria-label="Next week">
                  <FontAwesomeIcon icon={faChevronRight} size="xs" />
                </NavBtn>
              </WeekNav>
              <ActionBtn onClick={() => navigate('/')}>+ New Recipe</ActionBtn>
              <ActionBtn onClick={handleGenerateShoppingList} disabled={isGenerating}>
                <FontAwesomeIcon icon={faCartShopping} size="xs" />
                {isGenerating ? 'Generating…' : 'Generate Shopping List'}
              </ActionBtn>
              <ActionBtn $primary onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving…' : 'Save Menu'}
              </ActionBtn>
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
                  <DayDate>{fmtShort(day)}</DayDate>
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
                    <DayCardName>{fmtDay(day)}</DayCardName>
                    <DayCardDate>{fmtShort(day)}</DayCardDate>
                  </DayCardHeader>
                  {MEAL_SLOTS.map(({ key, label }) => (
                    <MobileSlotRow key={key}>
                      <MobileSlotLabel>{label}</MobileSlotLabel>
                      <MobileSlotInputs>
                        {renderSlot(dateStr, key, true)}
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
