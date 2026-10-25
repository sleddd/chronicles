/* Exercise entries have no text area — their title is generated from the
   fields, the same way everywhere they're written (journal editor, Health
   dashboard quick log): "Running · 30 min · 3 mi". */

export const EXERCISE_TYPES = [
  { value: 'walking', label: 'Walking' },
  { value: 'running', label: 'Running' },
  { value: 'cycling', label: 'Cycling' },
  { value: 'swimming', label: 'Swimming' },
  { value: 'strength', label: 'Strength Training' },
  { value: 'yoga', label: 'Yoga' },
  { value: 'balance', label: 'Balance' },
  { value: 'breathing', label: 'Breathing' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'other', label: 'Other' },
];

export function exerciseTypeLabel(value: unknown): string {
  return EXERCISE_TYPES.find(t => t.value === value)?.label ?? (typeof value === 'string' ? value : '');
}

/** "Running · 30 min · 3 mi" from an exercise entry's custom fields. */
export function exerciseSummary(fields: Record<string, unknown>): string {
  const str = (k: string) => (typeof fields[k] === 'string' ? (fields[k] as string).trim() : fields[k] != null ? String(fields[k]) : '');
  const unit = fields.distanceUnit === 'km' ? 'km' : 'mi';
  return [
    exerciseTypeLabel(fields.exerciseType),
    str('duration') ? `${str('duration')} min` : '',
    str('distance') ? `${str('distance')} ${unit}` : '',
  ].filter(Boolean).join(' · ');
}
