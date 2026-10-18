import { describe, it, expect } from 'vitest';
import { generatedEntryText, fieldLedSummary } from '@/utils/entryText';

const bookDefs = [{ id: 't', label: 'Title', type: 'text' as const }, { id: 'a', label: 'Author', type: 'text' as const }];
const quoteDefs = [{ id: 'q', label: 'Quote', type: 'text' as const }, { id: 'a', label: 'Author', type: 'text' as const }];

describe('generatedEntryText (shared by journal editor and Quick Entry)', () => {
  it('uses the name field for name-led topics', () => {
    expect(generatedEntryText('Meals', { mealDescription: ' Oatmeal ' })).toBe('Oatmeal');
    expect(generatedEntryText('Medication', { medicationName: 'Montelukast' })).toBe('Montelukast');
    expect(generatedEntryText('Allergy', { allergen: 'Peanuts' })).toBe('Peanuts');
    expect(generatedEntryText('Event', { eventName: 'Dentist' })).toBe('Dentist');
  });

  it('builds exercise titles with the form defaults', () => {
    expect(generatedEntryText('Exercise', { duration: '30' })).toBe('Running · 30 min');
  });

  it('gives an untouched exercise entry no title (never a bare "Running")', () => {
    expect(generatedEntryText('Exercise', {})).toBe('');
    expect(generatedEntryText('Exercise', { notes: '', duration: '' })).toBe('');
    expect(generatedEntryText('Exercise', { exerciseType: 'yoga' })).toBe('Yoga');
  });

  it('formats books and quotes, else joins custom field values', () => {
    expect(generatedEntryText('Books', { _userFields: { t: 'Piranesi', a: 'Susanna Clarke' } }, bookDefs)).toBe('Piranesi — Susanna Clarke');
    expect(fieldLedSummary('Quotes', quoteDefs, { q: 'Be here now', a: 'Ram Dass' })).toBe('“Be here now” — Ram Dass');
    expect(generatedEntryText('Garden', { _userFields: { t: 'Tomatoes', a: 'Bed 2' } }, bookDefs)).toBe('Tomatoes · Bed 2');
  });
});
