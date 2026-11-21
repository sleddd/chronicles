import { useRef, useState } from 'react';
import styled from 'styled-components';
import { Modal } from '../atoms/Modal.js';
import { PillButton } from '../atoms/PillButton.js';
import { Spinner } from '../atoms/Spinner.js';
import { Toggle } from '../atoms/Toggle.js';
import { AiSharePrompt } from '../molecules/AiSharePrompt.js';
import { Section, SectionHead, SectionLabel, BoxInput, BoxText, Chips, Chip, FieldNote } from '../molecules/fields/formKit.js';
import {
  ALLERGEN_NOTE, AllergenFlag, AllergyTick, KitchenCenter, KitchenNote, RecipeDetails, ReviewDetail, ReviewSection, SetupForm,
} from '../molecules/AiKitchenParts.js';
import { useCreateEntry } from '../../hooks/useCreateEntry.js';
import { useKitchenData } from '../../hooks/useKitchenData.js';
import { useOpenInJournal } from '../../hooks/useOpenInJournal.js';
import { aiFeatureJson, aiProviderName } from '../../services/aiAssistant.js';
import { useAiFeatureEnabled } from '../../hooks/useAiReady.js';
import {
  allergenHits, buildRecipeRequest, parseRecipeIdea, splitIngredientList,
  type AiRecipeIdea, type KitchenRequest,
} from '../../utils/aiKitchen.js';
import type { RecipeCategory } from '../../types/fields.js';

/*
 * Recipe from ingredients (Kitchen → Recipes and the Kitchen dashboard, only
 * while AI kitchen is on and agreed to in this browser): list what you have,
 * see exactly what will be sent, and the AI writes one recipe to review and
 * save. Try another asks again (through the share prompt again). The request
 * and the answer live only in this component's memory.
 */

const MEALS: { key: RecipeCategory; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' }, { key: 'lunch', label: 'Lunch' }, { key: 'dinner', label: 'Dinner' },
  { key: 'snack', label: 'Snack' }, { key: 'dessert', label: 'Dessert' },
];

const Narrow = styled.div`
  max-width: 120px;
`;

const Title = styled.h3`
  margin: 0;
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 300;
  color: var(--text-primary);
`;

type Step = 'setup' | 'share' | 'working' | 'review' | 'saving' | 'saved';

export function AiRecipeFromIngredients({ onClose }: { onClose: () => void }) {
  const { allergies } = useKitchenData();
  const createEntry = useCreateEntry();
  const openInJournal = useOpenInJournal();

  const [have, setHave] = useState('');
  const [servings, setServings] = useState('2');
  const [meal, setMeal] = useState<RecipeCategory | ''>('');
  const [pantry, setPantry] = useState(true);
  // Never remembered: allergies go only on a run where this is ticked
  const [withAllergies, setWithAllergies] = useState(false);
  const [preferences, setPreferences] = useState('');

  const ingredients = splitIngredientList(have);
  const servingsN = Math.round(Number(servings));
  const ready = ingredients.length > 0 && Number.isFinite(servingsN) && servingsN >= 1 && servingsN <= 20;

  const [step, setStep] = useState<Step>('setup');
  const [error, setError] = useState('');
  const [request, setRequest] = useState<KitchenRequest | null>(null);
  const [idea, setIdea] = useState<AiRecipeIdea | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);
  // Titles it already suggested this time: Try another asks for something different
  const [suggested, setSuggested] = useState<string[]>([]);
  const runRef = useRef(0);

  const prepare = (avoid: string[]) => {
    setRequest(buildRecipeRequest({
      ingredients, servings: servingsN, meal, pantry, preferences,
      allergies: withAllergies ? allergies : [],
      avoid,
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
      const answer = await aiFeatureJson('aiKitchen', request.system, request.prompt, 4096);
      if (run !== runRef.current) return;
      const parsed = parseRecipeIdea(answer);
      setIdea(parsed);
      setSuggested(s => [...s, parsed.recipe.fields.recipeName]);
      setStep('review');
    } catch (err) {
      if (run !== runRef.current) return;
      setError(err instanceof Error ? err.message : 'That didn’t work. Try again.');
      setStep('share');
    }
  };

  const save = async () => {
    if (!idea) return;
    setStep('saving');
    const id = await createEntry({ name: 'Recipe', icon: 'bowl-food' }, idea.recipe.fields.recipeName, { ...idea.recipe.fields });
    if (id) { setSavedId(id); setStep('saved'); } else { setError('The recipe didn’t save. Try again.'); setStep('review'); }
  };

  const close = () => { runRef.current++; onClose(); };

  const footer = step === 'setup' ? (<>
    <PillButton type="button" $variant="neutral" onClick={close}>Cancel</PillButton>
    <PillButton type="button" disabled={!ready} onClick={() => prepare([])}>Next</PillButton>
  </>) : step === 'share' ? (<>
    <PillButton type="button" $variant="neutral" onClick={() => setStep(idea ? 'review' : 'setup')}>Back</PillButton>
    <PillButton type="button" onClick={() => { void send(); }}>OK</PillButton>
  </>) : step === 'working' ? (
    <PillButton type="button" $variant="neutral" onClick={close}>Cancel</PillButton>
  ) : step === 'saved' ? (<>
    <PillButton type="button" $variant="neutral" onClick={close}>Close</PillButton>
    <PillButton type="button" onClick={() => { if (savedId) openInJournal(savedId); close(); }}>Open recipe</PillButton>
  </>) : (<>
    <PillButton type="button" $variant="neutral" disabled={step === 'saving'} onClick={close}>Close</PillButton>
    <PillButton type="button" $variant="neutral" disabled={step === 'saving'} onClick={() => prepare(suggested)}>Try another</PillButton>
    <PillButton type="button" disabled={step === 'saving'} onClick={() => { void save(); }}>
      {step === 'saving' ? 'Saving…' : 'Save recipe'}
    </PillButton>
  </>);

  const hits = idea ? allergenHits(idea.recipe.fields, allergies) : [];

  return (
    <Modal open onClose={step === 'saving' ? () => {} : close} title="Recipe from ingredients" size="lg" footer={footer}
      // A recipe being reviewed was paid for: a stray click outside must not throw it away
      closeOnBackdrop={step === 'setup' || step === 'share' || step === 'saved'}>
      {step === 'setup' && (
        <SetupForm>
          <Section>
            <SectionHead><SectionLabel as="label" htmlFor="ai-recipe-have">What do you have?</SectionLabel></SectionHead>
            <BoxText id="ai-recipe-have" value={have} maxLength={2000} onChange={e => setHave(e.target.value)}
              placeholder={'One per line, or separated by commas\ne.g. chicken thighs, rice, spinach, lemon'} />
            {ingredients.length > 0 && <FieldNote>{ingredients.length} {ingredients.length === 1 ? 'ingredient' : 'ingredients'}</FieldNote>}
          </Section>
          <Section>
            <SectionHead><SectionLabel as="label" htmlFor="ai-recipe-servings">Servings</SectionLabel></SectionHead>
            <Narrow>
              <BoxInput id="ai-recipe-servings" type="number" min={1} max={20} inputMode="numeric" value={servings} onChange={e => setServings(e.target.value)} />
            </Narrow>
          </Section>
          <Section>
            <SectionHead><SectionLabel>Meal</SectionLabel></SectionHead>
            <Chips role="group" aria-label="Meal">
              {MEALS.map(m => (
                <Chip key={m.key} type="button" $active={meal === m.key} aria-pressed={meal === m.key}
                  onClick={() => setMeal(meal === m.key ? '' : m.key)}>{m.label}</Chip>
              ))}
            </Chips>
          </Section>
          <Section>
            <Toggle checked={pantry} onChange={setPantry} label="It may add pantry basics" />
            <FieldNote>Salt, oil, butter, flour, sugar, dried spices and stock. Off, it uses only what you list.</FieldNote>
          </Section>
          <AllergyTick allergies={allergies} checked={withAllergies} onChange={setWithAllergies} />
          <Section>
            <SectionHead><SectionLabel as="label" htmlFor="ai-recipe-prefs">Anything else?</SectionLabel></SectionHead>
            <BoxText id="ai-recipe-prefs" value={preferences} maxLength={600} onChange={e => setPreferences(e.target.value)}
              placeholder="e.g. Ready in 30 minutes, one pan, not spicy" />
          </Section>
        </SetupForm>
      )}
      {step === 'share' && request && (<>
        {error && <KitchenNote $error role="alert">{error}</KitchenNote>}
        <AiSharePrompt provider={aiProviderName()} lines={request.shared} approxTokens={request.approxTokens} />
      </>)}
      {step === 'working' && <KitchenCenter role="status"><Spinner size={32} />Writing a recipe…</KitchenCenter>}
      {(step === 'review' || step === 'saving') && idea && (<>
        {error && <KitchenNote $error role="alert">{error}</KitchenNote>}
        <KitchenNote>{ALLERGEN_NOTE}</KitchenNote>
        <ReviewSection aria-label="Recipe">
          <Title>{idea.recipe.fields.recipeName}</Title>
          {hits.length > 0 && <AllergenFlag $flush>May contain {hits.join(', ')}</AllergenFlag>}
          {idea.extras.length > 0 && <ReviewDetail $flush>You’d also need: {idea.extras.join(', ')}</ReviewDetail>}
          <RecipeDetails fields={idea.recipe.fields} flush />
        </ReviewSection>
      </>)}
      {step === 'saved' && idea && (
        <KitchenNote role="status">Saved “{idea.recipe.fields.recipeName}” to Recipes.</KitchenNote>
      )}
    </Modal>
  );
}

/** The page pill that opens it: shown only while AI kitchen is on and agreed to in this browser */
export function RecipeFromIngredientsButton() {
  const on = useAiFeatureEnabled('aiKitchen');
  const [open, setOpen] = useState(false);
  if (!on) return null;
  return (<>
    <PillButton type="button" $variant="neutral" title="Make a recipe from what you have, with AI" onClick={() => setOpen(true)}>
      Recipe from ingredients
    </PillButton>
    {open && <AiRecipeFromIngredients onClose={() => setOpen(false)} />}
  </>);
}
