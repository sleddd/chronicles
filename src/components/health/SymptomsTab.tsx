'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useEncryption } from '@/lib/hooks/useEncryption';
import { useEntriesCache } from '@/lib/hooks/useEntriesCache';
import { useAccentColor } from '@/lib/hooks/useAccentColor';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface CustomField {
  id: string;
  encryptedData: string;
  iv: string;
}

interface SymptomEntry {
  id: string;
  encryptedContent: string;
  iv: string;
  custom_fields: CustomField[] | null;
  entryDate: string;
  createdAt: string;
}

interface DecryptedSymptomFields {
  severity?: number;
  occurredAt?: string;
  duration?: number;
  notes?: string;
}

type ViewMode = 'today' | 'week' | 'month' | 'all';

interface Props {
  selectedDate: string;
  onDataChange: () => void;
  refreshKey: number;
}

export function SymptomsTab({ selectedDate, refreshKey }: Props) {
  const router = useRouter();
  const [symptoms, setSymptoms] = useState<SymptomEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [decryptedSymptoms, setDecryptedSymptoms] = useState<Map<string, { name: string; fields: DecryptedSymptomFields }>>(new Map());
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const { decryptData, isKeyReady } = useEncryption();
  const { getEntriesByType, isInitialized: isCacheInitialized } = useEntriesCache();
  const { accentColor } = useAccentColor();

  const handleEditSymptom = (entryId: string) => {
    router.push(`/?entry=${entryId}`);
  };

  // Normalize date to YYYY-MM-DD string format
  const normalizeDate = (dateValue: string | Date | null | undefined): string => {
    if (!dateValue) return 'unknown';

    if (typeof dateValue === 'string') {
      if (dateValue.includes('T')) {
        return dateValue.split('T')[0];
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
        return dateValue;
      }
    }

    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return 'unknown';
    return date.toISOString().split('T')[0];
  };

  // Get date range based on view mode
  const getDateRange = useCallback(() => {
    const today = new Date(selectedDate + 'T12:00:00');

    switch (viewMode) {
      case 'today':
        return { start: selectedDate, end: selectedDate };
      case 'week': {
        const weekAgo = new Date(today);
        weekAgo.setDate(today.getDate() - 7);
        return { start: weekAgo.toISOString().split('T')[0], end: selectedDate };
      }
      case 'month': {
        const monthAgo = new Date(today);
        monthAgo.setMonth(today.getMonth() - 1);
        return { start: monthAgo.toISOString().split('T')[0], end: selectedDate };
      }
      case 'all':
      default:
        return null; // No date filter
    }
  }, [viewMode, selectedDate]);

  // Load symptoms from cache
  const loadSymptomsFromCache = useCallback(() => {
    if (!isCacheInitialized) return;

    setLoading(true);
    try {
      const dateRange = getDateRange();
      let entries = getEntriesByType('symptom') as SymptomEntry[];

      // Filter by date range based on view mode
      if (viewMode === 'today' && dateRange) {
        entries = entries.filter(entry => normalizeDate(entry.entryDate) === dateRange.end);
      } else if (dateRange && viewMode !== 'all') {
        entries = entries.filter(entry => {
          const entryDate = normalizeDate(entry.entryDate);
          if (entryDate === 'unknown') return false;
          return entryDate >= dateRange.start && entryDate <= dateRange.end;
        });
      }

      setSymptoms(entries);
    } catch (error) {
      console.error('Failed to load symptoms from cache:', error);
    } finally {
      setLoading(false);
    }
  }, [isCacheInitialized, getEntriesByType, getDateRange, viewMode]);

  const decryptSymptoms = useCallback(async () => {
    if (!isKeyReady || symptoms.length === 0) return;

    const decrypted = new Map<string, { name: string; fields: DecryptedSymptomFields }>();

    for (const symptom of symptoms) {
      try {
        const name = await decryptData(symptom.encryptedContent, symptom.iv);
        const plainName = name.replace(/<[^>]*>/g, '').trim();
        const fields: DecryptedSymptomFields = {};

        if (symptom.custom_fields) {
          for (const cf of symptom.custom_fields) {
            try {
              const decryptedField = await decryptData(cf.encryptedData, cf.iv);
              const parsed = JSON.parse(decryptedField);
              if (parsed.fieldKey === 'severity') fields.severity = parsed.value;
              if (parsed.fieldKey === 'occurredAt') fields.occurredAt = parsed.value;
              if (parsed.fieldKey === 'duration') fields.duration = parsed.value;
              if (parsed.fieldKey === 'notes') fields.notes = parsed.value;
            } catch {
              // Skip
            }
          }
        }

        decrypted.set(symptom.id, { name: plainName || 'Unnamed Symptom', fields });
      } catch {
        decrypted.set(symptom.id, { name: 'Decryption failed', fields: {} });
      }
    }

    setDecryptedSymptoms(decrypted);
  }, [symptoms, decryptData, isKeyReady]);

  useEffect(() => {
    loadSymptomsFromCache();
  }, [loadSymptomsFromCache, refreshKey]);

  useEffect(() => {
    decryptSymptoms();
  }, [decryptSymptoms]);

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const formatDateDisplay = (dateStr: string) => {
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  };

  // Group entries by date
  const entriesByDate = symptoms.reduce((acc, entry) => {
    let date = normalizeDate(entry.entryDate);
    if (date === 'unknown' && entry.createdAt) {
      date = normalizeDate(entry.createdAt);
    }
    if (!acc[date]) acc[date] = [];
    acc[date].push(entry);
    return acc;
  }, {} as Record<string, SymptomEntry[]>);

  const sortedDates = Object.keys(entriesByDate).sort((a, b) => b.localeCompare(a));

  if (loading) {
    return (
      <div className="p-4 flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="px-8 py-4 pb-12">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-900">Symptom Log</h2>
      </div>

      <p className="text-sm text-gray-500 mb-4">
        Add symptoms from the journal by creating an entry with the &quot;symptom&quot; topic.
      </p>

      {/* View Mode Selector */}
      <div className="mb-4">
        <div className="flex gap-1 p-1 bg-white/30 backdrop-blur-sm rounded-lg border border-border">
          {([
            { key: 'today', label: 'Today' },
            { key: 'week', label: 'Week' },
            { key: 'month', label: 'Month' },
            { key: 'all', label: 'All' },
          ] as const).map((filter) => (
            <button
              key={filter.key}
              onClick={() => setViewMode(filter.key)}
              className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${
                viewMode === filter.key
                  ? 'bg-white shadow-sm text-gray-900'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Summary */}
      {symptoms.length > 0 && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="backdrop-blur-md bg-white/70 rounded-lg border border-border p-4 text-center">
            <div className="text-2xl font-bold" style={{ color: accentColor }}>{symptoms.length}</div>
            <div className="text-sm text-gray-500">Symptoms Logged</div>
          </div>
          <div className="backdrop-blur-md bg-white/70 rounded-lg border border-border p-4 text-center">
            <div className="text-2xl font-bold" style={{ color: accentColor }}>
              {Array.from(decryptedSymptoms.values()).length > 0
                ? (Array.from(decryptedSymptoms.values()).reduce((sum, s) => sum + (s.fields.severity || 0), 0) / decryptedSymptoms.size).toFixed(1)
                : '-'}
            </div>
            <div className="text-sm text-gray-500">Avg Severity</div>
          </div>
        </div>
      )}

      {symptoms.length === 0 ? (
        <div className="text-center py-12 backdrop-blur-md bg-white/70 rounded-lg border border-border">
          <div className="text-4xl mb-2">🩺</div>
          <p className="text-gray-500">No symptoms logged {viewMode === 'today' ? 'today' : viewMode === 'all' ? 'yet' : `in the past ${viewMode}`}</p>
          <p className="text-sm text-gray-400 mt-1">
            Create an entry with the &quot;symptom&quot; topic to track symptoms
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedDates.map((date) => (
            <div key={date}>
              <h3 className="text-sm font-medium text-gray-500 mb-2">{formatDateDisplay(date)}</h3>
              <div className="backdrop-blur-md bg-white/70 rounded-lg border border-border overflow-hidden">
                <div className="divide-y divide-border">
                  {entriesByDate[date].map((symptom) => {
                    const data = decryptedSymptoms.get(symptom.id);
                    const severity = data?.fields.severity || 5;

                    return (
                      <div key={symptom.id} className="px-4 py-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-gray-900">{data?.name || 'Loading...'}</h3>
                              {data?.fields.occurredAt && (
                                <span className="text-sm text-gray-500">
                                  {formatTime(data.fields.occurredAt)}
                                </span>
                              )}
                            </div>

                            {/* Severity bar */}
                            <div className="mt-2 flex items-center gap-2">
                              <span className="text-sm text-gray-600">Severity:</span>
                              <div className="flex-1 max-w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{ width: `${severity * 10}%`, backgroundColor: accentColor }}
                                />
                              </div>
                              <span className="text-sm text-gray-600">{severity}/10</span>
                            </div>

                            {data?.fields.duration && (
                              <p className="text-sm text-gray-600 mt-1">
                                Duration: {data.fields.duration} min
                              </p>
                            )}

                            {data?.fields.notes && (
                              <p className="text-sm text-gray-500 mt-1">{data.fields.notes}</p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleEditSymptom(symptom.id)}
                            className="p-1 text-gray-400 hover:text-gray-600 transition-colors ml-2"
                            title="Edit symptom"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
