/**
 * Health correlation analysis — all client-side computation on decrypted data.
 * Ported from chronicles-original, adapted for rebuild's number IDs and metadata structure.
 */

// ── Types ──

export interface CorrelationResult {
  trigger: { id: string; name: string; type: 'food' | 'medication' | 'exercise' };
  symptom: { name: string };
  correlation: number; // 0–100%
  occurrences: number;
  totalSymptomOccurrences: number;
  avgTimeToSymptom: number; // minutes
}

export interface DecryptedSymptom {
  id: number;
  name: string;
  occurredAt: string; // ISO or YYYY-MM-DD + time
  severity: number;
}

export interface DecryptedFood {
  id: number;
  name: string;
  consumedAt: string;
  ingredients: string[];
  calories?: number;
  mealType?: string;
}

export interface DecryptedMedicationLog {
  id: string;
  medicationPostId: number;
  medicationName: string;
  takenAt: string;
}

export interface DecryptedExercise {
  id: number;
  name: string;
  exerciseType: string;
  duration: number;
  intensity: string;
  performedAt: string;
}

export interface FrequencyData {
  period: string;
  count: number;
}

export interface SeverityTrendData {
  date: string;
  avgSeverity: number;
  maxSeverity: number;
}

export interface ExerciseImpactResult {
  exerciseType: string;
  avgSeverityBefore: number;
  avgSeverityAfter: number;
  improvement: number;
  occurrences: number;
}

export interface ExerciseFrequencyData {
  period: string;
  count: number;
  totalDuration: number;
}

export interface SymptomCoOccurrenceResult {
  symptom1: { name: string };
  symptom2: { name: string };
  coOccurrences: number;
  correlation: number;
  avgTimeBetween: number; // minutes
}

// ── Correlations: food/medication → symptom ──

export function calculateCorrelations(
  symptoms: DecryptedSymptom[],
  food: DecryptedFood[],
  medicationLogs: DecryptedMedicationLog[],
  timeWindowHours = 4
): CorrelationResult[] {
  const correlations = new Map<string, {
    trigger: CorrelationResult['trigger'];
    symptomName: string;
    occurrences: number;
    timeGaps: number[];
  }>();
  const symptomCounts = new Map<string, number>();

  for (const symptom of symptoms) {
    const symptomTime = new Date(symptom.occurredAt).getTime();
    const key = symptom.name.toLowerCase();
    symptomCounts.set(key, (symptomCounts.get(key) || 0) + 1);
    const windowMs = timeWindowHours * 3600000;

    // Food → symptom (by ingredient)
    for (const f of food) {
      const diff = symptomTime - new Date(f.consumedAt).getTime();
      if (diff > 0 && diff <= windowMs) {
        for (const ingredient of f.ingredients) {
          const ck = `food:${ingredient.toLowerCase()}:${key}`;
          if (!correlations.has(ck)) {
            correlations.set(ck, { trigger: { id: ingredient, name: ingredient, type: 'food' }, symptomName: symptom.name, occurrences: 0, timeGaps: [] });
          }
          const d = correlations.get(ck)!;
          d.occurrences++;
          d.timeGaps.push(diff / 60000);
        }
      }
    }

    // Medication → symptom
    for (const log of medicationLogs) {
      const diff = symptomTime - new Date(log.takenAt).getTime();
      if (diff > 0 && diff <= windowMs) {
        const ck = `med:${log.medicationPostId}:${key}`;
        if (!correlations.has(ck)) {
          correlations.set(ck, { trigger: { id: String(log.medicationPostId), name: log.medicationName, type: 'medication' }, symptomName: symptom.name, occurrences: 0, timeGaps: [] });
        }
        const d = correlations.get(ck)!;
        d.occurrences++;
        d.timeGaps.push(diff / 60000);
      }
    }
  }

  return buildCorrelationResults(correlations, symptomCounts);
}

// ── Exercise → symptom correlations ──

export function calculateExerciseCorrelations(
  symptoms: DecryptedSymptom[],
  exercises: DecryptedExercise[],
  timeWindowHours = 24
): CorrelationResult[] {
  const correlations = new Map<string, {
    trigger: CorrelationResult['trigger'];
    symptomName: string;
    occurrences: number;
    timeGaps: number[];
  }>();
  const symptomCounts = new Map<string, number>();

  for (const symptom of symptoms) {
    const symptomTime = new Date(symptom.occurredAt).getTime();
    const key = symptom.name.toLowerCase();
    symptomCounts.set(key, (symptomCounts.get(key) || 0) + 1);
    const windowMs = timeWindowHours * 3600000;

    for (const ex of exercises) {
      const diff = symptomTime - new Date(ex.performedAt).getTime();
      if (diff > 0 && diff <= windowMs) {
        const ck = `exercise:${ex.exerciseType.toLowerCase()}:${key}`;
        if (!correlations.has(ck)) {
          const name = ex.exerciseType.charAt(0).toUpperCase() + ex.exerciseType.slice(1);
          correlations.set(ck, { trigger: { id: ex.exerciseType, name, type: 'exercise' }, symptomName: symptom.name, occurrences: 0, timeGaps: [] });
        }
        const d = correlations.get(ck)!;
        d.occurrences++;
        d.timeGaps.push(diff / 60000);
      }
    }
  }

  return buildCorrelationResults(correlations, symptomCounts);
}

function buildCorrelationResults(
  correlations: Map<string, { trigger: CorrelationResult['trigger']; symptomName: string; occurrences: number; timeGaps: number[] }>,
  symptomCounts: Map<string, number>
): CorrelationResult[] {
  const results: CorrelationResult[] = [];
  for (const [, data] of correlations) {
    const total = symptomCounts.get(data.symptomName.toLowerCase()) || 1;
    const correlation = Math.round((data.occurrences / total) * 100);
    const avg = data.timeGaps.length > 0 ? Math.round(data.timeGaps.reduce((a, b) => a + b, 0) / data.timeGaps.length) : 0;
    if (data.occurrences >= 2 && correlation >= 25) {
      results.push({ trigger: data.trigger, symptom: { name: data.symptomName }, correlation, occurrences: data.occurrences, totalSymptomOccurrences: total, avgTimeToSymptom: avg });
    }
  }
  return results.sort((a, b) => b.correlation - a.correlation);
}

// ── Symptom frequency ──

export function calculateSymptomFrequency(
  symptoms: DecryptedSymptom[],
  groupBy: 'day' | 'week' | 'month'
): FrequencyData[] {
  const counts = new Map<string, number>();
  for (const s of symptoms) {
    const date = new Date(s.occurredAt);
    let key: string;
    if (groupBy === 'day') key = date.toISOString().split('T')[0];
    else if (groupBy === 'week') { const ws = new Date(date); ws.setDate(date.getDate() - date.getDay()); key = `W${ws.toISOString().split('T')[0]}`; }
    else key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries()).map(([period, count]) => ({ period, count })).sort((a, b) => a.period.localeCompare(b.period));
}

// ── Severity trend ──

export function calculateSeverityTrend(
  symptoms: DecryptedSymptom[],
  groupBy: 'day' | 'week'
): SeverityTrendData[] {
  const severities = new Map<string, number[]>();
  for (const s of symptoms) {
    const date = new Date(s.occurredAt);
    let key: string;
    if (groupBy === 'day') key = date.toISOString().split('T')[0];
    else { const ws = new Date(date); ws.setDate(date.getDate() - date.getDay()); key = ws.toISOString().split('T')[0]; }
    if (!severities.has(key)) severities.set(key, []);
    severities.get(key)!.push(s.severity);
  }
  return Array.from(severities.entries())
    .map(([date, values]) => ({ date, avgSeverity: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10, maxSeverity: Math.max(...values) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ── Exercise impact on symptoms ──

export function calculateExerciseImpact(
  symptoms: DecryptedSymptom[],
  exercises: DecryptedExercise[],
  hoursAfter = 24
): ExerciseImpactResult[] {
  const impactByType = new Map<string, { before: number[]; after: number[] }>();
  const windowMs = hoursAfter * 3600000;

  for (const ex of exercises) {
    const exTime = new Date(ex.performedAt).getTime();
    const before = symptoms.filter(s => { const t = new Date(s.occurredAt).getTime(); return t < exTime && exTime - t <= windowMs; });
    const after = symptoms.filter(s => { const t = new Date(s.occurredAt).getTime(); return t > exTime && t - exTime <= windowMs; });

    if (before.length > 0 || after.length > 0) {
      const key = ex.exerciseType.toLowerCase();
      if (!impactByType.has(key)) impactByType.set(key, { before: [], after: [] });
      const d = impactByType.get(key)!;
      before.forEach(s => d.before.push(s.severity));
      after.forEach(s => d.after.push(s.severity));
    }
  }

  const results: ExerciseImpactResult[] = [];
  for (const [type, data] of impactByType) {
    if (data.before.length === 0 && data.after.length === 0) continue;
    const avgB = data.before.length > 0 ? data.before.reduce((a, b) => a + b, 0) / data.before.length : 0;
    const avgA = data.after.length > 0 ? data.after.reduce((a, b) => a + b, 0) / data.after.length : 0;
    const improvement = avgB > 0 ? Math.round((avgB - avgA) * 10) / 10 : 0;
    results.push({ exerciseType: type.charAt(0).toUpperCase() + type.slice(1), avgSeverityBefore: Math.round(avgB * 10) / 10, avgSeverityAfter: Math.round(avgA * 10) / 10, improvement, occurrences: data.before.length + data.after.length });
  }
  return results.sort((a, b) => b.improvement - a.improvement);
}

// ── Exercise frequency ──

export function calculateExerciseFrequency(
  exercises: DecryptedExercise[],
  groupBy: 'day' | 'week' | 'month'
): ExerciseFrequencyData[] {
  const data = new Map<string, { count: number; duration: number }>();
  for (const ex of exercises) {
    const date = new Date(ex.performedAt);
    let key: string;
    if (groupBy === 'day') key = date.toISOString().split('T')[0];
    else if (groupBy === 'week') { const ws = new Date(date); ws.setDate(date.getDate() - date.getDay()); key = `W${ws.toISOString().split('T')[0]}`; }
    else key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!data.has(key)) data.set(key, { count: 0, duration: 0 });
    const d = data.get(key)!;
    d.count++;
    d.duration += ex.duration || 0;
  }
  return Array.from(data.entries()).map(([period, d]) => ({ period, count: d.count, totalDuration: d.duration })).sort((a, b) => a.period.localeCompare(b.period));
}

// ── Wellness types ──

export interface DecryptedWellness {
  id: number;
  date: string; // YYYY-MM-DD
  waterGlasses: number;
  waterGoal: number;
  moodScore: number;   // 1–5, 0 = unset
  sleepHours: number;  // 0–12, 0 = unset
  sleepQuality: number; // 1–5, 0 = unset
  periodToday?: boolean;
  flowIntensity?: string;
}

export interface WellnessTrendPoint {
  date: string;
  waterGlasses: number;
  waterGoal: number;
  moodScore: number;
  sleepHours: number;
  sleepQuality: number;
}

export interface WellnessInsight {
  label: string;
  high: string;
  low: string;
  dataPoints: number;
  direction: 'positive' | 'negative' | 'neutral';
}

// ── Wellness trend ──

export function calculateWellnessTrend(wellness: DecryptedWellness[]): WellnessTrendPoint[] {
  return [...wellness]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(w => ({
      date: w.date,
      waterGlasses: w.waterGlasses,
      waterGoal: w.waterGoal || 8,
      moodScore: w.moodScore,
      sleepHours: w.sleepHours,
      sleepQuality: w.sleepQuality,
    }));
}

// ── Wellness cross-correlations ──

export function calculateWellnessInsights(
  wellness: DecryptedWellness[],
  symptoms: DecryptedSymptom[],
  exercises: DecryptedExercise[]
): WellnessInsight[] {
  const insights: WellnessInsight[] = [];
  const sorted = [...wellness].sort((a, b) => a.date.localeCompare(b.date));

  // Sleep quality → next-day mood
  const sleepMoodPairs: { sleepQ: number; nextMood: number }[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const today = sorted[i];
    const tomorrow = sorted[i + 1];
    const d1 = new Date(today.date + 'T12:00:00');
    const d2 = new Date(tomorrow.date + 'T12:00:00');
    const diffDays = Math.round((d2.getTime() - d1.getTime()) / 86400000);
    if (diffDays !== 1) continue;
    if (today.sleepQuality > 0 && tomorrow.moodScore > 0) {
      sleepMoodPairs.push({ sleepQ: today.sleepQuality, nextMood: tomorrow.moodScore });
    }
  }
  if (sleepMoodPairs.length >= 3) {
    const good = sleepMoodPairs.filter(p => p.sleepQ >= 4);
    const poor = sleepMoodPairs.filter(p => p.sleepQ <= 2);
    if (good.length > 0 && poor.length > 0) {
      const avgGoodMood = good.reduce((s, p) => s + p.nextMood, 0) / good.length;
      const avgPoorMood = poor.reduce((s, p) => s + p.nextMood, 0) / poor.length;
      insights.push({
        label: 'Sleep quality → next-day mood',
        high: `After good sleep (4-5★): avg mood ${avgGoodMood.toFixed(1)}/5`,
        low: `After poor sleep (1-2★): avg mood ${avgPoorMood.toFixed(1)}/5`,
        dataPoints: sleepMoodPairs.length,
        direction: avgGoodMood > avgPoorMood + 0.3 ? 'positive' : 'neutral',
      });
    }
  }

  // Water intake → same-day symptom count
  const symptomDates = new Map<string, number>();
  for (const s of symptoms) {
    const date = s.occurredAt.split('T')[0];
    symptomDates.set(date, (symptomDates.get(date) || 0) + 1);
  }
  const waterSymPairs = sorted
    .filter(w => w.waterGlasses > 0)
    .map(w => ({ water: w.waterGlasses, sx: symptomDates.get(w.date) || 0 }));
  if (waterSymPairs.length >= 4) {
    const low = waterSymPairs.filter(p => p.water <= 4);
    const high = waterSymPairs.filter(p => p.water >= 6);
    if (low.length > 0 && high.length > 0) {
      const avgLowSx = low.reduce((s, p) => s + p.sx, 0) / low.length;
      const avgHighSx = high.reduce((s, p) => s + p.sx, 0) / high.length;
      insights.push({
        label: 'Water intake → symptoms',
        high: `6+ glasses: avg ${avgHighSx.toFixed(1)} symptoms/day`,
        low: `≤4 glasses: avg ${avgLowSx.toFixed(1)} symptoms/day`,
        dataPoints: waterSymPairs.length,
        direction: avgHighSx < avgLowSx - 0.2 ? 'positive' : 'neutral',
      });
    }
  }

  // Exercise → same-night sleep quality
  const exerciseDates = new Set(exercises.map(e => e.performedAt.split('T')[0]));
  const exSleepPairs = sorted
    .filter(w => w.sleepQuality > 0)
    .map(w => ({ exercised: exerciseDates.has(w.date), sleepQ: w.sleepQuality }));
  if (exSleepPairs.length >= 4) {
    const withEx = exSleepPairs.filter(p => p.exercised);
    const withoutEx = exSleepPairs.filter(p => !p.exercised);
    if (withEx.length > 0 && withoutEx.length > 0) {
      const avgWith = withEx.reduce((s, p) => s + p.sleepQ, 0) / withEx.length;
      const avgWithout = withoutEx.reduce((s, p) => s + p.sleepQ, 0) / withoutEx.length;
      insights.push({
        label: 'Exercise → sleep quality',
        high: `Exercise days: avg ${avgWith.toFixed(1)}/5 quality`,
        low: `Rest days: avg ${avgWithout.toFixed(1)}/5 quality`,
        dataPoints: exSleepPairs.length,
        direction: avgWith > avgWithout + 0.2 ? 'positive' : 'neutral',
      });
    }
  }

  // Mood → same-day symptom severity
  const sxSeverityByDate = new Map<string, { total: number; count: number }>();
  for (const s of symptoms) {
    const date = s.occurredAt.split('T')[0];
    const e = sxSeverityByDate.get(date) || { total: 0, count: 0 };
    e.total += s.severity; e.count++;
    sxSeverityByDate.set(date, e);
  }
  const moodSxPairs = sorted
    .filter(w => w.moodScore > 0 && sxSeverityByDate.has(w.date))
    .map(w => { const sx = sxSeverityByDate.get(w.date)!; return { mood: w.moodScore, avgSx: sx.total / sx.count }; });
  if (moodSxPairs.length >= 3) {
    const highMood = moodSxPairs.filter(p => p.mood >= 4);
    const lowMood  = moodSxPairs.filter(p => p.mood <= 2);
    if (highMood.length > 0 && lowMood.length > 0) {
      const avgHighSx = highMood.reduce((s, p) => s + p.avgSx, 0) / highMood.length;
      const avgLowSx  = lowMood.reduce((s, p) => s + p.avgSx, 0) / lowMood.length;
      insights.push({
        label: 'Mood → symptom severity (same day)',
        high: `High mood (4-5): avg severity ${avgHighSx.toFixed(1)}/10`,
        low: `Low mood (1-2): avg severity ${avgLowSx.toFixed(1)}/10`,
        dataPoints: moodSxPairs.length,
        direction: avgHighSx < avgLowSx - 0.5 ? 'positive' : 'neutral',
      });
    }
  }

  return insights;
}

// ── Symptom co-occurrences ──

export function calculateSymptomCoOccurrences(
  symptoms: DecryptedSymptom[],
  timeWindowHours = 24
): SymptomCoOccurrenceResult[] {
  const coOccurrences = new Map<string, { s1: string; s2: string; count: number; timeGaps: number[] }>();
  const symptomCounts = new Map<string, number>();
  const windowMs = timeWindowHours * 3600000;

  for (const s of symptoms) symptomCounts.set(s.name.toLowerCase(), (symptomCounts.get(s.name.toLowerCase()) || 0) + 1);

  for (let i = 0; i < symptoms.length; i++) {
    const s1 = symptoms[i];
    const t1 = new Date(s1.occurredAt).getTime();
    const n1 = s1.name.toLowerCase();
    for (let j = i + 1; j < symptoms.length; j++) {
      const s2 = symptoms[j];
      const n2 = s2.name.toLowerCase();
      if (n1 === n2) continue;
      const diff = Math.abs(new Date(s2.occurredAt).getTime() - t1);
      if (diff <= windowMs) {
        const [first, second] = [n1, n2].sort();
        const ck = `${first}:${second}`;
        if (!coOccurrences.has(ck)) coOccurrences.set(ck, { s1: first, s2: second, count: 0, timeGaps: [] });
        const d = coOccurrences.get(ck)!;
        d.count++;
        d.timeGaps.push(diff / 60000);
      }
    }
  }

  const results: SymptomCoOccurrenceResult[] = [];
  for (const [, d] of coOccurrences) {
    const minTotal = Math.min(symptomCounts.get(d.s1) || 1, symptomCounts.get(d.s2) || 1);
    const correlation = Math.round((d.count / minTotal) * 100);
    const avg = d.timeGaps.length > 0 ? Math.round(d.timeGaps.reduce((a, b) => a + b, 0) / d.timeGaps.length) : 0;
    if (d.count >= 2 && correlation >= 25) {
      results.push({
        symptom1: { name: d.s1.charAt(0).toUpperCase() + d.s1.slice(1) },
        symptom2: { name: d.s2.charAt(0).toUpperCase() + d.s2.slice(1) },
        coOccurrences: d.count, correlation, avgTimeBetween: avg,
      });
    }
  }
  return results.sort((a, b) => b.correlation - a.correlation);
}
