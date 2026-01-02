'use client';

import { useEffect, useState, useCallback } from 'react';
import { useEncryption } from '@/lib/hooks/useEncryption';
import { useAccentColor } from '@/lib/hooks/useAccentColor';

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

interface DoseLog {
  id: string;
  medicationId: string;
  scheduledTime: string;
  date: string;
  status: 'taken' | 'skipped' | 'pending';
  takenAt?: string;
}

interface Props {
  selectedDate: string;
  refreshKey: number;
  onDataChange: () => void;
}

export function ScheduleTab({ selectedDate: initialDate, refreshKey, onDataChange }: Props) {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [scheduledDoses, setScheduledDoses] = useState<ScheduledDose[]>([]);
  const [doseLogs, setDoseLogs] = useState<Record<string, DoseLog>>({});
  const [viewDate, setViewDate] = useState(initialDate);
  const { decryptData, isKeyReady } = useEncryption();
  const { accentColor, hoverColor } = useAccentColor();

  // Update viewDate when initialDate changes (e.g., from parent component)
  useEffect(() => {
    setViewDate(initialDate);
  }, [initialDate]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all medications from entries API
      const medResponse = await fetch('/api/entries?customType=medication');
      const medData = await medResponse.json();
      setMedications(medData.entries || []);

      // Fetch dose logs for selected date
      const logsResponse = await fetch(`/api/medications/doses?date=${viewDate}`);
      const logsData = await logsResponse.json();

      // Create a map of logs keyed by medicationId-scheduledTime
      // Note: PostgreSQL TIME type returns "HH:MM:SS", so normalize to "HH:MM"
      const logsMap: Record<string, DoseLog> = {};
      for (const log of logsData.logs || []) {
        const normalizedTime = log.scheduledTime.substring(0, 5); // "08:00:00" -> "08:00"
        const key = `${log.medicationId}-${normalizedTime}`;
        logsMap[key] = log;
      }
      setDoseLogs(logsMap);
    } catch (error) {
      console.error('Failed to fetch schedule data:', error);
    } finally {
      setLoading(false);
    }
  }, [viewDate]);

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

  const [savingDose, setSavingDose] = useState<string | null>(null);

  const handleCheckDose = async (dose: ScheduledDose, checked: boolean) => {
    const key = `${dose.medicationId}-${dose.time}`;
    const newStatus = checked ? 'taken' : 'pending';

    setSavingDose(key);

    try {
      // Format local time as a simple string (e.g., "7:45 PM")
      const now = new Date();
      const localTimeStr = newStatus === 'taken'
        ? now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
        : null;

      const response = await fetch('/api/medications/doses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          medicationId: dose.medicationId,
          scheduledTime: dose.time,
          date: viewDate,
          status: newStatus,
          takenAt: localTimeStr,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        // Normalize the returned log's scheduledTime to match our key format
        const normalizedLog = {
          ...data.log,
          scheduledTime: data.log.scheduledTime.substring(0, 5),
        };
        setDoseLogs(prev => ({
          ...prev,
          [key]: normalizedLog,
        }));
        onDataChange();
      } else {
        console.error('Failed to update dose status:', await response.text());
      }
    } catch (error) {
      console.error('Failed to update dose status:', error);
    } finally {
      setSavingDose(null);
    }
  };

  const getDoseStatus = (dose: ScheduledDose): 'taken' | 'skipped' | 'pending' => {
    const key = `${dose.medicationId}-${dose.time}`;
    return doseLogs[key]?.status || 'pending';
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  // Calculate progress
  const totalDoses = scheduledDoses.length;
  const completedDoses = scheduledDoses.filter(dose => getDoseStatus(dose) === 'taken').length;
  const progressPercent = totalDoses > 0 ? Math.round((completedDoses / totalDoses) * 100) : 0;

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


  // Date navigation helpers
  const navigateDate = (days: number) => {
    const date = new Date(viewDate + 'T12:00:00');
    date.setDate(date.getDate() + days);
    setViewDate(date.toISOString().split('T')[0]);
  };

  const goToToday = () => {
    setViewDate(initialDate);
  };

  const isToday = viewDate === initialDate;

  const formatTakenTime = (takenAt: string) => {
    // takenAt is already stored as a formatted local time string (e.g., "7:45 PM")
    return takenAt;
  };

  if (loading) {
    return (
      <div className="p-4 flex items-center justify-center h-64">
        <p className="text-gray-500">Loading schedule...</p>
      </div>
    );
  }

  return (
    <div className="px-8 py-4 pb-12 backdrop-blur-md bg-white/70">

      {/* Date Navigation */}
      <div className="flex items-center justify-between mb-4 p-3">
        <button
          type="button"
          onClick={() => navigateDate(-1)}
          className="p-2 hover:backdrop-blur-sm bg-white/40 rounded-full transition-colors"
          title="Previous day"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div className="flex items-center gap-3">
          <span className="text-gray-900 font-medium">{formatDateDisplay(viewDate)}</span>
          {!isToday && (
            <button
              type="button"
              onClick={goToToday}
              className="text-xs px-2 py-1 rounded transition-colors"
              style={{ backgroundColor: '#e5e7eb', color: accentColor }}
            >
              Today
            </button>
          )}
          {isToday && (
            <span
              className="text-xs px-2 py-1 rounded"
              style={{ backgroundColor: '#e5e7eb', color: accentColor }}
            >
              Today
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => navigateDate(1)}
          className="p-2 hover:backdrop-blur-sm bg-white/40 rounded-full transition-colors"
          title="Next day"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Progress Bar */}
      {totalDoses > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Daily Progress</span>
            <span className="text-sm text-gray-600">
              {completedDoses} of {totalDoses} doses taken ({progressPercent}%)
            </span>
          </div>
          <div className="w-full rounded-full h-3 overflow-hidden" style={{ backgroundColor: '#e5e7eb' }}>
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${progressPercent}%`,
                backgroundColor: progressPercent === 100 ? '#22c55e' : accentColor,
              }}
            />
          </div>
          {progressPercent === 100 && (
            <p className="text-sm mt-2 font-medium" style={{ color: accentColor }}>
              All medications taken for today!
            </p>
          )}
        </div>
      )}

      <p className="text-sm text-gray-500 mb-4">
        Click the circle to mark a medication as taken for this day.
      </p>

      {scheduledDoses.length === 0 ? (
        <div className="text-center py-12 backdrop-blur-md bg-white/70 rounded-lg border border-border">
          <p className="text-gray-500">No medications scheduled</p>
          <p className="text-sm text-gray-400 mt-1">Add medications to see your daily schedule</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(dosesByTime).map(([time, doses]) => (
            <div key={time} className="backdrop-blur-md bg-white/70 rounded-lg border border-border overflow-hidden">
              <div className="backdrop-blur-md bg-white/50 px-4 py-2 border-b border-border">
                <span className="font-medium text-gray-700">{formatTime(time)}</span>
              </div>
              <div className="divide-y divide-border">
                {doses.map((dose, index) => {
                  const status = getDoseStatus(dose);
                  const key = `${dose.medicationId}-${dose.time}`;
                  const log = doseLogs[key];
                  const isTaken = status === 'taken';
                  const isSaving = savingDose === key;
                  return (
                    <div
                      key={`${dose.medicationId}-${time}-${index}`}
                      className="w-full px-4 py-3 flex items-center gap-3 transition-colors"
                      style={isTaken ? { backgroundColor: '#f7f7f7' } : undefined}
                    >
                      {/* Round checkbox */}
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => handleCheckDose(dose, !isTaken)}
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all cursor-pointer flex-shrink-0 ${isSaving ? 'opacity-50' : ''} ${!isTaken ? 'backdrop-blur-md bg-white/70 border-border' : ''}`}
                        style={isTaken ? { backgroundColor: accentColor, borderColor: accentColor } : undefined}
                        aria-label={isTaken ? 'Mark as not taken' : 'Mark as taken'}
                      >
                        {isTaken && (
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <span
                          className={`font-medium ${isTaken ? 'line-through' : 'text-gray-900'}`}
                          style={isTaken ? { color: hoverColor } : undefined}
                        >
                          {dose.medicationName} {dose.dosage}
                        </span>
                        {isTaken && log?.takenAt && (
                          <span className="ml-2 text-xs" style={{ color: accentColor }}>
                            (taken at {formatTakenTime(log.takenAt)})
                          </span>
                        )}
                      </div>
                      <span
                        className={`text-xs px-2 py-1 rounded-full flex-shrink-0 ${isTaken ? '' : 'text-gray-500'}`}
                        style={{ backgroundColor: '#e5e7eb', color: isTaken ? hoverColor : undefined }}
                      >
                        {isSaving ? 'Saving...' : isTaken ? 'Taken' : 'Pending'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
