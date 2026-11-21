import { useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { Modal } from '../atoms/Modal.js';
import { PillButton } from '../atoms/PillButton.js';
import { Spinner } from '../atoms/Spinner.js';
import { Toggle } from '../atoms/Toggle.js';
import { Checkbox } from '../atoms/core/Checkbox.jsx';
import { AiSharePrompt } from '../molecules/AiSharePrompt.js';
import { Section, SectionHead, SectionLabel, BoxInput, BoxText, Chips, Chip, FieldNote } from '../molecules/fields/formKit.js';
import {
  ALLERGEN_NOTE, PRICE_NOTE, AllergenFlag, AllergyTick, KitchenCenter, KitchenNote, RecipeDetails, ReviewDetail, ReviewSection, SetupForm,
} from '../molecules/AiKitchenParts.js';
import { useCreateEntry } from '../../hooks/useCreateEntry.js';
import { useEncryptedSetting } from '../../hooks/useEncryptedSetting.js';
import { useKitchenData } from '../../hooks/useKitchenData.js';
import { aiFeatureJson, aiProviderName } from '../../services/aiAssistant.js';
import { showFlash } from '../../services/flashNotice.js';
import {
  MEAL_SLOTS, SLOT_LABEL, allergenHits, budgetCheck, buildMenuRequest, formatCents, nameAllergenHits, parseMenuPlan,
  type AiMenu, type MenuRequest,
} from '../../utils/aiKitchen.js';
import { shoppingLineText } from '../../utils/kitchen.js';
import type { MealSlotType, MenuMealSlot, ShoppingItem } from '../../types/fields.js';

/*
 * AI menu (Kitchen → Menu, only while AI kitchen is on and agreed to in this
 * browser): set up the week (budget, people, meals, preferences, and — only
 * when ticked for this run — allergies), see exactly what will be sent, then
 * review the AI's meals, the new recipes it wrote and a shopping list with
 * estimated prices. Nothing is saved until Apply, and then only through the
 * usual encrypted saves. The request and the answer live in this component's
 * memory and go when it closes — never in storage, a setting or a log. The
 * remembered set-up (budget, people, meals, Use my recipes) is a sealed
 * setting, and never includes the allergy tick.
 */

export interface KitchenPrefs {
  budgetCents: number;
  people: number;
  slots: MealSlotType[];
  useRecipes: boolean;
}
export const DEFAULT_KITCHEN_PREFS: KitchenPrefs = { budgetCents: 10_000, people: 2, slots: ['breakfast', 'lunch', 'dinner'], useRecipes: true };

const MoneyBox = styled.label`
  position: relative;
  display: block;
  max-width: 220px;
  span {
    position: absolute;
    left: 16px;
    top: 50%;
    transform: translateY(-50%);
    font-family: var(--font-sans);
    font-size: 16px;
    color: var(--text-muted);
    pointer-events: none;
  }
  input { padding-left: 30px !important; }
`;

const Narrow = styled.div`
  max-width: 120px;
`;

const Total = styled.p<{ $over: boolean }>`
  margin: 12px 0 0;
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: 500;
  color: ${({ $over }) => ($over ? 'var(--color-danger)' : 'var(--text-primary)')};
`;

const Items = styled.ul`
  && { margin: 6px 0 0 30px; }
  && li {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    padding: 6px 0;
    font-family: var(--font-sans);
    font-size: 14px;
    color: var(--text-secondary);
  }
  && li span:last-child { color: var(--text-muted); white-space: nowrap; }
`;

type Step = 'setup' | 'share' | 'working' | 'review' | 'saving';

const dayLabel = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const shortDay = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** A stored prefs value, checked (it comes back from the server) */
function readPrefs(value: unknown): KitchenPrefs {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<KitchenPrefs>;
  const budget = typeof v.budgetCents === 'number' && v.budgetCents > 0 && v.budgetCents <= 1_000_000 ? Math.round(v.budgetCents) : DEFAULT_KITCHEN_PREFS.budgetCents;
  const people = typeof v.people === 'number' && v.people >= 1 && v.people <= 20 ? Math.round(v.people) : DEFAULT_KITCHEN_PREFS.people;
  const slots = Array.isArray(v.slots) ? MEAL_SLOTS.filter(s => v.slots!.includes(s)) : DEFAULT_KITCHEN_PREFS.slots;
  return { budgetCents: budget, people, slots: slots.length ? slots : DEFAULT_KITCHEN_PREFS.slots, useRecipes: v.useRecipes !== false };
}

/** The meals chosen, as Menu slots to merge into the week (day → slot → meal) */
export type MenuPatch = Record<string, Partial<Record<MealSlotType, MenuMealSlot>>>;

/** How many weeks of past menus are sent, so the AI doesn't plan the same meals again */
export const RECENT_WEEKS = 4;

/** Meal names from the saved weeks before this one (up to `RECENT_WEEKS` back) and this week's planned meals */
export function recentMealNames(weeks: { weekStart: string; meals: string[] }[], weekStart: string, planned: string[]): string[] {
  const from = new Date(`${weekStart}T12:00:00`);
  from.setDate(from.getDate() - RECENT_WEEKS * 7);
  const earliest = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`;
  const past = weeks.filter(w => w.weekStart >= earliest && w.weekStart < weekStart)
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
    .flatMap(w => w.meals);
  const seen = new Set<string>();
  return [...planned, ...past].filter(name => {
    const key = name.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function AiMenuPlan({ days, taken, plannedMeals = [], onApply, onClose }: {
  /** The week shown on the Menu, Monday first, YYYY-MM-DD */
  days: string[];
  /** Slots already planned ("YYYY-MM-DD:dinner"): kept as they are */
  taken: string[];
  /** The names of the meals already planned this week (not repeated) */
  plannedMeals?: string[];
  /** Merges the chosen meals into the week and saves the menu */
  onApply: (patch: MenuPatch) => void;
  onClose: () => void;
}) {
  const { allergies, recipes, menuWeeks } = useKitchenData();
  const [savedPrefs, savePrefs, prefsLoaded] = useEncryptedSetting<KitchenPrefs>('aiKitchenPrefs', DEFAULT_KITCHEN_PREFS);
  const createEntry = useCreateEntry();
  const startPrefs = useMemo(() => readPrefs(savedPrefs), [savedPrefs]);

  const [budget, setBudget] = useState<string | null>(null);
  const [people, setPeople] = useState<string | null>(null);
  const [slots, setSlots] = useState<MealSlotType[] | null>(null);
  const [useRecipes, setUseRecipes] = useState<boolean | null>(null);
  // Never remembered: allergies go only on a run where this is ticked
  const [withAllergies, setWithAllergies] = useState(false);
  const [preferences, setPreferences] = useState('');

  const budgetText = budget ?? (startPrefs.budgetCents / 100).toFixed(2).replace(/\.00$/, '');
  const peopleText = people ?? String(startPrefs.people);
  const chosenSlots = slots ?? startPrefs.slots;
  const recipesOn = useRecipes ?? startPrefs.useRecipes;
  const budgetCents = Math.round(Number(budgetText.replace(/[$,\s]/g, '')) * 100);
  const peopleN = Math.round(Number(peopleText));
  const budgetOk = Number.isFinite(budgetCents) && budgetCents >= 100 && budgetCents <= 1_000_000;
  const peopleOk = Number.isFinite(peopleN) && peopleN >= 1 && peopleN <= 20;
  const openSlots = days.flatMap(d => chosenSlots.map(s => `${d}:${s}`)).filter(at => !taken.includes(at));
  const ready = budgetOk && peopleOk && chosenSlots.length > 0 && openSlots.length > 0;

  const [step, setStep] = useState<Step>('setup');
  const [error, setError] = useState('');
  const [request, setRequest] = useState<MenuRequest | null>(null);
  const [menu, setMenu] = useState<AiMenu | null>(null);
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set());
  const runRef = useRef(0);

  const toggleSlot = (slot: MealSlotType) =>
    setSlots(chosenSlots.includes(slot) ? chosenSlots.filter(s => s !== slot) : MEAL_SLOTS.filter(s => s === slot || chosenSlots.includes(s)));

  const next = () => {
    if (!ready) return;
    const prefs: KitchenPrefs = { budgetCents, people: peopleN, slots: chosenSlots, useRecipes: recipesOn };
    if (prefsLoaded && JSON.stringify(prefs) !== JSON.stringify(startPrefs)) {
      savePrefs(prefs).catch(err => console.warn('Couldn’t remember the AI menu set-up:', err instanceof Error ? err.message : 'error'));
    }
    setRequest(buildMenuRequest({
      days, slots: chosenSlots, taken, people: peopleN, budgetCents, preferences,
      recipes: recipesOn ? recipes : [],
      allergies: withAllergies ? allergies : [],
      recentMeals: recentMealNames(menuWeeks, days[0], plannedMeals),
    }));
    setError('');
    setStep('share');
  };

  const send = async () => {
    if (!request) return;
    const run = ++runRef.current;
    setError('');
    setStep('working');
    try {
      const answer = await aiFeatureJson('aiKitchen', request.system, request.prompt, 16000);
      if (run !== runRef.current) return;
      const parsed = parseMenuPlan(answer, request.context);
      if (parsed.meals.length === 0) throw new Error('The AI didn’t plan any meals this time. Try again.');
      setMenu(parsed);
      setSkipped(new Set());
      setStep('review');
    } catch (err) {
      if (run !== runRef.current) return;
      setError(err instanceof Error ? err.message : 'That didn’t work. Try again.');
      setStep('share');
    }
  };

  const close = () => { runRef.current++; onClose(); };
  const on = (key: string) => !skipped.has(key);
  const toggle = (key: string, value: boolean) => setSkipped(s => { const n = new Set(s); if (value) n.delete(key); else n.add(key); return n; });

  const recipeById = useMemo(() => new Map(recipes.map(r => [r.id, r])), [recipes]);
  /** Checked against every saved allergy, whether or not they were sent */
  const recipeHits = (m: AiMenu['meals'][number]): string[] => {
    const written = m.newRecipeKey ? menu?.recipes.find(x => x.key === m.newRecipeKey) : undefined;
    if (written) return allergenHits(written.fields, allergies);
    const saved = m.recipeId ? recipeById.get(m.recipeId) : undefined;
    if (saved) return allergenHits({ recipeName: saved.title, ingredients: saved.ingredients.map(name => ({ id: name, amount: '', name })), steps: [] }, allergies);
    return [];
  };
  /** The meal's own name is checked too: "Peanut noodles" may be linked to a recipe that never says peanut */
  const mealHits = (m: AiMenu['meals'][number]): string[] =>
    [...new Set([...recipeHits(m), ...nameAllergenHits(m.mealName, allergies)])];

  /** The shopping list is checked too: its lines, with the allergens each may contain */
  const listHits = useMemo(() => (menu?.shopping ?? []).flatMap(line => {
    const hits = nameAllergenHits(line.name, allergies);
    return hits.length ? [`${line.name} (may contain ${hits.join(', ')})`] : [];
  }), [menu, allergies]);

  const chosenMeals = menu?.meals.filter(m => on(`m${m.day}:${m.slot}`)) ?? [];
  const chosenRecipes = menu?.recipes.filter(r => on(`r${r.key}`) && chosenMeals.some(m => m.newRecipeKey === r.key)) ?? [];
  const makeList = !!menu && menu.shopping.length > 0 && on('list');

  const apply = async () => {
    if (!menu) return;
    setStep('saving');
    const failed: string[] = [];
    const ids = new Map<string, number>();
    for (const r of chosenRecipes) {
      const id = await createEntry({ name: 'Recipe', icon: 'bowl-food' }, r.fields.recipeName, { ...r.fields });
      if (id) ids.set(r.key, id); else failed.push(`“${r.fields.recipeName}”`);
    }
    const patch: MenuPatch = {};
    for (const m of chosenMeals) {
      const newId = m.newRecipeKey ? ids.get(m.newRecipeKey) ?? null : null;
      const recipeId = m.recipeId ?? newId;
      const recipeName = m.recipeId ? recipeById.get(m.recipeId)?.title ?? '' : newId ? menu.recipes.find(r => r.key === m.newRecipeKey)?.fields.recipeName ?? '' : '';
      (patch[m.day] ??= {})[m.slot] = { mealName: m.mealName, recipeId, recipeName };
    }
    if (chosenMeals.length) onApply(patch);
    if (makeList) {
      const items: ShoppingItem[] = menu.shopping.map(s => ({
        id: crypto.randomUUID(), name: shoppingLineText(s), category: s.category, checked: false,
      }));
      const linkedRecipeIds = [...new Set(chosenMeals.map(m => m.recipeId ?? (m.newRecipeKey ? ids.get(m.newRecipeKey) : undefined)).filter((id): id is number => typeof id === 'number'))];
      const title = `Shopping list for ${shortDay(days[0])} – ${shortDay(days[days.length - 1])}`;
      const notes = `Estimated ${formatCents(menu.totalCents)} by AI for a ${formatCents(budgetCents)} budget. ${PRICE_NOTE}`;
      const id = await createEntry({ name: 'Shopping List', icon: 'cart-shopping' }, title, { items, notes, linkedRecipeIds });
      if (!id) failed.push('the shopping list');
    }
    if (failed.length) showFlash(`${failed.join(', ')} didn’t save. The rest is in place.`);
    onClose();
  };

  const count = chosenMeals.length + (makeList ? 1 : 0);
  const footer = step === 'setup' ? (<>
    <PillButton type="button" $variant="neutral" onClick={close}>Cancel</PillButton>
    <PillButton type="button" disabled={!ready} onClick={next}>Next</PillButton>
  </>) : step === 'share' ? (<>
    <PillButton type="button" $variant="neutral" onClick={() => setStep('setup')}>Back</PillButton>
    <PillButton type="button" onClick={() => { void send(); }}>OK</PillButton>
  </>) : step === 'working' ? (
    <PillButton type="button" $variant="neutral" onClick={close}>Cancel</PillButton>
  ) : (<>
    <PillButton type="button" $variant="neutral" disabled={step === 'saving'} onClick={close}>Cancel</PillButton>
    <PillButton type="button" disabled={step === 'saving' || count === 0} onClick={() => { void apply(); }}>
      {step === 'saving' ? 'Saving…' : 'Apply'}
    </PillButton>
  </>);

  const check = menu ? budgetCheck(menu.totalCents, budgetCents) : null;

  return (
    <Modal open onClose={step === 'saving' ? () => {} : close} title="AI menu" size="lg" footer={footer}
      // A menu being reviewed was paid for: a stray click outside must not throw it away
      closeOnBackdrop={step === 'setup' || step === 'share'}>
      {step === 'setup' && (
        <SetupForm>
          <Section>
            <SectionHead><SectionLabel as="label" htmlFor="ai-menu-budget">Food budget for the week</SectionLabel></SectionHead>
            <MoneyBox>
              <span aria-hidden="true">$</span>
              <BoxInput id="ai-menu-budget" inputMode="decimal" value={budgetText} onChange={e => setBudget(e.target.value)} />
            </MoneyBox>
            {!budgetOk && <FieldNote $error>Enter a budget between $1 and $10,000.</FieldNote>}
          </Section>
          <Section>
            <SectionHead><SectionLabel as="label" htmlFor="ai-menu-people">People</SectionLabel></SectionHead>
            <Narrow>
              <BoxInput id="ai-menu-people" type="number" min={1} max={20} inputMode="numeric" value={peopleText} onChange={e => setPeople(e.target.value)} />
            </Narrow>
          </Section>
          <Section>
            <SectionHead><SectionLabel>Meals to plan</SectionLabel></SectionHead>
            <Chips role="group" aria-label="Meals to plan">
              {MEAL_SLOTS.map(s => (
                <Chip key={s} type="button" $active={chosenSlots.includes(s)} aria-pressed={chosenSlots.includes(s)} onClick={() => toggleSlot(s)}>
                  {SLOT_LABEL[s]}
                </Chip>
              ))}
            </Chips>
            <FieldNote>
              {openSlots.length === 0
                ? 'Every one of those is already planned this week.'
                : `Meals already on this week’s menu are kept. ${openSlots.length} to plan.`}
            </FieldNote>
          </Section>
          <Section>
            <Toggle checked={recipesOn} onChange={setUseRecipes} label={`Use my recipes${recipes.length ? ` (${recipes.length})` : ''}`} />
            <FieldNote>Sends their names and ingredients so the AI can work them in.</FieldNote>
          </Section>
          <AllergyTick allergies={allergies} checked={withAllergies} onChange={setWithAllergies} />
          <Section>
            <SectionHead><SectionLabel as="label" htmlFor="ai-menu-prefs">Anything else?</SectionLabel></SectionHead>
            <BoxText id="ai-menu-prefs" value={preferences} maxLength={600} onChange={e => setPreferences(e.target.value)}
              placeholder="e.g. Vegetarian, quick weeknight dinners, no mushrooms" />
          </Section>
        </SetupForm>
      )}
      {step === 'share' && request && (<>
        {error && <KitchenNote $error role="alert">{error}</KitchenNote>}
        <AiSharePrompt provider={aiProviderName()} lines={request.shared} approxTokens={request.approxTokens}
          note={request.leftOut > 0 ? `${request.leftOut} of your recipes are left out to keep the request small.` : undefined} />
      </>)}
      {step === 'working' && <KitchenCenter role="status"><Spinner size={32} />Planning your week…</KitchenCenter>}
      {(step === 'review' || step === 'saving') && menu && (<>
        <KitchenNote>{ALLERGEN_NOTE} Untick anything you don’t want. Nothing is saved until you press Apply.</KitchenNote>
        {menu.note && <KitchenNote>{menu.note}</KitchenNote>}
        <ReviewSection aria-label="Meals">
          <h3>Meals</h3>
          <ul>
            {menu.meals.map(m => {
              const hits = mealHits(m);
              const recipe = m.recipeId ? recipeById.get(m.recipeId)?.title : null;
              return (
                <li key={`${m.day}:${m.slot}`}>
                  <Checkbox label={`${dayLabel(m.day)} · ${SLOT_LABEL[m.slot]} · ${m.mealName}`}
                    checked={on(`m${m.day}:${m.slot}`)} onChange={e => toggle(`m${m.day}:${m.slot}`, e.target.checked)} />
                  {recipe && <ReviewDetail>Your recipe: {recipe}</ReviewDetail>}
                  {m.newRecipeKey && <ReviewDetail>New recipe, below</ReviewDetail>}
                  {hits.length > 0 && <AllergenFlag>May contain {hits.join(', ')}</AllergenFlag>}
                </li>
              );
            })}
          </ul>
        </ReviewSection>
        {menu.recipes.length > 0 && (
          <ReviewSection aria-label="New recipes">
            <h3>New recipes</h3>
            <ul>
              {menu.recipes.map(r => {
                const hits = allergenHits(r.fields, allergies);
                return (
                  <li key={r.key}>
                    <Checkbox label={`Save “${r.fields.recipeName}” to Recipes`} checked={on(`r${r.key}`)} onChange={e => toggle(`r${r.key}`, e.target.checked)} />
                    {hits.length > 0 && <AllergenFlag>May contain {hits.join(', ')}</AllergenFlag>}
                    <RecipeDetails fields={r.fields} />
                  </li>
                );
              })}
            </ul>
          </ReviewSection>
        )}
        {menu.shopping.length > 0 && check && (
          <ReviewSection aria-label="Shopping list">
            <h3>Shopping list</h3>
            <ul>
              <li>
                <Checkbox label="Make this shopping list" checked={on('list')} onChange={e => toggle('list', e.target.checked)} />
                <Items>
                  {menu.shopping.map((s, i) => (
                    <li key={`${s.name}${i}`}>
                      <span>{shoppingLineText(s)}</span>
                      <span>{s.estCostCents ? `~${formatCents(s.estCostCents)}` : ''}</span>
                    </li>
                  ))}
                </Items>
                {listHits.length > 0 && <AllergenFlag $flush>On the list: {listHits.join(', ')}</AllergenFlag>}
                <Total $over={check.over}>
                  Estimated {formatCents(menu.totalCents)} of your {formatCents(budgetCents)} budget
                  {check.over ? ` · ${formatCents(check.byCents)} over` : ` · ${formatCents(check.byCents)} to spare`}
                </Total>
                {menu.unpriced > 0 && (
                  <ReviewDetail $flush>
                    {menu.unpriced === 1 ? '1 item has no price and isn’t in the estimate.' : `${menu.unpriced} items have no price and aren’t in the estimate.`}
                  </ReviewDetail>
                )}
                {chosenMeals.length < menu.meals.length && (
                  <ReviewDetail $flush>The list and its estimate cover every meal the AI planned, the ones you unticked too.</ReviewDetail>
                )}
                <ReviewDetail $flush role="note">{PRICE_NOTE}</ReviewDetail>
              </li>
            </ul>
          </ReviewSection>
        )}
      </>)}
    </Modal>
  );
}
