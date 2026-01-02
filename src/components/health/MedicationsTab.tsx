'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
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
  createdAt: string;
}

interface DecryptedMedicationFields {
  dosage?: string;
  frequency?: 'once_daily' | 'twice_daily' | 'three_times_daily' | 'as_needed' | 'custom';
  scheduleTimes?: string[];
  startDate?: string;
  endDate?: string | null;
  isActive?: boolean;
  notes?: string;
}

interface Props {
  onDataChange: () => void;
  refreshKey: number;
}

const FREQUENCY_LABELS: Record<string, string> = {
  once_daily: 'Once daily',
  twice_daily: 'Twice daily',
  three_times_daily: 'Three times daily',
  as_needed: 'As needed',
  custom: 'Custom',
};

export function MedicationsTab({ refreshKey }: Props) {
  const router = useRouter();
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [showActiveOnly, setShowActiveOnly] = useState(true);
  const [decryptedMedications, setDecryptedMedications] = useState<Map<string, { name: string; fields: DecryptedMedicationFields }>>(new Map());
  const { decryptData, isKeyReady } = useEncryption();

  const handleEditMedication = (medicationId: string) => {
    router.push(`/?entry=${medicationId}`);
  };

  const fetchMedications = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch from entries API with customType filter
      const response = await fetch('/api/entries?customType=medication');
      const data = await response.json();
      setMedications(data.entries || []);
    } catch (error) {
      console.error('Failed to fetch medications:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const decryptMedications = useCallback(async () => {
    if (!isKeyReady || medications.length === 0) return;

    const decrypted = new Map<string, { name: string; fields: DecryptedMedicationFields }>();

    for (const med of medications) {
      try {
        const name = await decryptData(med.encryptedContent, med.iv);
        // Strip HTML tags from name
        const plainName = name.replace(/<[^>]*>/g, '').trim();
        const fields: DecryptedMedicationFields = {};

        if (med.custom_fields) {
          for (const cf of med.custom_fields) {
            try {
              const decryptedField = await decryptData(cf.encryptedData, cf.iv);
              const parsed = JSON.parse(decryptedField);
              if (parsed.fieldKey === 'dosage') fields.dosage = parsed.value;
              if (parsed.fieldKey === 'frequency') fields.frequency = parsed.value;
              if (parsed.fieldKey === 'scheduleTimes') fields.scheduleTimes = parsed.value;
              if (parsed.fieldKey === 'startDate') fields.startDate = parsed.value;
              if (parsed.fieldKey === 'endDate') fields.endDate = parsed.value;
              if (parsed.fieldKey === 'isActive') fields.isActive = parsed.value;
              if (parsed.fieldKey === 'notes') fields.notes = parsed.value;
            } catch {
              // Skip failed fields
            }
          }
        }

        decrypted.set(med.id, { name: plainName || 'Unnamed Medication', fields });
      } catch {
        decrypted.set(med.id, { name: 'Decryption failed', fields: {} });
      }
    }

    setDecryptedMedications(decrypted);
  }, [medications, decryptData, isKeyReady]);

  useEffect(() => {
    fetchMedications();
  }, [fetchMedications, refreshKey]);

  useEffect(() => {
    decryptMedications();
  }, [decryptMedications]);

  const filteredMedications = medications.filter((med) => {
    if (!showActiveOnly) return true;
    const data = decryptedMedications.get(med.id);
    return data?.fields.isActive !== false;
  });

  if (loading) {
    return (
      <div className="p-4 flex items-center justify-center h-64">
        <p className="text-gray-500">Loading medications...</p>
      </div>
    );
  }

  return (
    <div className="px-8 py-4 pb-12">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-900">My Medications</h2>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={showActiveOnly}
              onChange={(e) => setShowActiveOnly(e.target.checked)}
              className="rounded border-border text-teal-600 focus:ring-teal-500"
            />
            Active only
          </label>
        </div>
      </div>

      <p className="text-sm text-gray-500 mb-4">
        Add medications from the journal by creating an entry with the &quot;medication&quot; topic.
      </p>

      {filteredMedications.length === 0 ? (
        <div className="text-center py-12 backdrop-blur-md bg-white/70 rounded-lg border border-border">
          <p className="text-gray-500">No medications found</p>
          <p className="text-sm text-gray-400 mt-1">
            Create an entry with the &quot;medication&quot; topic to add medications
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredMedications.map((med) => {
            const data = decryptedMedications.get(med.id);

            return (
              <div key={med.id} className="backdrop-blur-md bg-white/70 rounded-lg border border-border p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">
                        {data?.name || 'Loading...'} {data?.fields.dosage && <span className="font-normal text-gray-600">{data.fields.dosage}</span>}
                      </h3>
                      {data?.fields.isActive === false && (
                        <span className="px-2 py-0.5 backdrop-blur-md bg-white/60 text-gray-600 text-xs rounded-full">Inactive</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      {data?.fields.frequency ? FREQUENCY_LABELS[data.fields.frequency] : ''}
                      {data?.fields.scheduleTimes && data.fields.scheduleTimes.length > 0 && (
                        <span> • {data.fields.scheduleTimes.join(', ')}</span>
                      )}
                    </p>
                    {data?.fields.notes && (
                      <p className="text-sm text-gray-500 mt-1">{data.fields.notes}</p>
                    )}
                    {data?.fields.startDate && (
                      <p className="text-xs text-gray-400 mt-2">Started: {data.fields.startDate}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleEditMedication(med.id)}
                    className="p-1 text-gray-400 hover:text-teal-600 transition-colors ml-2"
                    title="Edit medication"
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
      )}
    </div>
  );
}
