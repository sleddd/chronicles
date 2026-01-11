export interface CorrelationResult {
  trigger: { id: string; name: string; type: 'food' | 'medication' | 'exercise' };
  symptom: { id: string; name: string };
  correlation: number; // 0-100%
  occurrences: number;
  totalSymptomOccurrences: number;
  avgTimeToSymptom: number; // minutes
}

export interface DecryptedSymptom {
  id: string;
  name: string;
  occurredAt: string;
  severity: number;
  triggers: { triggerId: string; relationshipType: string }[];
}

export interface DecryptedFood {
  id: string;
  name: string;
  consumedAt: string;
  ingredients: string[];
  calories?: number;
  mealType?: 'breakfast' | 'lunch' | 'dinner' | 'snack';
}

export interface DecryptedMedicationLog {
  id: string;
  medicationId: string;
  medicationName: string;
  takenAt: string;
}

export interface DecryptedExercise {
  id: string;
  name: string;
  exerciseType: string;
  duration: number;
  intensity: 'low' | 'medium' | 'high';
  performedAt: string;
}

// Calculate correlations between food/medications and symptoms
export function calculateCorrelations(
  symptoms: DecryptedSymptom[],
  food: DecryptedFood[],
  medicationLogs: DecryptedMedicationLog[],
  timeWindowHours: number = 4
): CorrelationResult[] {
  const correlations: Map<string, {
    trigger: CorrelationResult['trigger'];
    symptom: CorrelationResult['symptom'];
    occurrences: number;
    timeGaps: number[];
  }> = new Map();

  const symptomCounts: Map<string, number> = new Map();

  for (const symptom of symptoms) {
    const symptomTime = new Date(symptom.occurredAt).getTime();
    const key = symptom.name.toLowerCase();
    symptomCounts.set(key, (symptomCounts.get(key) || 0) + 1);

    // Look for food consumed before this symptom
    for (const foodItem of food) {
      const foodTime = new Date(foodItem.consumedAt).getTime();
      const timeDiff = symptomTime - foodTime;
      const timeWindowMs = timeWindowHours * 60 * 60 * 1000;

      // Check if food was consumed 0-4 hours before symptom
      if (timeDiff > 0 && timeDiff <= timeWindowMs) {
        // Check each ingredient
        for (const ingredient of foodItem.ingredients) {
          const correlationKey = `food:${ingredient.toLowerCase()}:${symptom.name.toLowerCase()}`;

          if (!correlations.has(correlationKey)) {
            correlations.set(correlationKey, {
              trigger: { id: ingredient, name: ingredient, type: 'food' },
              symptom: { id: symptom.id, name: symptom.name },
              occurrences: 0,
              timeGaps: [],
            });
          }

          const data = correlations.get(correlationKey)!;
          data.occurrences++;
          data.timeGaps.push(timeDiff / (60 * 1000)); // Convert to minutes
        }
      }
    }

    // Look for medications taken before this symptom
    for (const log of medicationLogs) {
      const logTime = new Date(log.takenAt).getTime();
      const timeDiff = symptomTime - logTime;
      const timeWindowMs = timeWindowHours * 60 * 60 * 1000;

      if (timeDiff > 0 && timeDiff <= timeWindowMs) {
        const correlationKey = `medication:${log.medicationId}:${symptom.name.toLowerCase()}`;

        if (!correlations.has(correlationKey)) {
          correlations.set(correlationKey, {
            trigger: { id: log.medicationId, name: log.medicationName, type: 'medication' },
            symptom: { id: symptom.id, name: symptom.name },
            occurrences: 0,
            timeGaps: [],
          });
        }

        const data = correlations.get(correlationKey)!;
        data.occurrences++;
        data.timeGaps.push(timeDiff / (60 * 1000));
      }
    }

    // Also check explicit triggers (manually linked)
    for (const trigger of symptom.triggers || []) {
      if (trigger.relationshipType === 'food_symptom') {
        const foodItem = food.find(f => f.id === trigger.triggerId);
        if (foodItem) {
          const correlationKey = `food_explicit:${foodItem.id}:${symptom.name.toLowerCase()}`;

          if (!correlations.has(correlationKey)) {
            correlations.set(correlationKey, {
              trigger: { id: foodItem.id, name: foodItem.name, type: 'food' },
              symptom: { id: symptom.id, name: symptom.name },
              occurrences: 0,
              timeGaps: [],
            });
          }

          const data = correlations.get(correlationKey)!;
          data.occurrences++;

          const foodTime = new Date(foodItem.consumedAt).getTime();
          const timeDiff = symptomTime - foodTime;
          if (timeDiff > 0) {
            data.timeGaps.push(timeDiff / (60 * 1000));
          }
        }
      }
    }
  }

  // Calculate correlation percentages
  const results: CorrelationResult[] = [];

  for (const [, data] of correlations) {
    const symptomKey = data.symptom.name.toLowerCase();
    const totalSymptomOccurrences = symptomCounts.get(symptomKey) || 1;
    const correlation = Math.round((data.occurrences / totalSymptomOccurrences) * 100);
    const avgTimeToSymptom = data.timeGaps.length > 0
      ? Math.round(data.timeGaps.reduce((a, b) => a + b, 0) / data.timeGaps.length)
      : 0;

    // Only include correlations with at least 2 occurrences and 25% correlation
    if (data.occurrences >= 2 && correlation >= 25) {
      results.push({
        trigger: data.trigger,
        symptom: data.symptom,
        correlation,
        occurrences: data.occurrences,
        totalSymptomOccurrences,
        avgTimeToSymptom,
      });
    }
  }

  // Sort by correlation percentage descending
  return results.sort((a, b) => b.correlation - a.correlation);
}

// Calculate symptom frequency by period
export interface FrequencyData {
  period: string;
  count: number;
}

export function calculateSymptomFrequency(
  symptoms: DecryptedSymptom[],
  groupBy: 'day' | 'week' | 'month'
): FrequencyData[] {
  const counts: Map<string, number> = new Map();

  for (const symptom of symptoms) {
    const date = new Date(symptom.occurredAt);
    let key: string;

    switch (groupBy) {
      case 'day':
        key = date.toISOString().split('T')[0];
        break;
      case 'week': {
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = `W${weekStart.toISOString().split('T')[0]}`;
        break;
      }
      case 'month':
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        break;
    }

    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([period, count]) => ({ period, count }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

// Calculate severity trends over time
export interface SeverityTrendData {
  date: string;
  avgSeverity: number;
  maxSeverity: number;
}

export function calculateSeverityTrend(
  symptoms: DecryptedSymptom[],
  groupBy: 'day' | 'week'
): SeverityTrendData[] {
  const severities: Map<string, number[]> = new Map();

  for (const symptom of symptoms) {
    const date = new Date(symptom.occurredAt);
    let key: string;

    switch (groupBy) {
      case 'day':
        key = date.toISOString().split('T')[0];
        break;
      case 'week': {
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = weekStart.toISOString().split('T')[0];
        break;
      }
    }

    if (!severities.has(key)) {
      severities.set(key, []);
    }
    severities.get(key)!.push(symptom.severity);
  }

  return Array.from(severities.entries())
    .map(([date, values]) => ({
      date,
      avgSeverity: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10,
      maxSeverity: Math.max(...values),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Exercise impact result - measures how exercise affects symptoms
export interface ExerciseImpactResult {
  exerciseType: string;
  avgSeverityBefore: number;
  avgSeverityAfter: number;
  improvement: number; // positive means symptoms improved after exercise
  occurrences: number;
}

// Calculate exercise impact on symptoms (comparing severity before/after exercise)
export function calculateExerciseImpact(
  symptoms: DecryptedSymptom[],
  exercises: DecryptedExercise[],
  hoursAfter: number = 24
): ExerciseImpactResult[] {
  const impactByType: Map<string, { before: number[]; after: number[] }> = new Map();

  for (const exercise of exercises) {
    const exerciseTime = new Date(exercise.performedAt).getTime();
    const windowMs = hoursAfter * 60 * 60 * 1000;

    // Find symptoms in the window before exercise
    const symptomsBefore = symptoms.filter((s) => {
      const symptomTime = new Date(s.occurredAt).getTime();
      return symptomTime < exerciseTime && exerciseTime - symptomTime <= windowMs;
    });

    // Find symptoms in the window after exercise
    const symptomsAfter = symptoms.filter((s) => {
      const symptomTime = new Date(s.occurredAt).getTime();
      return symptomTime > exerciseTime && symptomTime - exerciseTime <= windowMs;
    });

    if (symptomsBefore.length > 0 || symptomsAfter.length > 0) {
      const typeKey = exercise.exerciseType.toLowerCase();
      if (!impactByType.has(typeKey)) {
        impactByType.set(typeKey, { before: [], after: [] });
      }
      const data = impactByType.get(typeKey)!;

      symptomsBefore.forEach((s) => data.before.push(s.severity));
      symptomsAfter.forEach((s) => data.after.push(s.severity));
    }
  }

  const results: ExerciseImpactResult[] = [];

  for (const [exerciseType, data] of impactByType) {
    if (data.before.length === 0 && data.after.length === 0) continue;

    const avgBefore = data.before.length > 0
      ? data.before.reduce((a, b) => a + b, 0) / data.before.length
      : 0;
    const avgAfter = data.after.length > 0
      ? data.after.reduce((a, b) => a + b, 0) / data.after.length
      : 0;

    // Positive improvement means severity decreased after exercise
    const improvement = avgBefore > 0 ? Math.round((avgBefore - avgAfter) * 10) / 10 : 0;

    results.push({
      exerciseType: exerciseType.charAt(0).toUpperCase() + exerciseType.slice(1),
      avgSeverityBefore: Math.round(avgBefore * 10) / 10,
      avgSeverityAfter: Math.round(avgAfter * 10) / 10,
      improvement,
      occurrences: data.before.length + data.after.length,
    });
  }

  return results.sort((a, b) => b.improvement - a.improvement);
}

// Calculate exercise frequency
export interface ExerciseFrequencyData {
  period: string;
  count: number;
  totalDuration: number; // minutes
}

export function calculateExerciseFrequency(
  exercises: DecryptedExercise[],
  groupBy: 'day' | 'week' | 'month'
): ExerciseFrequencyData[] {
  const data: Map<string, { count: number; duration: number }> = new Map();

  for (const exercise of exercises) {
    const date = new Date(exercise.performedAt);
    let key: string;

    switch (groupBy) {
      case 'day':
        key = date.toISOString().split('T')[0];
        break;
      case 'week': {
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = `W${weekStart.toISOString().split('T')[0]}`;
        break;
      }
      case 'month':
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        break;
    }

    if (!data.has(key)) {
      data.set(key, { count: 0, duration: 0 });
    }
    const d = data.get(key)!;
    d.count++;
    d.duration += exercise.duration || 0;
  }

  return Array.from(data.entries())
    .map(([period, d]) => ({ period, count: d.count, totalDuration: d.duration }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

// Symptom co-occurrence result
export interface SymptomCoOccurrenceResult {
  symptom1: { name: string };
  symptom2: { name: string };
  coOccurrences: number;
  totalSymptom1: number;
  totalSymptom2: number;
  correlation: number; // percentage of times they occur together
  avgTimeBetween: number; // average minutes between occurrences
}

// Calculate symptom co-occurrences (symptoms that tend to occur together)
export function calculateSymptomCoOccurrences(
  symptoms: DecryptedSymptom[],
  timeWindowHours: number = 24
): SymptomCoOccurrenceResult[] {
  const coOccurrences: Map<string, {
    symptom1: string;
    symptom2: string;
    count: number;
    timeGaps: number[];
  }> = new Map();

  const symptomCounts: Map<string, number> = new Map();

  // Count occurrences of each symptom
  for (const symptom of symptoms) {
    const key = symptom.name.toLowerCase();
    symptomCounts.set(key, (symptomCounts.get(key) || 0) + 1);
  }

  // Find co-occurrences within time window
  for (let i = 0; i < symptoms.length; i++) {
    const symptom1 = symptoms[i];
    const time1 = new Date(symptom1.occurredAt).getTime();
    const name1 = symptom1.name.toLowerCase();

    for (let j = i + 1; j < symptoms.length; j++) {
      const symptom2 = symptoms[j];
      const time2 = new Date(symptom2.occurredAt).getTime();
      const name2 = symptom2.name.toLowerCase();

      // Skip if same symptom type
      if (name1 === name2) continue;

      const timeDiff = Math.abs(time2 - time1);
      const timeWindowMs = timeWindowHours * 60 * 60 * 1000;

      // Check if symptoms occurred within time window
      if (timeDiff <= timeWindowMs) {
        // Create a consistent key (alphabetically sorted)
        const [first, second] = [name1, name2].sort();
        const coOccurrenceKey = `${first}:${second}`;

        if (!coOccurrences.has(coOccurrenceKey)) {
          coOccurrences.set(coOccurrenceKey, {
            symptom1: first,
            symptom2: second,
            count: 0,
            timeGaps: [],
          });
        }

        const data = coOccurrences.get(coOccurrenceKey)!;
        data.count++;
        data.timeGaps.push(timeDiff / (60 * 1000)); // Convert to minutes
      }
    }
  }

  // Calculate results
  const results: SymptomCoOccurrenceResult[] = [];

  for (const [, data] of coOccurrences) {
    const totalSymptom1 = symptomCounts.get(data.symptom1) || 1;
    const totalSymptom2 = symptomCounts.get(data.symptom2) || 1;
    // Correlation based on smaller count (more meaningful)
    const minTotal = Math.min(totalSymptom1, totalSymptom2);
    const correlation = Math.round((data.count / minTotal) * 100);
    const avgTimeBetween = data.timeGaps.length > 0
      ? Math.round(data.timeGaps.reduce((a, b) => a + b, 0) / data.timeGaps.length)
      : 0;

    // Only include co-occurrences with at least 2 instances and 25% correlation
    if (data.count >= 2 && correlation >= 25) {
      results.push({
        symptom1: { name: data.symptom1.charAt(0).toUpperCase() + data.symptom1.slice(1) },
        symptom2: { name: data.symptom2.charAt(0).toUpperCase() + data.symptom2.slice(1) },
        coOccurrences: data.count,
        totalSymptom1,
        totalSymptom2,
        correlation,
        avgTimeBetween,
      });
    }
  }

  // Sort by correlation percentage descending
  return results.sort((a, b) => b.correlation - a.correlation);
}

// Calculate exercise-symptom correlation (exercise before symptom)
export function calculateExerciseCorrelations(
  symptoms: DecryptedSymptom[],
  exercises: DecryptedExercise[],
  timeWindowHours: number = 24
): CorrelationResult[] {
  const correlations: Map<string, {
    trigger: CorrelationResult['trigger'];
    symptom: CorrelationResult['symptom'];
    occurrences: number;
    timeGaps: number[];
  }> = new Map();

  const symptomCounts: Map<string, number> = new Map();

  for (const symptom of symptoms) {
    const symptomTime = new Date(symptom.occurredAt).getTime();
    const key = symptom.name.toLowerCase();
    symptomCounts.set(key, (symptomCounts.get(key) || 0) + 1);

    // Look for exercise performed before this symptom
    for (const exercise of exercises) {
      const exerciseTime = new Date(exercise.performedAt).getTime();
      const timeDiff = symptomTime - exerciseTime;
      const timeWindowMs = timeWindowHours * 60 * 60 * 1000;

      // Check if exercise was performed 0-24 hours before symptom
      if (timeDiff > 0 && timeDiff <= timeWindowMs) {
        const correlationKey = `exercise:${exercise.exerciseType.toLowerCase()}:${symptom.name.toLowerCase()}`;

        if (!correlations.has(correlationKey)) {
          correlations.set(correlationKey, {
            trigger: {
              id: exercise.exerciseType,
              name: exercise.exerciseType.charAt(0).toUpperCase() + exercise.exerciseType.slice(1),
              type: 'exercise'
            },
            symptom: { id: symptom.id, name: symptom.name },
            occurrences: 0,
            timeGaps: [],
          });
        }

        const data = correlations.get(correlationKey)!;
        data.occurrences++;
        data.timeGaps.push(timeDiff / (60 * 1000)); // Convert to minutes
      }
    }
  }

  // Calculate correlation percentages
  const results: CorrelationResult[] = [];

  for (const [, data] of correlations) {
    const symptomKey = data.symptom.name.toLowerCase();
    const totalSymptomOccurrences = symptomCounts.get(symptomKey) || 1;
    const correlation = Math.round((data.occurrences / totalSymptomOccurrences) * 100);
    const avgTimeToSymptom = data.timeGaps.length > 0
      ? Math.round(data.timeGaps.reduce((a, b) => a + b, 0) / data.timeGaps.length)
      : 0;

    // Only include correlations with at least 2 occurrences and 25% correlation
    if (data.occurrences >= 2 && correlation >= 25) {
      results.push({
        trigger: data.trigger,
        symptom: data.symptom,
        correlation,
        occurrences: data.occurrences,
        totalSymptomOccurrences,
        avgTimeToSymptom,
      });
    }
  }

  return results.sort((a, b) => b.correlation - a.correlation);
}
