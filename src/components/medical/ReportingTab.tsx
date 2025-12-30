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
  CorrelationResult,
  FrequencyData,
  SeverityTrendData,
  DecryptedSymptom,
  DecryptedFood,
  DecryptedMedicationLog,
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

  // Chart data
  const [correlations, setCorrelations] = useState<CorrelationResult[]>([]);
  const [symptomFrequency, setSymptomFrequency] = useState<FrequencyData[]>([]);
  const [severityTrend, setSeverityTrend] = useState<SeverityTrendData[]>([]);

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

      // Decrypt medication logs
      const decryptedLogs: DecryptedMedicationLog[] = [];
      const medicationsMap = new Map<string, string>();

      // First decrypt medication names
      for (const med of (report.medications || []) as RawEntry[]) {
        try {
          const rawName = await decryptData(med.encryptedContent, med.iv);
          const name = rawName.replace(/<[^>]*>/g, '').trim();
          medicationsMap.set(med.id, name);
        } catch {
          medicationsMap.set(med.id, 'Unknown');
        }
      }

      for (const log of (report.medicationLogs || []) as RawEntry[]) {
        try {
          let takenAt = '';

          if (log.custom_fields) {
            for (const cf of log.custom_fields) {
              try {
                const decrypted = await decryptData(cf.encryptedData, cf.iv);
                const parsed = JSON.parse(decrypted);
                if (parsed.fieldKey === 'takenAt') takenAt = parsed.value;
              } catch {
                // Skip
              }
            }
          }

          if (takenAt && log.medicationId) {
            decryptedLogs.push({
              id: log.id,
              medicationId: log.medicationId,
              medicationName: medicationsMap.get(log.medicationId) || 'Unknown',
              takenAt,
            });
          }
        } catch {
          // Skip
        }
      }
      setMedicationLogs(decryptedLogs);

    } catch (error) {
      console.error('Failed to fetch report data:', error);
    } finally {
      setLoading(false);
    }
  }, [isKeyReady, getDateRange, decryptData]);

  // Calculate chart data when decrypted data changes
  useEffect(() => {
    if (symptoms.length > 0) {
      setCorrelations(calculateCorrelations(symptoms, food, medicationLogs));
      setSymptomFrequency(calculateSymptomFrequency(symptoms, period === 'year' ? 'month' : 'day'));
      setSeverityTrend(calculateSeverityTrend(symptoms, period === 'year' ? 'week' : 'day'));
    } else {
      setCorrelations([]);
      setSymptomFrequency([]);
      setSeverityTrend([]);
    }
  }, [symptoms, food, medicationLogs, period]);

  useEffect(() => {
    fetchAndDecryptData();
  }, [fetchAndDecryptData, refreshKey]);

  const handleGenerateReport = () => {
    fetchAndDecryptData();
  };

  return (
    <div className="p-4 space-y-6">
      {/* Filters */}
      <div className="bg-white rounded-lg border p-4">
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
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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
                  className="px-3 py-1.5 border rounded-md text-sm focus:ring-teal-500 focus:border-teal-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">End Date</label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="px-3 py-1.5 border rounded-md text-sm focus:ring-teal-500 focus:border-teal-500"
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
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-lg border p-4 text-center">
              <div className="text-3xl font-bold text-teal-600">{symptoms.length}</div>
              <div className="text-sm text-gray-600">Symptoms Logged</div>
            </div>
            <div className="bg-white rounded-lg border p-4 text-center">
              <div className="text-3xl font-bold text-green-600">{food.length}</div>
              <div className="text-sm text-gray-600">Food Entries</div>
            </div>
            <div className="bg-white rounded-lg border p-4 text-center">
              <div className="text-3xl font-bold text-blue-600">{medicationLogs.length}</div>
              <div className="text-sm text-gray-600">Medication Logs</div>
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
            <div className="bg-white rounded-lg border p-4">
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
            <div className="bg-white rounded-lg border p-4">
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
        </>
      )}
    </div>
  );
}
