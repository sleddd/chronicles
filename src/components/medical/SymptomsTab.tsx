'use client';

import { useEffect, useState, useCallback } from 'react';
import { useEncryption } from '@/lib/hooks/useEncryption';

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

interface Props {
  selectedDate: string;
  onDataChange: () => void;
  refreshKey: number;
}

export function SymptomsTab({ selectedDate, refreshKey }: Props) {
  const [symptoms, setSymptoms] = useState<SymptomEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [decryptedSymptoms, setDecryptedSymptoms] = useState<Map<string, { name: string; fields: DecryptedSymptomFields }>>(new Map());
  const { decryptData, isKeyReady } = useEncryption();

  const fetchSymptoms = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch from entries API with customType filter
      const response = await fetch(`/api/entries?customType=symptom&date=${selectedDate}`);
      const data = await response.json();
      setSymptoms(data.entries || []);
    } catch (error) {
      console.error('Failed to fetch symptoms:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

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
    fetchSymptoms();
  }, [fetchSymptoms, refreshKey]);

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

  const getSeverityColor = (severity: number) => {
    if (severity <= 3) return 'bg-green-500';
    if (severity <= 6) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getSeverityEmoji = (severity: number) => {
    if (severity <= 3) return '😊';
    if (severity <= 6) return '😐';
    return '😣';
  };

  if (loading) {
    return (
      <div className="p-4 flex items-center justify-center h-64">
        <p className="text-gray-500">Loading symptoms...</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-900">Symptom Log</h2>
        <span className="text-gray-600">{formatDateDisplay(selectedDate)}</span>
      </div>

      <p className="text-sm text-gray-500 mb-4">
        Add symptoms from the journal by creating an entry with the &quot;symptom&quot; topic.
      </p>

      {symptoms.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border">
          <p className="text-gray-500">No symptoms logged</p>
          <p className="text-sm text-gray-400 mt-1">
            Create an entry with the &quot;symptom&quot; topic to track symptoms
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {symptoms.map((symptom) => {
            const data = decryptedSymptoms.get(symptom.id);
            const severity = data?.fields.severity || 5;

            return (
              <div key={symptom.id} className="bg-white rounded-lg border p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{getSeverityEmoji(severity)}</span>
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
                          className={`h-full rounded-full ${getSeverityColor(severity)}`}
                          style={{ width: `${severity * 10}%` }}
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
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
