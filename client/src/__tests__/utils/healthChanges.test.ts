import { describe, it, expect } from 'vitest';
import { withMedicationChanges, medChangesOf, describeMedChange, collectHealthChanges } from '@/utils/healthChanges';

const med = (patch: Record<string, unknown> = {}) => ({ medicationName: 'Aspirin', dosage: '325 mg', frequency: 'once_daily', scheduleTimes: ['08:00'], isActive: true, ...patch });

describe('withMedicationChanges', () => {
  it('records a new medication as started', () => {
    expect(medChangesOf(withMedicationChanges(null, med(), '2026-10-19'))).toEqual([{ date: '2026-10-19', kind: 'started', to: '325 mg' }]);
  });

  it('records dose, how often and reminder changes', () => {
    const before = med();
    const after = withMedicationChanges(before, med({ dosage: '650 mg', frequency: 'twice_daily', scheduleTimes: ['20:00', '08:00'] }), '2026-10-20');
    expect(medChangesOf(after)).toEqual([
      { date: '2026-10-20', kind: 'dose', from: '325 mg', to: '650 mg' },
      { date: '2026-10-20', kind: 'frequency', from: 'Once daily', to: 'Twice daily' },
      { date: '2026-10-20', kind: 'times', from: '08:00', to: '08:00, 20:00' },
    ]);
    expect(describeMedChange(medChangesOf(after)[0])).toBe('Dose 325 mg → 650 mg');
  });

  it('merges autosaves made while typing into one change, and drops one undone the same day', () => {
    let saved: Record<string, unknown> = med();
    for (const typed of ['6', '65', '650 mg']) saved = withMedicationChanges(saved, { ...med({ dosage: typed }), _changes: medChangesOf(saved) }, '2026-10-20');
    expect(medChangesOf(saved)).toEqual([{ date: '2026-10-20', kind: 'dose', from: '325 mg', to: '650 mg' }]);
    saved = withMedicationChanges(saved, { ...med(), _changes: medChangesOf(saved) }, '2026-10-20');
    expect(medChangesOf(saved)).toEqual([]);
  });

  it('records stopping, and stop + restart the same day cancels out', () => {
    const stopped = withMedicationChanges(med(), med({ isActive: false }), '2026-10-21');
    expect(medChangesOf(stopped)).toEqual([{ date: '2026-10-21', kind: 'stopped' }]);
    const back = withMedicationChanges(stopped, { ...med(), _changes: medChangesOf(stopped) }, '2026-10-21');
    expect(medChangesOf(back)).toEqual([]);
  });

  it('keeps earlier history and leaves an unchanged medication alone', () => {
    const history = [{ date: '2026-09-01', kind: 'started' as const }];
    const same = { ...med(), _changes: history };
    expect(withMedicationChanges(same, same, '2026-10-22')._changes).toEqual(history);
    const plain = med();
    expect(withMedicationChanges(plain, plain, '2026-10-22')).toBe(plain);
  });

  it('a change removed in the editor stays removed', () => {
    const before = { ...med(), _changes: [{ date: '2026-09-01', kind: 'dose', from: 'x', to: 'y' }] };
    expect(medChangesOf(withMedicationChanges(before, { ...med(), _changes: [] }, '2026-10-22'))).toEqual([]);
  });
});

describe('collectHealthChanges', () => {
  const topics = [{ id: 1, name: 'Medication' }, { id: 2, name: 'Changes' }, { id: 3, name: 'Journal' }];
  const entries = [
    { id: 10, content: '<p>Aspirin</p>', createdAt: '2026-09-01T12:00:00', metadata: { _taxonomyId: 1, _customFields: { medicationName: 'Aspirin', _changes: [
      { date: '2026-09-01', kind: 'started', to: '325 mg' }, { date: '2026-10-05', kind: 'dose', from: '325 mg', to: '650 mg' }, { date: '2026-10-20', kind: 'stopped' },
    ] } } },
    { id: 11, content: '<p>Cut out dairy</p>', createdAt: '2026-10-12T09:00:00', metadata: { _taxonomyId: 2, _customFields: { changeWhat: 'Cut out dairy', changeDate: '2026-10-10' } } },
    { id: 12, content: '<p>Hello</p>', createdAt: '2026-10-12T09:00:00', metadata: { _taxonomyId: 3 } },
  ];
  it('lines up medication and other changes in the range, newest first', () => {
    const rows = collectHealthChanges(entries, topics, { from: '2026-10-01', to: '2026-10-31' }, s => s.replace(/<[^>]+>/g, ''));
    expect(rows.map(r => [r.date, r.text, r.source])).toEqual([
      ['2026-10-20', 'Stopped Aspirin', 'medication'],
      ['2026-10-10', 'Cut out dairy', 'other'],
      ['2026-10-05', 'Aspirin dose 325 mg → 650 mg', 'medication'],
    ]);
  });
});
