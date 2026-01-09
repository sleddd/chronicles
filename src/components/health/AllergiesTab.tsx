'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useEncryption } from '@/lib/hooks/useEncryption';
import { useSecurityClear } from '@/lib/hooks/useSecurityClear';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface CustomField {
  id: string;
  encryptedData: string;
  iv: string;
}

interface Allergy {
  id: string;
  encryptedContent: string;
  iv: string;
  custom_fields: CustomField[] | null;
  createdAt: string;
}

interface DecryptedAllergyFields {
  severity?: 'mild' | 'moderate' | 'severe';
  allergenType?: string;
  reactions?: string;
  diagnosed?: string;
  isActive?: boolean;
  notes?: string;
}

interface Props {
  onDataChange: () => void;
  refreshKey: number;
}

const SEVERITY_LABELS: Record<string, string> = {
  mild: 'Mild',
  moderate: 'Moderate',
  severe: 'Severe',
};

const SEVERITY_COLORS: Record<string, string> = {
  mild: 'bg-yellow-100 text-yellow-800',
  moderate: 'bg-orange-100 text-orange-800',
  severe: 'bg-red-100 text-red-800',
};

export function AllergiesTab({ refreshKey }: Props) {
  const router = useRouter();
  const [allergies, setAllergies] = useState<Allergy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showActiveOnly, setShowActiveOnly] = useState(true);
  const [decryptedAllergies, setDecryptedAllergies] = useState<Map<string, { name: string; fields: DecryptedAllergyFields }>>(new Map());
  const { decryptData, isKeyReady } = useEncryption();
  const { registerCleanup, unregisterCleanup } = useSecurityClear();

  // Register security cleanup on mount, unregister on unmount
  useEffect(() => {
    const clearSensitiveData = () => {
      setDecryptedAllergies(new Map());
    };

    registerCleanup('allergies-tab', clearSensitiveData);

    return () => {
      clearSensitiveData();
      unregisterCleanup('allergies-tab');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only run on mount/unmount

  const handleEditAllergy = (allergyId: string) => {
    router.push(`/?entry=${allergyId}`);
  };

  const fetchAllergies = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch from entries API with customType filter
      const response = await fetch('/api/entries?customType=allergy');
      const data = await response.json();
      setAllergies(data.entries || []);
    } catch (error) {
      console.error('Failed to fetch allergies:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const decryptAllergies = useCallback(async () => {
    if (!isKeyReady || allergies.length === 0) return;

    const decrypted = new Map<string, { name: string; fields: DecryptedAllergyFields }>();

    for (const allergy of allergies) {
      try {
        const name = await decryptData(allergy.encryptedContent, allergy.iv);
        // Strip HTML tags from name
        const plainName = name.replace(/<[^>]*>/g, '').trim();
        const fields: DecryptedAllergyFields = {};

        if (allergy.custom_fields) {
          for (const cf of allergy.custom_fields) {
            try {
              const decryptedField = await decryptData(cf.encryptedData, cf.iv);
              const parsed = JSON.parse(decryptedField);
              if (parsed.fieldKey === 'severity') fields.severity = parsed.value;
              if (parsed.fieldKey === 'allergenType') fields.allergenType = parsed.value;
              if (parsed.fieldKey === 'reactions') fields.reactions = parsed.value;
              if (parsed.fieldKey === 'diagnosed') fields.diagnosed = parsed.value;
              if (parsed.fieldKey === 'isActive') fields.isActive = parsed.value;
              if (parsed.fieldKey === 'notes') fields.notes = parsed.value;
            } catch {
              // Skip failed fields
            }
          }
        }

        decrypted.set(allergy.id, { name: plainName || 'Unnamed Allergy', fields });
      } catch {
        decrypted.set(allergy.id, { name: 'Decryption failed', fields: {} });
      }
    }

    setDecryptedAllergies(decrypted);
  }, [allergies, decryptData, isKeyReady]);

  useEffect(() => {
    fetchAllergies();
  }, [fetchAllergies, refreshKey]);

  useEffect(() => {
    decryptAllergies();
  }, [decryptAllergies]);

  const filteredAllergies = allergies.filter((allergy) => {
    if (!showActiveOnly) return true;
    const data = decryptedAllergies.get(allergy.id);
    return data?.fields.isActive !== false;
  });

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
        <h2 className="text-xl font-semibold text-gray-900">My Allergies & Sensitivities</h2>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={showActiveOnly}
              onChange={(e) => setShowActiveOnly(e.target.checked)}
              className="rounded border-border text-gray-600 "
            />
            Active only
          </label>
        </div>
      </div>

      <p className="text-sm text-gray-500 mb-4">
        Add allergies and food or other sensitivities from the journal by creating an entry with the &quot;allergy&quot; topic.
      </p>

      {filteredAllergies.length === 0 ? (
        <div className="text-center py-12 backdrop-blur-md bg-white/70 rounded-lg border border-border">
          <p className="text-gray-500">No allergies/sensitivities found</p>
          <p className="text-sm text-gray-400 mt-1">
            Create an entry with the &quot;allergy&quot; topic to add allergies or food/other sensitivities.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredAllergies.map((allergy) => {
            const data = decryptedAllergies.get(allergy.id);

            return (
              <div key={allergy.id} className="backdrop-blur-md bg-white/70 rounded-lg border border-border p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">
                        {data?.name || 'Loading...'}
                      </h3>
                      {data?.fields.severity && (
                        <span className={`px-2 py-0.5 text-xs rounded-full ${SEVERITY_COLORS[data.fields.severity] || 'bg-gray-100 text-gray-600'}`}>
                          {SEVERITY_LABELS[data.fields.severity] || data.fields.severity}
                        </span>
                      )}
                      {data?.fields.isActive === false && (
                        <span className="px-2 py-0.5 backdrop-blur-md bg-white/60 text-gray-600 text-xs rounded-full">Inactive</span>
                      )}
                    </div>
                    {data?.fields.allergenType && (
                      <p className="text-sm text-gray-600 mt-1">
                        Type: {data.fields.allergenType}
                      </p>
                    )}
                    {data?.fields.reactions && (
                      <p className="text-sm text-gray-600 mt-1">
                        Reactions: {data.fields.reactions}
                      </p>
                    )}
                    {data?.fields.notes && (
                      <p className="text-sm text-gray-500 mt-1">{data.fields.notes}</p>
                    )}
                    {data?.fields.diagnosed && (
                      <p className="text-xs text-gray-400 mt-2">Diagnosed: {data.fields.diagnosed}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleEditAllergy(allergy.id)}
                    className="p-1 text-gray-400 hover:text-gray-600 transition-colors ml-2"
                    title="Edit allergy"
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
