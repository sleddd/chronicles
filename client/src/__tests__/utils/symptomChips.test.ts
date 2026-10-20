import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SYMPTOMS, EMPTY_SYMPTOM_CHIPS, symptomChipList, splitSymptoms, hasSymptom, toggleSymptom,
  addSymptomChip, removeSymptomChip,
} from '@/utils/symptomChips';

describe('symptom chips', () => {
  it('shows the built-in list, then the person\'s own, without hidden or repeated ones', () => {
    expect(symptomChipList(EMPTY_SYMPTOM_CHIPS)).toEqual([...DEFAULT_SYMPTOMS]);
    const list = symptomChipList({ added: ['Hives', 'headache'], hidden: ['Cough'] });
    expect(list).toContain('Hives');
    expect(list).not.toContain('Cough');
    expect(list.filter(s => s.toLowerCase() === 'headache')).toHaveLength(1);
    expect(list[list.length - 1]).toBe('Hives');
  });

  it('toggles a symptom in and out of the entry name', () => {
    expect(toggleSymptom('', 'Flare day')).toBe('Flare day');
    expect(toggleSymptom('Flare day', 'Runny nose')).toBe('Flare day, Runny nose');
    expect(toggleSymptom('Flare day, runny nose', 'Runny nose')).toBe('Flare day');
    expect(hasSymptom('Flare day, Runny nose', 'runny nose')).toBe(true);
    expect(splitSymptoms(' Headache ;  Nausea, ')).toEqual(['Headache', 'Nausea']);
  });

  it('adds and removes chips: own ones deleted, built-in ones hidden', () => {
    let c = addSymptomChip(EMPTY_SYMPTOM_CHIPS, '  Hives  ');
    expect(c.added).toEqual(['Hives']);
    expect(addSymptomChip(c, 'hives')).toEqual(c);
    c = removeSymptomChip(c, 'Hives');
    expect(c.added).toEqual([]);
    c = removeSymptomChip(c, 'Cough');
    expect(c.hidden).toEqual(['Cough']);
    c = addSymptomChip(c, 'cough');
    expect(c).toEqual({ added: [], hidden: [] });
  });
});
