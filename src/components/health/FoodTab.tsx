'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useEncryption } from '@/lib/hooks/useEncryption';
import { useEntriesCache } from '@/lib/hooks/useEntriesCache';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface CustomField {
  id: string;
  encryptedData: string;
  iv: string;
}

interface FoodEntry {
  id: string;
  encryptedContent: string;
  iv: string;
  custom_fields: CustomField[] | null;
  entryDate: string;
  createdAt: string;
}

interface DecryptedFoodFields {
  mealType?: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  consumedAt?: string;
  ingredients?: string[];
  notes?: string;
}

interface Props {
  selectedDate: string;
  onDataChange: () => void;
  refreshKey: number;
}

const MEAL_TYPES = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snack', label: 'Snack' },
] as const;

export function FoodTab({ selectedDate, refreshKey }: Props) {
  const router = useRouter();
  const [foodEntries, setFoodEntries] = useState<FoodEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [decryptedEntries, setDecryptedEntries] = useState<Map<string, { name: string; fields: DecryptedFoodFields }>>(new Map());
  const { decryptData, isKeyReady } = useEncryption();
  const { getEntries, isInitialized: isCacheInitialized } = useEntriesCache();

  const handleEditFood = (entryId: string) => {
    router.push(`/?entry=${entryId}`);
  };

  // Load food entries from cache
  const loadFoodFromCache = useCallback(() => {
    if (!isCacheInitialized) return;

    setLoading(true);
    try {
      const cachedFood = getEntries({ customType: 'food', date: selectedDate });
      setFoodEntries(cachedFood as FoodEntry[]);
    } catch (error) {
      console.error('Failed to load food entries from cache:', error);
    } finally {
      setLoading(false);
    }
  }, [isCacheInitialized, getEntries, selectedDate]);

  const decryptEntries = useCallback(async () => {
    if (!isKeyReady || foodEntries.length === 0) return;

    const decrypted = new Map<string, { name: string; fields: DecryptedFoodFields }>();

    for (const entry of foodEntries) {
      try {
        const name = await decryptData(entry.encryptedContent, entry.iv);
        const plainName = name.replace(/<[^>]*>/g, '').trim();
        const fields: DecryptedFoodFields = {};

        if (entry.custom_fields) {
          for (const cf of entry.custom_fields) {
            try {
              const decryptedField = await decryptData(cf.encryptedData, cf.iv);
              const parsed = JSON.parse(decryptedField);
              if (parsed.fieldKey === 'mealType') fields.mealType = parsed.value;
              if (parsed.fieldKey === 'consumedAt') fields.consumedAt = parsed.value;
              if (parsed.fieldKey === 'ingredients') fields.ingredients = parsed.value;
              if (parsed.fieldKey === 'notes') fields.notes = parsed.value;
            } catch {
              // Skip
            }
          }
        }

        decrypted.set(entry.id, { name: plainName || 'Unnamed Food', fields });
      } catch {
        decrypted.set(entry.id, { name: 'Decryption failed', fields: {} });
      }
    }

    setDecryptedEntries(decrypted);
  }, [foodEntries, decryptData, isKeyReady]);

  useEffect(() => {
    loadFoodFromCache();
  }, [loadFoodFromCache, refreshKey]);

  useEffect(() => {
    decryptEntries();
  }, [decryptEntries]);

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const formatDateDisplay = (dateStr: string) => {
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  };

  // Group entries by meal type
  const entriesByMeal = MEAL_TYPES.reduce((acc, meal) => {
    acc[meal.key] = foodEntries.filter(entry => {
      const data = decryptedEntries.get(entry.id);
      return data?.fields.mealType === meal.key;
    });
    return acc;
  }, {} as Record<string, FoodEntry[]>);

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
        <h2 className="text-xl font-semibold text-gray-900">Food Log</h2>
        <span className="text-gray-600">{formatDateDisplay(selectedDate)}</span>
      </div>

      <p className="text-sm text-gray-500 mb-4">
        Add food entries from the journal by creating an entry with the &quot;food&quot; topic.
      </p>

      <div className="space-y-6">
        {MEAL_TYPES.map((meal) => {
          const entries = entriesByMeal[meal.key];

          return (
            <div key={meal.key} className="backdrop-blur-md bg-white/70 rounded-lg border border-border overflow-hidden">
              <div className="backdrop-blur-md bg-white/50 px-4 py-2 border-b border-border flex items-center gap-2">
                <span className="font-medium text-gray-700 uppercase text-sm">{meal.label}</span>
                <span className="text-sm text-gray-400">({entries.length})</span>
              </div>

              {entries.length === 0 ? (
                <div className="px-4 py-6 text-center text-gray-400 text-sm">
                  No {meal.label.toLowerCase()} logged
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {entries.map((entry) => {
                    const data = decryptedEntries.get(entry.id);

                    return (
                      <div key={entry.id} className="px-4 py-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">{data?.name || 'Loading...'}</span>
                            {data?.fields.consumedAt && (
                              <span className="text-sm text-gray-500">
                                ({formatTime(data.fields.consumedAt)})
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleEditFood(entry.id)}
                            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                            title="Edit food entry"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                        </div>
                        {data?.fields.ingredients && data.fields.ingredients.length > 0 && (
                          <p className="text-sm text-gray-600 mt-1">
                            Ingredients: {data.fields.ingredients.join(', ')}
                          </p>
                        )}
                        {data?.fields.notes && (
                          <p className="text-sm text-gray-500 mt-1">{data.fields.notes}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
