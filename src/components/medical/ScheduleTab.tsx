'use client';

import { useEffect, useState, useCallback } from 'react';
import { useEncryption } from '@/lib/hooks/useEncryption';

interface CustomField {
  id: string;
  encryptedData: string;
  iv: string;
}

interface Medication {
  id: string;
  encryptedContent: string;
  iv: string;
  custom_fields: CustomField[] | null;
}

interface DecryptedMedicationFields {
  dosage?: string;
  frequency?: string;
  scheduleTimes?: string[];
  isActive?: boolean;
}

interface ScheduledDose {
  medicationId: string;
  medicationName: string;
  dosage: string;
  time: string;
}

interface Props {
  selectedDate: string;
  refreshKey: number;
  onDataChange: () => void;
}

export function ScheduleTab({ selectedDate, refreshKey }: Props) {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [scheduledDoses, setScheduledDoses] = useState<ScheduledDose[]>([]);
  const { decryptData, isKeyReady } = useEncryption();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all medications from entries API
      const medResponse = await fetch('/api/entries?customType=medication');
      const medData = await medResponse.json();
      setMedications(medData.entries || []);
    } catch (error) {
      console.error('Failed to fetch schedule data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const buildSchedule = useCallback(async () => {
    if (!isKeyReady || medications.length === 0) return;

    const doses: ScheduledDose[] = [];

    for (const med of medications) {
      try {
        const name = await decryptData(med.encryptedContent, med.iv);
        const plainName = name.replace(/<[^>]*>/g, '').trim();
        const fields: DecryptedMedicationFields = {};

        if (med.custom_fields) {
          for (const cf of med.custom_fields) {
            try {
              const decrypted = await decryptData(cf.encryptedData, cf.iv);
              const parsed = JSON.parse(decrypted);
              if (parsed.fieldKey === 'dosage') fields.dosage = parsed.value;
              if (parsed.fieldKey === 'scheduleTimes') fields.scheduleTimes = parsed.value;
              if (parsed.fieldKey === 'isActive') fields.isActive = parsed.value;
            } catch {
              // Skip
            }
          }
        }

        // Only include active medications
        if (fields.isActive === false) continue;

        // Create dose entries for each scheduled time
        for (const time of fields.scheduleTimes || ['08:00']) {
          doses.push({
            medicationId: med.id,
            medicationName: plainName || 'Unnamed Medication',
            dosage: fields.dosage || '',
            time,
          });
        }
      } catch {
        // Skip failed medications
      }
    }

    // Sort by time
    doses.sort((a, b) => a.time.localeCompare(b.time));
    setScheduledDoses(doses);
  }, [medications, decryptData, isKeyReady]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  useEffect(() => {
    buildSchedule();
  }, [buildSchedule]);

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  // Group doses by time
  const dosesByTime = scheduledDoses.reduce((acc, dose) => {
    if (!acc[dose.time]) {
      acc[dose.time] = [];
    }
    acc[dose.time].push(dose);
    return acc;
  }, {} as Record<string, ScheduledDose[]>);

  const formatDateDisplay = (dateStr: string) => {
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  };

  if (loading) {
    return (
      <div className="p-4 flex items-center justify-center h-64">
        <p className="text-gray-500">Loading schedule...</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-900">Daily Schedule</h2>
        <span className="text-gray-600">{formatDateDisplay(selectedDate)}</span>
      </div>

      <p className="text-sm text-gray-500 mb-4">
        This shows your daily medication schedule based on active medications.
      </p>

      {scheduledDoses.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border">
          <p className="text-gray-500">No medications scheduled</p>
          <p className="text-sm text-gray-400 mt-1">Add medications to see your daily schedule</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(dosesByTime).map(([time, doses]) => (
            <div key={time} className="bg-white rounded-lg border overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b">
                <span className="font-medium text-gray-700">{formatTime(time)}</span>
              </div>
              <div className="divide-y">
                {doses.map((dose, index) => (
                  <div key={`${dose.medicationId}-${time}-${index}`} className="px-4 py-3 flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full border-2 border-gray-300 flex items-center justify-center">
                      <span className="text-xs text-gray-400">💊</span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-900">
                        {dose.medicationName} {dose.dosage}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
