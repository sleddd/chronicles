'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useEncryption } from '@/lib/hooks/useEncryption';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface CustomField {
  id: string;
  encryptedData: string;
  iv: string;
}

interface ExerciseEntry {
  id: string;
  encryptedContent: string;
  iv: string;
  custom_fields: CustomField[] | null;
  entryDate: string;
  createdAt: string;
}

interface DecryptedExerciseFields {
  exerciseType?: string;
  duration?: number;
  intensity?: 'low' | 'medium' | 'high';
  distance?: number;
  distanceUnit?: 'miles' | 'km';
  calories?: number;
  performedAt?: string;
  notes?: string;
}

interface Props {
  selectedDate: string;
  onDataChange: () => void;
  refreshKey: number;
}

const EXERCISE_TYPE_ICONS: Record<string, string> = {
  yoga: '🧘',
  cardio: '💪',
  strength: '🏋️',
  swimming: '🏊',
  running: '🏃',
  cycling: '🚴',
  walking: '🚶',
  hiking: '🥾',
  other: '⚡',
};

const INTENSITY_COLORS: Record<string, { bg: string; text: string }> = {
  low: { bg: 'bg-green-100', text: 'text-green-700' },
  medium: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  high: { bg: 'bg-red-100', text: 'text-red-700' },
};

export function ExerciseTab({ selectedDate, refreshKey }: Props) {
  const router = useRouter();
  const [exerciseEntries, setExerciseEntries] = useState<ExerciseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [decryptedEntries, setDecryptedEntries] = useState<Map<string, { name: string; fields: DecryptedExerciseFields }>>(new Map());
  const { decryptData, isKeyReady } = useEncryption();

  const handleEditExercise = (entryId: string) => {
    router.push(`/?entry=${entryId}`);
  };

  const fetchExerciseEntries = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/entries?customType=exercise&date=${selectedDate}`);
      const data = await response.json();
      setExerciseEntries(data.entries || []);
    } catch (error) {
      console.error('Failed to fetch exercise entries:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  const decryptEntries = useCallback(async () => {
    if (!isKeyReady || exerciseEntries.length === 0) return;

    const decrypted = new Map<string, { name: string; fields: DecryptedExerciseFields }>();

    for (const entry of exerciseEntries) {
      try {
        const name = await decryptData(entry.encryptedContent, entry.iv);
        const plainName = name.replace(/<[^>]*>/g, '').trim();
        const fields: DecryptedExerciseFields = {};

        if (entry.custom_fields) {
          for (const cf of entry.custom_fields) {
            try {
              const decryptedField = await decryptData(cf.encryptedData, cf.iv);
              const parsed = JSON.parse(decryptedField);
              if (parsed.fieldKey === 'exerciseType') fields.exerciseType = parsed.value;
              if (parsed.fieldKey === 'duration') fields.duration = parsed.value;
              if (parsed.fieldKey === 'intensity') fields.intensity = parsed.value;
              if (parsed.fieldKey === 'distance') fields.distance = parsed.value;
              if (parsed.fieldKey === 'distanceUnit') fields.distanceUnit = parsed.value;
              if (parsed.fieldKey === 'calories') fields.calories = parsed.value;
              if (parsed.fieldKey === 'performedAt') fields.performedAt = parsed.value;
              if (parsed.fieldKey === 'notes') fields.notes = parsed.value;
            } catch {
              // Skip
            }
          }
        }

        decrypted.set(entry.id, { name: plainName || 'Workout', fields });
      } catch {
        decrypted.set(entry.id, { name: 'Decryption failed', fields: {} });
      }
    }

    setDecryptedEntries(decrypted);
  }, [exerciseEntries, decryptData, isKeyReady]);

  useEffect(() => {
    fetchExerciseEntries();
  }, [fetchExerciseEntries, refreshKey]);

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

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const getExerciseIcon = (type: string) => {
    return EXERCISE_TYPE_ICONS[type.toLowerCase()] || EXERCISE_TYPE_ICONS.other;
  };

  const capitalizeFirst = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

  // Calculate stats
  const totalDuration = Array.from(decryptedEntries.values()).reduce((sum, entry) => sum + (entry.fields.duration || 0), 0);
  const totalCalories = Array.from(decryptedEntries.values()).reduce((sum, entry) => sum + (entry.fields.calories || 0), 0);

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
        <h2 className="text-xl font-semibold text-gray-900">Exercise Log</h2>
        <span className="text-gray-600">{formatDateDisplay(selectedDate)}</span>
      </div>

      <p className="text-sm text-gray-500 mb-4">
        Add exercise entries from the journal by creating an entry with the &quot;exercise&quot; topic.
      </p>

      {/* Stats Summary */}
      {exerciseEntries.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="backdrop-blur-md bg-white/70 rounded-lg border border-border p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{exerciseEntries.length}</div>
            <div className="text-sm text-gray-500">Workouts</div>
          </div>
          <div className="backdrop-blur-md bg-white/70 rounded-lg border border-border p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{formatDuration(totalDuration)}</div>
            <div className="text-sm text-gray-500">Total Time</div>
          </div>
          <div className="backdrop-blur-md bg-white/70 rounded-lg border border-border p-4 text-center">
            <div className="text-2xl font-bold text-orange-600">{totalCalories > 0 ? totalCalories : '-'}</div>
            <div className="text-sm text-gray-500">Calories</div>
          </div>
        </div>
      )}

      {/* Exercise List */}
      <div className="backdrop-blur-md bg-white/70 rounded-lg border border-border overflow-hidden">
        <div className="backdrop-blur-md bg-white/50 px-4 py-2 border-b border-border">
          <span className="font-medium text-gray-700 text-sm">TODAY&apos;S WORKOUTS</span>
        </div>

        {exerciseEntries.length === 0 ? (
          <div className="px-4 py-12 text-center text-gray-400">
            <div className="text-4xl mb-2">🏃</div>
            <p>No workouts logged for this day</p>
            <p className="text-sm mt-1">Create an exercise entry from the journal to track your workout</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {exerciseEntries.map((entry) => {
              const data = decryptedEntries.get(entry.id);
              const intensity = data?.fields.intensity || 'medium';
              const intensityColor = INTENSITY_COLORS[intensity];

              return (
                <div key={entry.id} className="px-4 py-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">{getExerciseIcon(data?.fields.exerciseType || 'other')}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">
                            {data?.fields.exerciseType ? capitalizeFirst(data.fields.exerciseType) : data?.name || 'Loading...'}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${intensityColor.bg} ${intensityColor.text}`}>
                            {capitalizeFirst(intensity)}
                          </span>
                        </div>
                        {data?.name && data.name !== 'Workout' && data.fields.exerciseType && (
                          <p className="text-sm text-gray-600 mt-0.5">{data.name}</p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                          {data?.fields.duration && (
                            <span className="flex items-center gap-1">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              {formatDuration(data.fields.duration)}
                            </span>
                          )}
                          {data?.fields.distance && (
                            <span className="flex items-center gap-1">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                              </svg>
                              {data.fields.distance} {data.fields.distanceUnit || 'mi'}
                            </span>
                          )}
                          {data?.fields.calories && (
                            <span className="flex items-center gap-1">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                              </svg>
                              {data.fields.calories} cal
                            </span>
                          )}
                          {data?.fields.performedAt && (
                            <span className="flex items-center gap-1">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              {formatTime(data.fields.performedAt)}
                            </span>
                          )}
                        </div>
                        {data?.fields.notes && (
                          <p className="text-sm text-gray-500 mt-2">{data.fields.notes}</p>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleEditExercise(entry.id)}
                      className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                      title="Edit exercise entry"
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
    </div>
  );
}
