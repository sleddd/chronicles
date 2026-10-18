import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import { Icon } from '../atoms/core/Icon.jsx';
import { MaterialIcon } from '../atoms/MaterialIcon.js';
import type { RecipeFieldValues, RecipeIngredient, RecipeStep } from '../../types/fields.js';
import { TickMark } from '../atoms/TickMark.js';

/* =============================================================================
   RecipeEntry — formatted read view for a Recipe entry.

   Layout (per the recipe design mock): category kicker, thin display title,
   italic description, hairline stats band (prep / cook / serves / calories /
   difficulty), hero photo, then a two-column ingredients | method grid that
   stacks on mobile, tags, and a footer action row.
   ========================================================================== */

/* ── Serving scaling ─────────────────────────────────────────────────────── */

const UNICODE_FRACTIONS: Record<string, number> = {
  '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75,
  '⅕': 0.2, '⅙': 1 / 6, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
};

/** Parse the leading quantity of an amount string ("2 slices", "1½ tbsp",
 *  "1 1/2 cups") → [quantity, rest] or null when it doesn't start numeric. */
function parseAmount(amount: string): [number, string] | null {
  const m = amount.trim().match(/^(\d+(?:\.\d+)?)?\s*([½⅓⅔¼¾⅕⅙⅛⅜⅝⅞])?\s*(?:(\d+)\s*\/\s*(\d+))?\s*(.*)$/);
  if (!m) return null;
  const [, whole, uni, num, den, rest] = m;
  let qty = whole ? parseFloat(whole) : 0;
  if (uni) qty += UNICODE_FRACTIONS[uni] ?? 0;
  else if (num && den && parseInt(den, 10) !== 0) qty += parseInt(num, 10) / parseInt(den, 10);
  if (qty === 0) return null;
  return [qty, rest ?? ''];
}

/** Format a scaled quantity back to a friendly string (2, 1.5 → 1½, 0.25 → ¼). */
function formatQty(qty: number): string {
  const whole = Math.floor(qty);
  const frac = qty - whole;
  const NICE: [number, string][] = [
    [0.125, '⅛'], [0.25, '¼'], [1 / 3, '⅓'], [0.375, '⅜'], [0.5, '½'],
    [0.625, '⅝'], [2 / 3, '⅔'], [0.75, '¾'], [0.875, '⅞'],
  ];
  for (const [v, glyph] of NICE) {
    if (Math.abs(frac - v) < 0.02) return `${whole > 0 ? whole : ''}${glyph}`;
  }
  if (frac < 0.02) return String(whole);
  return String(Math.round(qty * 100) / 100);
}

function scaleAmount(amount: string, factor: number): string {
  if (factor === 1) return amount;
  const parsed = parseAmount(amount);
  if (!parsed) return amount;
  const [qty, rest] = parsed;
  return `${formatQty(qty * factor)}${rest ? ` ${rest}` : ''}`;
}

/* ── Styled ──────────────────────────────────────────────────────────────── */

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  margin-top: 20px;
`;

const Kicker = styled.div`
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-accent);
  margin-bottom: 10px;
`;

const Title = styled.h1`
  font-family: var(--font-display);
  font-weight: 300;
  font-size: clamp(30px, 4.5vw, 46px);
  line-height: 1.15;
  color: var(--text-primary);
  margin: 0 0 14px;
`;

/* Title with an accent edit (pencil) icon across from it */
const TitleRow = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  & > h1 { flex: 1 1 auto; min-width: 0; }
`;

const EditIconBtn = styled.button`
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  margin-top: 6px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--color-accent);
  cursor: pointer;
  &:hover { background: var(--bg-hover); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

const Description = styled.p`
  font-family: var(--font-sans);
  font-style: italic;
  font-size: 16px;
  line-height: 1.55;
  color: var(--text-secondary);
  margin: 0 0 26px;
  max-width: 640px;
`;

/* Stats band — hairline top/bottom rules, cells split by hairlines */
const StatsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  border-top: 1px solid var(--border-subtle);
  border-bottom: 1px solid var(--border-subtle);
  margin-bottom: 20px;
`;

const StatCell = styled.div`
  position: relative;
  flex: 1;
  min-width: 90px;
  padding: 14px 18px 16px;
  &:first-child { padding-left: 0; }
  & + & { border-left: 1px solid var(--border-subtle); }
`;

const StatLabel = styled.div`
  font-family: var(--font-label);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  margin-bottom: 6px;
`;

const StatValue = styled.div`
  display: flex;
  align-items: baseline;
  gap: 4px;
  font-family: var(--font-display);
  font-weight: 300;
  font-size: 24px;
  color: var(--text-primary);
`;

const StatUnit = styled.span`
  font-family: var(--font-sans);
  font-size: 11px;
  color: var(--text-tertiary);
`;

/* Serves stepper — quiet ± controls beside the number */
const StepBtn = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  align-self: center;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-tertiary);
  border-radius: var(--r-md, 1px);
  &:hover { color: var(--text-primary); background: var(--bg-hover); }
`;

/* Print — a small icon in the top-right corner of the Serves cell */
const PrintIconBtn = styled.button`
  position: absolute;
  top: 10px;
  right: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  &:hover { color: var(--text-primary); background: var(--bg-hover); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

/* Featured-image slot — sits 20px under the stats bar, 20px above the columns.
   The doubled && beats the banner's own margin-top so the space stays even. */
const HeroSlot = styled.div`
  margin-bottom: 20px;
  && > * { margin-top: 0; margin-bottom: 0; }
`;

/* Hero placeholder — striped block shown when the entry has no featured image */
const Hero = styled.div`
  height: 300px;
  border-radius: var(--r-lg, 2px);
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: repeating-linear-gradient(
    -45deg,
    var(--bg-sunken),
    var(--bg-sunken) 18px,
    var(--bg-hover) 18px,
    var(--bg-hover) 36px
  );
`;

const HeroChip = styled.span`
  font-family: var(--mono, monospace);
  font-size: 12px;
  letter-spacing: 0.08em;
  color: var(--text-tertiary);
  background: var(--bg-surface);
  padding: 6px 12px;
  border-radius: var(--r-md, 1px);
`;

/* Two-column body — stacks on mobile */
const Columns = styled.div`
  display: grid;
  grid-template-columns: 1fr 1.9fr;
  gap: 48px;
  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: 36px;
  }
`;

const ColHeader = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-default);
  margin-bottom: 4px;
`;

const ColLabel = styled.span`
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-secondary);
`;

const ColCount = styled.span`
  font-family: var(--font-label);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-accent);
`;

/* Ingredients */
const IngRow = styled.button`
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 0;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--border-subtle);
  cursor: pointer;
  text-align: left;
`;

const IngCheck = styled.span<{ $checked?: boolean }>`
  flex: none;
  display: inline-flex;
`;

const IngText = styled.span`
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.4;
  color: var(--text-secondary);
`;

const ScaledNote = styled.div`
  font-family: var(--font-sans);
  font-style: italic;
  font-size: 12px;
  color: var(--text-tertiary);
  padding-top: 12px;
`;

/* Method */
const StepRow = styled.div`
  display: flex;
  gap: 20px;
  padding: 16px 0;
  border-bottom: 1px solid var(--border-subtle);
`;

const StepNum = styled.div`
  font-family: var(--font-display);
  font-weight: 300;
  font-size: 26px;
  line-height: 1;
  color: var(--color-accent);
  flex-shrink: 0;
  min-width: 22px;
`;

const StepText = styled.div`
  font-family: var(--font-sans);
  font-size: 14.5px;
  line-height: 1.55;
  color: var(--text-secondary);
  b { font-weight: 700; color: var(--text-primary); }
`;

const FreeTextMethod = styled.div`
  font-family: var(--font-sans);
  font-size: 14.5px;
  line-height: 1.7;
  color: var(--text-secondary);
  white-space: pre-wrap;
  padding: 14px 0;
`;




/* While printing, the recipe is drawn again into a sheet on <body> that
   replaces the app on paper (see GlobalStyle: html.print-sheet-open) */
const PrintSheet = styled.div`
  display: none;
`;

/* ── Component ───────────────────────────────────────────────────────────── */

const CATEGORY_LABEL: Record<string, string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack', dessert: 'Dessert',
};
const DIFFICULTY_LABEL: Record<string, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

interface RecipeEntryProps {
  values: RecipeFieldValues;
  /** Rendered hero (e.g. the entry's featured-image banner); placeholder shown when absent */
  hero?: ReactNode;
  onToggleIngredient: (id: string) => void;
  onEdit: () => void;
  /** Print layout: no footer actions (used for the print sheet) */
  printView?: boolean;
}

export function RecipeEntry({
  values, hero, onToggleIngredient, onEdit, printView,
}: RecipeEntryProps) {
  // Print: draw the recipe into the print sheet, print, then take it away
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    if (!printing) return;
    const html = document.documentElement;
    html.classList.add('print-sheet-open');
    const done = () => { html.classList.remove('print-sheet-open'); setPrinting(false); };
    window.addEventListener('afterprint', done, { once: true });
    const t = window.setTimeout(() => window.print(), 50); // let the sheet render first
    return () => { window.clearTimeout(t); window.removeEventListener('afterprint', done); html.classList.remove('print-sheet-open'); };
  }, [printing]);

  const ingredients: RecipeIngredient[] = values.ingredients ?? [];
  const steps: RecipeStep[] = values.steps ?? [];

  const baseServings = Math.max(1, parseInt(values.servings, 10) || 1);
  const [servings, setServings] = useState(baseServings);
  const factor = servings / baseServings;

  const legacyMethod = !steps.length && values.instructions?.trim();
  const stepCount = steps.length;

  // Legacy values may read "30 min" — the unit is rendered separately
  const minutes = (v?: string) => (v ?? '').replace(/\s*min(ute)?s?\.?\s*$/i, '');

  return (
    <Wrap>
      {values.category && <Kicker>{CATEGORY_LABEL[values.category] ?? values.category}</Kicker>}
      <TitleRow>
        <Title>{values.recipeName?.trim() || 'Untitled recipe'}</Title>
        {!printView && (
          <EditIconBtn type="button" onClick={onEdit} aria-label="Edit recipe" title="Edit recipe" data-print-hide>
            <Icon name="pencil" size={18} strokeWidth={2} />
          </EditIconBtn>
        )}
      </TitleRow>
      {values.description?.trim() && <Description>{values.description}</Description>}

      <StatsRow>
        {values.prepTime?.trim() && (
          <StatCell>
            <StatLabel>Prep</StatLabel>
            <StatValue>{minutes(values.prepTime)}<StatUnit>min</StatUnit></StatValue>
          </StatCell>
        )}
        {values.cookTime?.trim() && (
          <StatCell>
            <StatLabel>Cook</StatLabel>
            <StatValue>{minutes(values.cookTime)}<StatUnit>min</StatUnit></StatValue>
          </StatCell>
        )}
        <StatCell>
          {!printView && (
            <PrintIconBtn type="button" aria-label="Print recipe" title="Print" onClick={() => setPrinting(true)} data-print-hide>
              <MaterialIcon $size={18} aria-hidden="true">print</MaterialIcon>
            </PrintIconBtn>
          )}
          <StatLabel>Serves</StatLabel>
          <StatValue>
            <StepBtn type="button" aria-label="Fewer servings" onClick={() => setServings(s => Math.max(1, s - 1))}>
              <Icon name="minus" size={11} strokeWidth={2.5} />
            </StepBtn>
            {servings}
            <StepBtn type="button" aria-label="More servings" onClick={() => setServings(s => s + 1)}>
              <Icon name="plus" size={11} strokeWidth={2.5} />
            </StepBtn>
          </StatValue>
        </StatCell>
        {values.calories?.trim() && (
          <StatCell>
            <StatLabel>Calories</StatLabel>
            <StatValue>{values.calories}<StatUnit>kcal</StatUnit></StatValue>
          </StatCell>
        )}
        {values.difficulty && (
          <StatCell>
            <StatLabel>Difficulty</StatLabel>
            <StatValue style={{ fontSize: 20 }}>{DIFFICULTY_LABEL[values.difficulty] ?? values.difficulty}</StatValue>
          </StatCell>
        )}
      </StatsRow>

      {hero ? (
        <HeroSlot>{hero}</HeroSlot>
      ) : (
        <Hero>
          <HeroChip>recipe photo</HeroChip>
        </Hero>
      )}

      <Columns>
        {/* Ingredients */}
        <div>
          <ColHeader>
            <ColLabel>Ingredients</ColLabel>
            <ColCount>{ingredients.length}</ColCount>
          </ColHeader>
          {ingredients.map(ing => (
            <IngRow key={ing.id} type="button" onClick={() => onToggleIngredient(ing.id)}>
              <IngCheck $checked={!!ing.checked} aria-hidden>
                <TickMark checked={!!ing.checked} size={18} />
              </IngCheck>
              <IngText>
                {ing.amount?.trim() ? `${scaleAmount(ing.amount, factor)} ` : ''}
                {ing.name}
              </IngText>
            </IngRow>
          ))}
          {ingredients.length > 0 && (
            <ScaledNote>Scaled for {servings} serving{servings === 1 ? '' : 's'} · adjust above</ScaledNote>
          )}
        </div>

        {/* Method */}
        <div>
          <ColHeader>
            <ColLabel>Method</ColLabel>
            {stepCount > 0 && <ColCount>{stepCount} step{stepCount === 1 ? '' : 's'}</ColCount>}
          </ColHeader>
          {steps.map((step, i) => (
            <StepRow key={step.id}>
              <StepNum>{i + 1}</StepNum>
              <StepText>
                {step.title?.trim() && <b>{step.title.trim().replace(/\.?$/, '.')} </b>}
                {step.text}
              </StepText>
            </StepRow>
          ))}
          {legacyMethod && <FreeTextMethod>{values.instructions}</FreeTextMethod>}
        </div>
      </Columns>

      {printing && !printView && createPortal(
        <PrintSheet id="print-sheet">
          <RecipeEntry values={values} hero={hero} onToggleIngredient={() => {}} onEdit={() => {}} printView />
        </PrintSheet>,
        document.body,
      )}
    </Wrap>
  );
}
