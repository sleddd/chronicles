export interface CorrelationResult {
  trigger: { id: string; name: string; type: 'food' | 'medication' };
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
}

export interface DecryptedMedicationLog {
  id: string;
  medicationId: string;
  medicationName: string;
  takenAt: string;
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
