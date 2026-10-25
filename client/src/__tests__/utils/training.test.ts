import { describe, it, expect } from 'vitest';
import {
  categoryOf, datedPhases, formatMinutes, minutesByCategory, mountaineeringTemplate,
  phaseIndexOn, phaseWeeks, trainingPlans, type Session,
} from '@/utils/training';
import { cellMinutes, guessExerciseType, mergeTrainingPlan, parseTrainingCsv } from '@/utils/trainingImport';

const text = (html: string) => html.replace(/<[^>]+>/g, '');
let n = 0;
const id = () => `id${++n}`;

const session = (date: string, minutes: number, extra: Partial<Session> = {}): Session =>
  ({ id: 1, date, minutes, distance: 0, unit: 'mi', exerciseType: 'running', category: '', title: '', ...extra });

describe('training plans', () => {
  const { categories, phases } = mountaineeringTemplate(id);
  const [aerobic, legs, core] = categories;

  it('the mountaineering template holds Phase 1 from the tracker and blank later phases', () => {
    expect(categories.map(c => c.name)).toEqual(['Aerobic', 'Leg & glute', 'Core stability', 'Ankle mobility & balance', 'Anaerobic power']);
    expect(phases.map(p => p.name)).toEqual(['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4']);
    expect(Object.values(phases[0].targets).map(Number).reduce((a, b) => a + b)).toBe(10);
    expect(phases[1].targets).toEqual({});
  });

  it('runs phases back to back from the start date', () => {
    const dated = datedPhases('2025-08-18', [{ id: 'a', name: 'P1', weeks: '6', targets: {} }, { id: 'b', name: 'P2', weeks: '4', targets: {} }]);
    expect(dated.map(p => [p.start, p.end, p.weekCount])).toEqual([['2025-08-18', '2025-09-29', 6], ['2025-09-29', '2025-10-27', 4]]);
  });

  it('reads plans from entries and finds the phase a day falls in', () => {
    const plans = trainingPlans([
      { id: 5, content: '<p>Mt Hood</p>', createdAt: '2025-08-01T10:00:00Z', metadata: { _taxonomyId: 3, _customFields: { planName: 'Mt Hood', startDate: '2025-08-18', categories, phases } } },
    ], 3, text);
    expect(plans[0]).toMatchObject({ id: 5, name: 'Mt Hood', active: true });
    expect(phaseIndexOn(plans[0], '2025-08-01')).toBe(-1);
    expect(phaseIndexOn(plans[0], '2025-09-01')).toBe(0);
    expect(phaseIndexOn(plans[0], '2025-10-01')).toBe(1);
    expect(phaseIndexOn(plans[0], '2026-10-01')).toBe(4);
  });

  it('counts a session toward its named category, else by activity', () => {
    expect(categoryOf(session('2025-08-18', 60), categories)).toBe(aerobic.id);
    expect(categoryOf(session('2025-08-18', 30, { exerciseType: 'yoga' }), categories)).toBe(core.id);
    expect(categoryOf(session('2025-08-18', 30, { category: 'leg & GLUTE' }), categories)).toBe(legs.id);
    expect(categoryOf(session('2025-08-18', 30, { category: 'Unknown' }), categories)).toBeNull();
  });

  it('totals minutes per category and lays the phase out week by week', () => {
    const sessions = [session('2025-08-18', 60), session('2025-08-18', 25, { category: 'Leg & glute' }), session('2025-08-25', 60), session('2025-10-01', 99)];
    const [p1] = datedPhases('2025-08-18', phases);
    expect(minutesByCategory(sessions, categories, p1.start, p1.end)).toEqual({ [aerobic.id]: 120, [legs.id]: 25 });
    const weeks = phaseWeeks(p1, sessions, categories);
    expect(weeks).toHaveLength(6);
    expect(weeks[0].days[0].cells[aerobic.id]).toHaveLength(1);
    expect(weeks[0].totals).toEqual({ [aerobic.id]: 60, [legs.id]: 25 });
    expect(weeks[1].days[0].date).toBe('2025-08-25');
  });

  it('formats minutes', () => {
    expect(formatMinutes(90)).toBe('1 h 30 min');
    expect(formatMinutes(60)).toBe('1 h');
    expect(formatMinutes(25)).toBe('25 min');
  });
});

const CSV = `Phase 1 - 10 hours - 6 weeks,,,,,
,Aerobic ( 5 hrs ) ,Leg & Glute ( 2hrs ),Core Stability ( 1.5 hrs ) ,Ankle Mobility & Balance ( 1 hour ) ,Anerobic Power ( 30 min )
Week One,,,,,
Mon - 8.18.25,1 hour ( 4.70 mi ) ,25min,-,-,-
Tues - 8.19.25 - Bookclub ,-,-,-,-,-
Sun - 8.24.25,1 hour ( 5 -7 miles total for day ) ,,30 min swimming ,30 min ( rocks and hiking ) ,
,,,,,
Week Two ,,,,,
Sat - 8.30.25,4 hour ( 10 miles ),30. min ( the steep and up hill ),,hike,hike/sprint run 
Mon - 9.1.25,- SICK,-,,,
Mon - 9.22.25,1 hour ( 4 mil walk),,30 min ( core yoga - arms ),,
Week Six,,,,,`;

describe('training spreadsheet import', () => {
  it('reads times from cells', () => {
    expect(cellMinutes('1 hour ( 4.70 mi )')).toBe(60);
    expect(cellMinutes('25min')).toBe(25);
    expect(cellMinutes('30. min ( the steep and up hill )')).toBe(30);
    expect(cellMinutes('4 hour ( 10 miles )')).toBe(240);
    expect(cellMinutes('Rave')).toBeNull();
    expect(guessExerciseType('30 min swimming', 'Core Stability')).toBe('swimming');
    expect(guessExerciseType('1 hour ( 4 mil walk)', 'Aerobic')).toBe('walking');
    expect(guessExerciseType('1 hour', 'Aerobic')).toBe('cardio');
  });

  it('parses the phase, its categories and every timed cell', () => {
    const imp = parseTrainingCsv(CSV);
    expect(imp).toMatchObject({ phaseName: 'Phase 1', weeks: 6, totalHours: 10, firstDate: '2025-08-18' });
    expect(imp.categories.map(c => [c.name, c.hours])).toEqual([
      ['Aerobic', 5], ['Leg & Glute', 2], ['Core Stability', 1.5], ['Ankle Mobility & Balance', 1], ['Anerobic Power', 0.5],
    ]);
    expect(imp.sessions.map(s => `${s.date} ${s.category} ${s.minutes}`)).toEqual([
      '2025-08-18 Aerobic 60', '2025-08-18 Leg & Glute 25',
      '2025-08-24 Aerobic 60', '2025-08-24 Core Stability 30', '2025-08-24 Ankle Mobility & Balance 30',
      '2025-08-30 Aerobic 240', '2025-08-30 Leg & Glute 30',
      '2025-09-22 Aerobic 60', '2025-09-22 Core Stability 30',
    ]);
    const first = imp.sessions[0];
    expect(first).toMatchObject({ distance: 4.7, unit: 'miles', notes: '' });
    expect(imp.sessions[2]).toMatchObject({ distance: null, notes: '1 hour ( 5 -7 miles total for day )' });
    expect(imp.sessions[3]).toMatchObject({ exerciseType: 'swimming', notes: 'swimming' });
    expect(imp.skipped.map(s => s.text)).toEqual(['hike', 'hike/sprint run', 'SICK']);
  });

  it('folds the phase into a plan, matching categories by name', () => {
    const imp = parseTrainingCsv(CSV);
    const fresh = mergeTrainingPlan(null, imp, 'Mt Hood', id);
    expect(fresh).toMatchObject({ planName: 'Mt Hood', startDate: '2025-08-18', isActive: true });
    expect(fresh.phases).toHaveLength(1);
    expect(fresh.categories).toHaveLength(5);

    const { categories, phases } = mountaineeringTemplate(id);
    const merged = mergeTrainingPlan({ planName: 'Mt Hood', startDate: '2025-09-01', eventDate: '', categories, phases, isActive: true, notes: '' }, imp, 'x', id);
    // "Leg & Glute" matches "Leg & glute"; the misspelt "Anerobic Power" is new
    expect(merged.categories.map(c => c.name)).toContain('Anerobic Power');
    expect(merged.categories).toHaveLength(6);
    expect(merged.phases.map(p => p.name)).toEqual(['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4']);
    expect(merged.phases[0].id).toBe(phases[0].id);
    expect(merged.phases[0].targets[categories[1].id]).toBe('2');
    expect(merged.startDate).toBe('2025-08-18');
  });
});
