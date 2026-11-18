import { useId, type ReactNode } from 'react';
import { TimerPopButton, PillPick } from './TaskCardFields.js';
import { Icon } from '../../atoms/core/Icon.jsx';
import type { ExerciseFieldValues } from '../../../types/fields.js';
import { EXERCISE_TYPES } from '../../../utils/exerciseSummary.js';
import {
  FormWrap, Section, SectionHead, SectionLabel, Chips, Chip, Segments, Segment,
  Strip, Cell, CellHead, CellValue, CellInput, Unit, UnitPill, TextAction,
  DateTimeBox, DateTimeField, BoxText, FieldNote,
} from './formKit.js';
export type { ExerciseFieldValues } from '../../../types/fields.js';

/* Exercise fields — the same form in the journal editor, Quick Entry and the
   Health dashboard's Log Exercise: Activity as outline chips, Intensity as a
   segmented control, a Stats strip (duration, distance with a mi ⇄ km pill,
   calories with Estimate), When as a date | time box, and Notes. Props only. */

const ACTIVITY_LABEL: Record<string, string> = { strength: 'Strength' };

const INTENSITIES: { value: ExerciseFieldValues['intensity']; label: string }[] = [
  { value: 'low', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'Hard' },
];

interface ExerciseFieldsProps {
  values: ExerciseFieldValues;
  onChange: (values: ExerciseFieldValues) => void;
  /** AI calorie estimate — the Estimate action shows only when this is provided */
  onEstimateCalories?: () => void;
  estimatingCalories?: boolean;
  calorieError?: string;
  /** Categories from your training plans — shown as Training category chips */
  categoryOptions?: string[];
  /** The entry's Time panel, opened from a stopwatch at the right of Duration */
  timer?: ReactNode;
  timerRunning?: boolean;
}

export function ExerciseFields({ values, onChange, onEstimateCalories, estimatingCalories, calorieError, categoryOptions = [], timer, timerRunning }: ExerciseFieldsProps) {
  const set = (patch: Partial<ExerciseFieldValues>) => onChange({ ...values, ...patch });
  const numeric = (v: string) => v.replace(/[^\d.]/g, '');
  const aiCalories = values.caloriesSource === 'ai' && !!values.calories;
  const notesId = useId();
  const category = values.trainingCategory ?? '';
  // A category no plan lists any more still shows while it's set
  const categories = category && !categoryOptions.some(c => c.toLowerCase() === category.toLowerCase())
    ? [...categoryOptions, category] : categoryOptions;

  return (
    <FormWrap>
      <Section aria-label="Activity">
        <SectionHead><SectionLabel>Activity</SectionLabel></SectionHead>
        {/* The chips wrap within about two thirds of the row, not its full width */}
        <Chips style={{ maxWidth: 'max(66%, 300px)' }}>
          {EXERCISE_TYPES.map(t => (
            <Chip key={t.value} type="button" $active={values.exerciseType === t.value} aria-pressed={values.exerciseType === t.value}
              onClick={() => set({ exerciseType: t.value })}>
              {ACTIVITY_LABEL[t.value] ?? t.label}
            </Chip>
          ))}
        </Chips>
      </Section>

      <Section aria-label="Intensity">
        <SectionHead><SectionLabel>Intensity</SectionLabel></SectionHead>
        <Segments role="radiogroup" aria-label="Intensity" style={{ justifySelf: 'start' }}>
          {INTENSITIES.map(i => (
            <Segment key={i.value} type="button" role="radio" aria-checked={values.intensity === i.value}
              $active={values.intensity === i.value} onClick={() => set({ intensity: i.value })}>
              {i.label}
            </Segment>
          ))}
        </Segments>
      </Section>

      <Section aria-label="Stats">
        <SectionHead><SectionLabel>Stats</SectionLabel></SectionHead>
        <Strip $cols={3}>
          <Cell style={timer ? { position: 'relative' } : undefined}>
            <CellHead>Duration</CellHead>
            {/* The timer in the box's top-right corner: view the time, start one, add time */}
            {timer && <span style={{ position: 'absolute', top: 4, right: 4 }}><TimerPopButton timer={timer} running={timerRunning} /></span>}
            <CellValue>
              <CellInput inputMode="numeric" value={values.duration} placeholder="0" aria-label="Duration (min)"
                onChange={e => set({ duration: numeric(e.target.value) })} />
              <Unit>min</Unit>
            </CellValue>
          </Cell>
          <Cell>
            <CellHead>Distance</CellHead>
            <CellValue>
              <CellInput inputMode="decimal" value={values.distance} placeholder="0" aria-label={`Distance (${values.distanceUnit === 'km' ? 'km' : 'mi'})`}
                onChange={e => set({ distance: numeric(e.target.value) })} />
              <UnitPill type="button" title="Switch miles / kilometers"
                aria-label={values.distanceUnit === 'km' ? 'Kilometers — switch to miles' : 'Miles — switch to kilometers'}
                onClick={e => { e.preventDefault(); set({ distanceUnit: values.distanceUnit === 'km' ? 'miles' : 'km' }); }}>
                {values.distanceUnit === 'km' ? 'km' : 'mi'}
              </UnitPill>
            </CellValue>
          </Cell>
          <Cell>
            <CellHead>
              Calories
              {onEstimateCalories && (
                <TextAction type="button" disabled={estimatingCalories}
                  onClick={e => { e.preventDefault(); onEstimateCalories(); }}>
                  {estimatingCalories ? 'Estimating…' : 'Estimate'}
                </TextAction>
              )}
            </CellHead>
            <CellValue>
              <CellInput inputMode="numeric" value={values.calories} placeholder="0" $ai={aiCalories}
                aria-label={`Calories${aiCalories ? ', AI estimate' : ''}`}
                onChange={e => set({ calories: numeric(e.target.value), caloriesSource: 'manual' })} />
              <Unit>kcal</Unit>
            </CellValue>
          </Cell>
        </Strip>
        {calorieError
          ? <FieldNote $error role="status">{calorieError}</FieldNote>
          : aiCalories && <FieldNote><em>Italic</em> calories are an AI estimate. Edit to override.</FieldNote>}
      </Section>

      {categories.length > 0 && (
        <Section aria-label="Training category">
          <SectionHead><SectionLabel>Training category</SectionLabel></SectionHead>
          {/* A pill dropdown (the task card's look): None, then the plans' categories */}
          <div>
            <PillPick>
              <span className="value">{categories.find(c => c.toLowerCase() === category.toLowerCase()) ?? 'None'}</span>
              <Icon name="chevron-down" size={14} strokeWidth={2} />
              <select aria-label="Training category" value={categories.find(c => c.toLowerCase() === category.toLowerCase()) ?? ''}
                onChange={e => set({ trainingCategory: e.target.value })}>
                <option value="">None</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </PillPick>
          </div>
          {!category && <FieldNote>None picked. It counts by its activity.</FieldNote>}
        </Section>
      )}

      <Section aria-label="When">
        <SectionHead><SectionLabel>When</SectionLabel></SectionHead>
        {/* Just as wide as a date and a time need */}
        <DateTimeBox style={{ maxWidth: 400 }}>
          <DateTimeField type="date" value={values.performedDate} aria-label="Date"
            onChange={e => set({ performedDate: e.target.value })} />
          <DateTimeField type="time" value={values.performedTime} aria-label="Time"
            onChange={e => set({ performedTime: e.target.value })} />
        </DateTimeBox>
      </Section>

      <Section>
        <SectionHead><SectionLabel as="label" htmlFor={notesId}>Notes</SectionLabel></SectionHead>
        <BoxText id={notesId} value={values.notes} placeholder="Additional details"
          onChange={e => set({ notes: e.target.value })} />
      </Section>
    </FormWrap>
  );
}
