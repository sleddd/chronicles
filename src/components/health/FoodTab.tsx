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

interface FoodEntry {
  id: string;
  encryptedContent: string;
  iv: string;
  custom_fields: CustomField[] | null;
  entryDate: string | Date | null;
  createdAt: string | Date;
}

interface DecryptedFoodFields {
  mealType?: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  consumedAt?: string;
  ingredients?: string[];
  calories?: number;
  notes?: string;
}

type ViewMode = 'today' | 'week' | 'month' | 'all';

interface Props {
  selectedDate: string;
  onDataChange: () => void;
  refreshKey: number;
}

const MEAL_TYPES = [
  { key: 'breakfast', label: 'Breakfast', icon: '🌅' },
  { key: 'lunch', label: 'Lunch', icon: '☀️' },
  { key: 'dinner', label: 'Dinner', icon: '🌙' },
  { key: 'snack', label: 'Snack', icon: '🍿' },
] as const;

export function FoodTab({ selectedDate, refreshKey }: Props) {
  const router = useRouter();
  const [foodEntries, setFoodEntries] = useState<FoodEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [decryptedEntries, setDecryptedEntries] = useState<Map<string, { name: string; fields: DecryptedFoodFields }>>(new Map());
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const { decryptData, isKeyReady } = useEncryption();
  const { getEntriesByType, isInitialized: isCacheInitialized } = useEntriesCache();
  const { accentColor } = useAccentColor();

  const handleEditFood = (entryId: string) => {
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

  // Load food entries from cache
  const loadFoodFromCache = useCallback(() => {
    if (!isCacheInitialized) return;

    setLoading(true);
    try {
      const dateRange = getDateRange();
      let entries = getEntriesByType('food') as FoodEntry[];

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

      setFoodEntries(entries);
    } catch (error) {
      console.error('Failed to load food entries from cache:', error);
    } finally {
      setLoading(false);
    }
  }, [isCacheInitialized, getEntriesByType, getDateRange, viewMode]);

  const decryptEntries = useCallback(async () => {
    if (!isKeyReady) return;

    if (foodEntries.length === 0) {
      setDecryptedEntries(new Map());
      return;
    }

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
              if (parsed.fieldKey === 'calories' && parsed.value != null) {
                fields.calories = typeof parsed.value === 'number' ? parsed.value : parseInt(parsed.value, 10) || undefined;
              }
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

  // Calculate stats
  const totalCalories = Array.from(decryptedEntries.values()).reduce((sum, entry) => sum + (entry.fields.calories || 0), 0);
  const mealsWithCalories = Array.from(decryptedEntries.values()).filter(entry => entry.fields.calories && entry.fields.calories > 0).length;

  // Group entries by date
  const entriesByDate = foodEntries.reduce((acc, entry) => {
    let date = normalizeDate(entry.entryDate);
    if (date === 'unknown' && entry.createdAt) {
      date = normalizeDate(entry.createdAt);
    }
    if (!acc[date]) acc[date] = [];
    acc[date].push(entry);
    return acc;
  }, {} as Record<string, FoodEntry[]>);

  const sortedDates = Object.keys(entriesByDate).sort((a, b) => b.localeCompare(a));

  // Get entries for a specific date grouped by meal type
  const getEntriesByMealType = (entries: FoodEntry[]) => {
    return MEAL_TYPES.reduce((acc, meal) => {
      acc[meal.key] = entries.filter(entry => {
        const data = decryptedEntries.get(entry.id);
        return data?.fields.mealType === meal.key;
      });
      return acc;
    }, {} as Record<string, FoodEntry[]>);
  };

  // Calculate daily calories for a set of entries
  const calculateDailyCalories = (entries: FoodEntry[]) => {
    return entries.reduce((sum, entry) => {
      const data = decryptedEntries.get(entry.id);
      return sum + (data?.fields.calories || 0);
    }, 0);
  };

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
      </div>

      <p className="text-sm text-gray-500 mb-4">
        Add food entries from the journal by creating an entry with the &quot;food&quot; topic.
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
      {foodEntries.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="backdrop-blur-md bg-white/70 rounded-lg border border-border p-4 text-center">
            <div className="text-2xl font-bold" style={{ color: accentColor }}>{foodEntries.length}</div>
            <div className="text-sm text-gray-500">Meals</div>
          </div>
          <div className="backdrop-blur-md bg-white/70 rounded-lg border border-border p-4 text-center">
            <div className="text-2xl font-bold" style={{ color: accentColor }}>
              {totalCalories > 0 ? totalCalories.toLocaleString() : '-'}
            </div>
            <div className="text-sm text-gray-500">Total Calories</div>
          </div>
          <div className="backdrop-blur-md bg-white/70 rounded-lg border border-border p-4 text-center">
            <div className="text-2xl font-bold" style={{ color: accentColor }}>
              {mealsWithCalories > 0 ? Math.round(totalCalories / mealsWithCalories) : '-'}
            </div>
            <div className="text-sm text-gray-500">Avg per Meal</div>
          </div>
        </div>
      )}

      {foodEntries.length === 0 ? (
        <div className="backdrop-blur-md bg-white/70 rounded-lg border border-border overflow-hidden">
          <div className="px-4 py-12 text-center text-gray-400">
            <div className="text-4xl mb-2">🍽️</div>
            <p>No meals logged {viewMode === 'today' ? 'today' : viewMode === 'all' ? 'yet' : `in the past ${viewMode}`}</p>
            <p className="text-sm mt-1">Create a food entry from the journal to track your meals</p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedDates.map((date) => {
            const dayEntries = entriesByDate[date];
            const entriesByMeal = getEntriesByMealType(dayEntries);
            const dailyCalories = calculateDailyCalories(dayEntries);

            return (
              <div key={date}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-gray-500">{formatDateDisplay(date)}</h3>
                  {dailyCalories > 0 && (
                    <span className="text-sm font-medium" style={{ color: accentColor }}>
                      {dailyCalories.toLocaleString()} cal
                    </span>
                  )}
                </div>
                <div className="backdrop-blur-md bg-white/70 rounded-lg border border-border overflow-hidden">
                  {MEAL_TYPES.map((meal) => {
                    const entries = entriesByMeal[meal.key];
                    if (entries.length === 0) return null;

                    const mealCalories = entries.reduce((sum, entry) => {
                      const data = decryptedEntries.get(entry.id);
                      return sum + (data?.fields.calories || 0);
                    }, 0);

                    return (
                      <div key={meal.key} className="border-b border-border last:border-b-0">
                        <div className="backdrop-blur-md bg-white/50 px-4 py-2 border-b border-border flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span>{meal.icon}</span>
                            <span className="font-medium text-gray-700 uppercase text-sm">{meal.label}</span>
                            <span className="text-sm text-gray-400">({entries.length})</span>
                          </div>
                          {mealCalories > 0 && (
                            <span className="text-sm text-gray-500">{mealCalories} cal</span>
                          )}
                        </div>

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
                                    {data?.fields.calories && data.fields.calories > 0 && (
                                      <span
                                        className="px-2 py-0.5 rounded-full text-xs font-medium"
                                        style={{ backgroundColor: `${accentColor}20`, color: accentColor }}
                                      >
                                        {data.fields.calories} cal
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
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
