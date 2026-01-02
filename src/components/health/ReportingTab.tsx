'use client';

import { useEffect, useState, useCallback } from 'react';
import { useEncryption } from '@/lib/hooks/useEncryption';
import { FrequencyChart } from './charts/FrequencyChart';
import { CorrelationChart } from './charts/CorrelationChart';
import { SeverityTrendChart } from './charts/SeverityTrendChart';
import {
  calculateCorrelations,
  calculateSymptomFrequency,
  calculateSeverityTrend,
  calculateExerciseCorrelations,
  calculateExerciseImpact,
  calculateExerciseFrequency,
  CorrelationResult,
  FrequencyData,
  SeverityTrendData,
  ExerciseImpactResult,
  ExerciseFrequencyData,
  DecryptedSymptom,
  DecryptedFood,
  DecryptedMedicationLog,
  DecryptedExercise,
} from '@/lib/utils/correlationAnalysis';

interface CustomField {
  id: string;
  encryptedData: string;
  iv: string;
}

interface RawEntry {
  id: string;
  encryptedContent: string;
  iv: string;
  custom_fields: CustomField[] | null;
  triggers?: { triggerId: string; relationshipType: string }[];
  medicationId?: string;
}

type PeriodType = 'week' | 'month' | 'year' | 'custom';

interface Props {
  refreshKey: number;
}

export function ReportingTab({ refreshKey }: Props) {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodType>('month');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const { decryptData, isKeyReady } = useEncryption();

  // Decrypted data
  const [symptoms, setSymptoms] = useState<DecryptedSymptom[]>([]);
  const [food, setFood] = useState<DecryptedFood[]>([]);
  const [medicationLogs, setMedicationLogs] = useState<DecryptedMedicationLog[]>([]);
  const [exercises, setExercises] = useState<DecryptedExercise[]>([]);

  // Chart data
  const [correlations, setCorrelations] = useState<CorrelationResult[]>([]);
  const [symptomFrequency, setSymptomFrequency] = useState<FrequencyData[]>([]);
  const [severityTrend, setSeverityTrend] = useState<SeverityTrendData[]>([]);
  const [exerciseImpact, setExerciseImpact] = useState<ExerciseImpactResult[]>([]);
  const [exerciseFrequency, setExerciseFrequency] = useState<ExerciseFrequencyData[]>([]);

  const getDateRange = useCallback(() => {
    if (period === 'custom' && customStartDate && customEndDate) {
      return {
        startDate: customStartDate,
        endDate: customEndDate,
      };
    }

    const endDate = new Date();
    const startDate = new Date();

    switch (period) {
      case 'week':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(endDate.getMonth() - 1);
        break;
      case 'year':
        startDate.setFullYear(endDate.getFullYear() - 1);
        break;
      default:
        startDate.setMonth(endDate.getMonth() - 1);
        break;
    }

    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
    };
  }, [period, customStartDate, customEndDate]);

  const fetchAndDecryptData = useCallback(async () => {
    if (!isKeyReady) return;

    setLoading(true);
    try {
      const { startDate, endDate } = getDateRange();

      const response = await fetch(`/api/medical/reports?type=all&startDate=${startDate}&endDate=${endDate}`);
      const data = await response.json();
      const report = data.report || {};

      // Decrypt symptoms
      const decryptedSymptoms: DecryptedSymptom[] = [];
      for (const symptom of (report.symptoms || []) as RawEntry[]) {
        try {
          const rawName = await decryptData(symptom.encryptedContent, symptom.iv);
          const name = rawName.replace(/<[^>]*>/g, '').trim();
          let severity = 5;
          let occurredAt = new Date().toISOString();

          if (symptom.custom_fields) {
            for (const cf of symptom.custom_fields) {
              try {
                const decrypted = await decryptData(cf.encryptedData, cf.iv);
                const parsed = JSON.parse(decrypted);
                if (parsed.fieldKey === 'severity') severity = parsed.value;
                if (parsed.fieldKey === 'occurredAt') occurredAt = parsed.value;
              } catch {
                // Skip
              }
            }
          }

          decryptedSymptoms.push({
            id: symptom.id,
            name,
            severity,
            occurredAt,
            triggers: symptom.triggers || [],
          });
        } catch {
          // Skip
        }
      }
      setSymptoms(decryptedSymptoms);

      // Decrypt food
      const decryptedFood: DecryptedFood[] = [];
      for (const foodItem of (report.food || []) as RawEntry[]) {
        try {
          const rawName = await decryptData(foodItem.encryptedContent, foodItem.iv);
          const name = rawName.replace(/<[^>]*>/g, '').trim();
          let consumedAt = new Date().toISOString();
          let ingredients: string[] = [];

          if (foodItem.custom_fields) {
            for (const cf of foodItem.custom_fields) {
              try {
                const decrypted = await decryptData(cf.encryptedData, cf.iv);
                const parsed = JSON.parse(decrypted);
                if (parsed.fieldKey === 'consumedAt') consumedAt = parsed.value;
                if (parsed.fieldKey === 'ingredients') ingredients = parsed.value || [];
              } catch {
                // Skip
              }
            }
          }

          decryptedFood.push({
            id: foodItem.id,
            name,
            consumedAt,
            ingredients,
          });
        } catch {
          // Skip
        }
      }
      setFood(decryptedFood);

      // Decrypt medication logs from the medication_dose_logs table
      const decryptedLogs: DecryptedMedicationLog[] = [];
      const medicationsMap = new Map<string, string>();

      // First decrypt medication names from entries
      for (const med of (report.medications || []) as RawEntry[]) {
        try {
          const rawName = await decryptData(med.encryptedContent, med.iv);
          const name = rawName.replace(/<[^>]*>/g, '').trim();
          medicationsMap.set(med.id, name);
        } catch {
          medicationsMap.set(med.id, 'Unknown');
        }
      }

      // Process dose logs - these come directly from medication_dose_logs table
      // They have: id, medicationId, scheduledTime, date, status, takenAt
      interface DoseLogEntry {
        id: string;
        medicationId: string;
        scheduledTime: string;
        date: string;
        status: string;
        takenAt: string | null;
      }

      for (const log of (report.medicationLogs || []) as DoseLogEntry[]) {
        if (log.takenAt && log.medicationId) {
          decryptedLogs.push({
            id: log.id,
            medicationId: log.medicationId,
            medicationName: medicationsMap.get(log.medicationId) || 'Unknown',
            takenAt: log.takenAt,
          });
        }
      }
      setMedicationLogs(decryptedLogs);

      // Decrypt exercise entries
      const decryptedExercises: DecryptedExercise[] = [];
      for (const exercise of (report.exercise || []) as RawEntry[]) {
        try {
          const rawName = await decryptData(exercise.encryptedContent, exercise.iv);
          const name = rawName.replace(/<[^>]*>/g, '').trim();
          let exerciseType = '';
          let duration = 0;
          let intensity: 'low' | 'medium' | 'high' = 'medium';
          let performedAt = new Date().toISOString();

          if (exercise.custom_fields) {
            for (const cf of exercise.custom_fields) {
              try {
                const decrypted = await decryptData(cf.encryptedData, cf.iv);
                const parsed = JSON.parse(decrypted);
                if (parsed.fieldKey === 'exerciseType') exerciseType = parsed.value;
                if (parsed.fieldKey === 'duration') duration = parsed.value || 0;
                if (parsed.fieldKey === 'intensity') intensity = parsed.value || 'medium';
                if (parsed.fieldKey === 'performedAt') performedAt = parsed.value;
              } catch {
                // Skip
              }
            }
          }

          decryptedExercises.push({
            id: exercise.id,
            name: name || exerciseType,
            exerciseType: exerciseType || name,
            duration,
            intensity,
            performedAt,
          });
        } catch {
          // Skip
        }
      }
      setExercises(decryptedExercises);

    } catch (error) {
      console.error('Failed to fetch report data:', error);
    } finally {
      setLoading(false);
    }
  }, [isKeyReady, getDateRange, decryptData]);

  // Calculate chart data when decrypted data changes
  useEffect(() => {
    if (symptoms.length > 0) {
      // Calculate food/medication correlations
      const foodMedCorrelations = calculateCorrelations(symptoms, food, medicationLogs);
      // Calculate exercise correlations
      const exerciseCorrelations = calculateExerciseCorrelations(symptoms, exercises);
      // Combine all correlations
      setCorrelations([...foodMedCorrelations, ...exerciseCorrelations]);
      setSymptomFrequency(calculateSymptomFrequency(symptoms, period === 'year' ? 'month' : 'day'));
      setSeverityTrend(calculateSeverityTrend(symptoms, period === 'year' ? 'week' : 'day'));
    } else {
      setCorrelations([]);
      setSymptomFrequency([]);
      setSeverityTrend([]);
    }

    // Calculate exercise-specific analytics
    if (exercises.length > 0) {
      setExerciseImpact(calculateExerciseImpact(symptoms, exercises));
      setExerciseFrequency(calculateExerciseFrequency(exercises, period === 'year' ? 'month' : 'week'));
    } else {
      setExerciseImpact([]);
      setExerciseFrequency([]);
    }
  }, [symptoms, food, medicationLogs, exercises, period]);

  useEffect(() => {
    fetchAndDecryptData();
  }, [fetchAndDecryptData, refreshKey]);

  const handleGenerateReport = () => {
    fetchAndDecryptData();
  };

  return (
    <div className="p-4 pb-12 space-y-6">
      {/* Filters */}
      <div className="backdrop-blur-sm bg-white/30 rounded-lg border border-border p-4">
        <h3 className="font-medium text-gray-900 mb-4">Filters</h3>

        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Time Period</label>
            <div className="flex gap-1">
              {(['week', 'month', 'year', 'custom'] as PeriodType[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    period === p
                      ? 'text-white'
                      : 'backdrop-blur-sm bg-white/40 text-gray-700 hover:backdrop-blur-sm bg-white/50'
                  }`}
                  style={period === p ? { backgroundColor: '#1aaeae' } : undefined}
                >
                  {p === 'week' ? 'Week' : p === 'month' ? 'Month' : p === 'year' ? 'Year' : 'Custom'}
                </button>
              ))}
            </div>
          </div>

          {period === 'custom' && (
            <>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Start Date</label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="px-3 py-1.5 border border-border rounded-md text-sm focus:ring-teal-500 focus:border-teal-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">End Date</label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="px-3 py-1.5 border border-border rounded-md text-sm focus:ring-teal-500 focus:border-teal-500"
                />
              </div>
            </>
          )}

          <button
            onClick={handleGenerateReport}
            disabled={loading}
            className="px-4 py-1.5 text-white text-sm rounded-md disabled:bg-gray-400 transition-colors"
            style={{ backgroundColor: loading ? undefined : '#1aaeae' }}
            onMouseOver={(e) => { if (!loading) e.currentTarget.style.backgroundColor = '#158f8f'; }}
            onMouseOut={(e) => { if (!loading) e.currentTarget.style.backgroundColor = '#1aaeae'; }}
          >
            {loading ? 'Loading...' : 'Generate Report'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-gray-500">Analyzing your data...</p>
        </div>
      ) : (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="backdrop-blur-sm bg-white/30 rounded-lg border border-border p-4 text-center">
              <div className="text-3xl font-bold text-teal-600">{symptoms.length}</div>
              <div className="text-sm text-gray-600">Symptoms Logged</div>
            </div>
            <div className="backdrop-blur-sm bg-white/30 rounded-lg border border-border p-4 text-center">
              <div className="text-3xl font-bold text-red-600">{food.length}</div>
              <div className="text-sm text-gray-600">Food Entries</div>
            </div>
            <div className="backdrop-blur-sm bg-white/30 rounded-lg border border-border p-4 text-center">
              <div className="text-3xl font-bold text-blue-600">{medicationLogs.length}</div>
              <div className="text-sm text-gray-600">Medication Logs</div>
            </div>
            <div className="backdrop-blur-sm bg-white/30 rounded-lg border border-border p-4 text-center">
              <div className="text-3xl font-bold text-green-600">{exercises.length}</div>
              <div className="text-sm text-gray-600">Workouts</div>
              {exercises.length > 0 && (
                <div className="text-xs text-gray-500 mt-1">
                  {exercises.reduce((sum, e) => sum + e.duration, 0)} min total
                </div>
              )}
            </div>
          </div>

          {/* Correlations */}
          <CorrelationChart
            data={correlations}
            title="Correlations Detected"
          />

          {/* Symptom Frequency */}
          <FrequencyChart
            data={symptomFrequency}
            title="Symptom Frequency"
            color="bg-orange-500"
          />

          {/* Severity Trend */}
          <SeverityTrendChart
            data={severityTrend}
            title="Severity Trend Over Time"
          />

          {/* Top Symptoms */}
          {symptoms.length > 0 && (
            <div className="backdrop-blur-sm bg-white/30 rounded-lg border border-border p-4">
              <h3 className="font-medium text-gray-900 mb-4">Most Common Symptoms</h3>
              <div className="space-y-2">
                {Object.entries(
                  symptoms.reduce((acc, s) => {
                    const key = s.name.toLowerCase();
                    acc[key] = (acc[key] || 0) + 1;
                    return acc;
                  }, {} as Record<string, number>)
                )
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 5)
                  .map(([name, count]) => (
                    <div key={name} className="flex items-center justify-between">
                      <span className="text-gray-700 capitalize">{name}</span>
                      <span className="text-gray-500">{count} occurrence{count !== 1 ? 's' : ''}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Top Ingredients */}
          {food.length > 0 && (
            <div className="backdrop-blur-sm bg-white/30 rounded-lg border border-border p-4">
              <h3 className="font-medium text-gray-900 mb-4">Most Consumed Ingredients</h3>
              <div className="space-y-2">
                {Object.entries(
                  food.reduce((acc, f) => {
                    for (const ingredient of f.ingredients) {
                      const key = ingredient.toLowerCase();
                      acc[key] = (acc[key] || 0) + 1;
                    }
                    return acc;
                  }, {} as Record<string, number>)
                )
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 5)
                  .map(([name, count]) => (
                    <div key={name} className="flex items-center justify-between">
                      <span className="text-gray-700 capitalize">{name}</span>
                      <span className="text-gray-500">{count} time{count !== 1 ? 's' : ''}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Exercise Summary */}
          {exercises.length > 0 && (
            <div className="backdrop-blur-sm bg-white/30 rounded-lg border border-border p-4">
              <h3 className="font-medium text-gray-900 mb-4">Exercise Summary</h3>
              <div className="space-y-2">
                {Object.entries(
                  exercises.reduce((acc, e) => {
                    const key = e.exerciseType.toLowerCase();
                    if (!acc[key]) {
                      acc[key] = { count: 0, duration: 0 };
                    }
                    acc[key].count++;
                    acc[key].duration += e.duration;
                    return acc;
                  }, {} as Record<string, { count: number; duration: number }>)
                )
                  .sort((a, b) => b[1].count - a[1].count)
                  .slice(0, 5)
                  .map(([type, data]) => (
                    <div key={type} className="flex items-center justify-between">
                      <span className="text-gray-700 capitalize">{type}</span>
                      <span className="text-gray-500">
                        {data.count} session{data.count !== 1 ? 's' : ''} ({data.duration} min)
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Exercise Frequency */}
          {exerciseFrequency.length > 0 && (
            <div className="backdrop-blur-sm bg-white/30 rounded-lg border border-border p-4">
              <h3 className="font-medium text-gray-900 mb-4">Exercise Frequency</h3>
              <div className="space-y-2">
                {exerciseFrequency.slice(-7).map((data) => (
                  <div key={data.period} className="flex items-center gap-3">
                    <span className="text-sm text-gray-600 w-24">{data.period}</span>
                    <div className="flex-1 backdrop-blur-sm bg-white/40 rounded-full h-4 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-green-500"
                        style={{
                          width: `${Math.min((data.count / Math.max(...exerciseFrequency.map(d => d.count))) * 100, 100)}%`
                        }}
                      />
                    </div>
                    <span className="text-sm text-gray-700 w-20 text-right">
                      {data.count} ({data.totalDuration} min)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Exercise Impact on Symptoms */}
          {exerciseImpact.length > 0 && (
            <div className="backdrop-blur-sm bg-white/30 rounded-lg border border-border p-4">
              <h3 className="font-medium text-gray-900 mb-4">Exercise Impact on Symptoms</h3>
              <p className="text-sm text-gray-600 mb-4">
                Shows how symptom severity changes after different exercise types (within 24 hours)
              </p>
              <div className="space-y-3">
                {exerciseImpact.map((impact) => (
                  <div key={impact.exerciseType} className="flex items-center justify-between p-3 backdrop-blur-sm bg-white/30 rounded-lg">
                    <div>
                      <span className="font-medium text-gray-900 capitalize">{impact.exerciseType}</span>
                      <div className="text-xs text-gray-500">{impact.occurrences} data points</div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600">Before: {impact.avgSeverityBefore}</span>
                        <span className="text-gray-400">→</span>
                        <span className="text-sm text-gray-600">After: {impact.avgSeverityAfter}</span>
                      </div>
                      <div className={`text-sm font-medium ${
                        impact.improvement > 0 ? 'text-green-600' : impact.improvement < 0 ? 'text-red-600' : 'text-gray-600'
                      }`}>
                        {impact.improvement > 0 ? '↓' : impact.improvement < 0 ? '↑' : '−'}
                        {' '}
                        {Math.abs(impact.improvement)} point{Math.abs(impact.improvement) !== 1 ? 's' : ''}
                        {' '}
                        {impact.improvement > 0 ? 'improvement' : impact.improvement < 0 ? 'increase' : 'no change'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
