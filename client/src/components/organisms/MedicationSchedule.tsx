import { useState, useEffect, useMemo, useCallback } from 'react';
import styled from 'styled-components';
import { Icon } from '../atoms/core/Icon.jsx';
import { EmptyState } from '../atoms/EmptyState.js';
import { Spinner } from '../atoms/Spinner.js';
import { useEntriesStore } from '../../stores/entriesStore.js';
import { doses as dosesApi } from '../../services/api.js';
import { useDoseToMeals } from '../../hooks/useDoseToMeals.js';
import { stripHtml } from '../../utils/stripHtml.js';
import { toDateStr, formatTime12h, formatDateDisplay } from '../../utils/dateUtils.js';
import type { DoseLogRecord } from '../../services/api.js';
import type { ScheduledDose } from '../../types/health.js';
import { DashPanel, DashPanelHead } from '../molecules/DashPanel.js';
import { TickMark } from '../atoms/TickMark.js';

/* ── Styled ── */

/* ‹ Today › — sits across from the panel title */
const DateNav = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const NavButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  &:hover { color: var(--text-primary); }
`;

const DateLabel = styled.span`
  min-width: 72px;
  text-align: center;
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
`;

const ProgressStats = styled.div`
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-muted);
`;

const ProgressTrack = styled.div`
  height: 4px;
  border-radius: 2px;
  background: var(--border-card);
  overflow: hidden;
`;

const ProgressFill = styled.div<{ $percent: number }>`
  height: 100%;
  width: ${({ $percent }) => $percent}%;
  background: var(--color-accent-fill, var(--color-accent));
  border-radius: 2px;
  transition: width 0.4s ease;
`;

const TimeGroup = styled.div`
  margin-top: 26px;
`;

const TimeHeader = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-subtle);
  font-family: var(--font-sans);
`;

const TimeLabel = styled.span`
  font-size: 13px;
  font-weight: 600;
  color: var(--text-tertiary);
`;

const TimeAside = styled.span`
  display: inline-flex;
  align-items: baseline;
  gap: 14px;
  font-size: 13px;
  color: var(--text-muted);
`;

const TakeAll = styled.button`
  padding: 0;
  border: none;
  background: none;
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 600;
  color: var(--color-accent-link);
  cursor: pointer;
  &:hover { text-decoration: underline; }
  &:disabled { opacity: 0.5; cursor: default; text-decoration: none; }
`;

const DoseRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 36px;
  &:first-of-type { margin-top: 6px; }
`;

/* Round tick: the app's TickMark — grey ring, or the accent check-circle */
const DoseCheckButton = styled.button<{ $taken: boolean }>`
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; border-radius: 50%; }
  &:disabled { opacity: 0.5; cursor: wait; }
`;

const DoseName = styled.span<{ $taken: boolean }>`
  flex: 1;
  min-width: 0;
  font-family: var(--font-sans);
  font-size: 14px;
  color: ${({ $taken }) => ($taken ? 'var(--text-muted)' : 'var(--text-secondary)')};
`;

const DoseTakenAt = styled.span`
  flex: none;
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--text-muted);
`;

const ErrorNote = styled.p`
  margin: 16px 0 0;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--color-danger);
`;

/* ── Props ── */

interface MedicationScheduleProps {
  isReady: boolean;
  /** Panel title; the date switcher sits across from it */
  title?: string;
}

/* ── Component ── */

export function MedicationSchedule({ isReady, title = 'Medications' }: MedicationScheduleProps) {
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);

  const [viewDate, setViewDate] = useState(() => toDateStr(new Date()));
  const [doseLogs, setDoseLogs] = useState<Record<string, DoseLogRecord>>({});
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [savingDose, setSavingDose] = useState<string | null>(null);
  const [doseError, setDoseError] = useState<string | null>(null);
  const doseToMeals = useDoseToMeals();

  const medicationTopicId = useMemo(
    () => allTopics.find(t => t.name.toLowerCase() === 'medication')?.id,
    [allTopics]
  );

  const scheduledDoses: ScheduledDose[] = useMemo(() => {
    if (!medicationTopicId) return [];
    const doses: ScheduledDose[] = [];

    for (const entry of entries) {
      const meta = entry.metadata as Record<string, unknown> | undefined;
      if (!meta || meta._taxonomyId !== medicationTopicId) continue;

      const cf = (meta._customFields as Record<string, unknown>) || {};
      if (cf.isActive === false) continue;

      const name = stripHtml(entry.content).slice(0, 120) || 'Unnamed Medication';
      const dosage = (cf.dosage as string) || '';
      const scheduleTimes = (cf.scheduleTimes as string[]) || [];

      for (const time of scheduleTimes) {
        doses.push({ medicationPostId: entry.id, medicationName: name, dosage, time });
      }
    }

    doses.sort((a, b) => a.time.localeCompare(b.time));
    return doses;
  }, [entries, medicationTopicId]);

  const fetchLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const data = await dosesApi.getByDate(viewDate);
      const map: Record<string, DoseLogRecord> = {};
      for (const log of data.logs) {
        if (log.asNeeded) continue; // as-needed doses are their own records, not scheduled ones
        const normalizedTime = log.scheduledTime.substring(0, 5);
        map[`${log.medicationPostId}-${normalizedTime}`] = log;
      }
      setDoseLogs(map);
    } catch (err) {
      console.error('Failed to fetch dose logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  }, [viewDate]);

  useEffect(() => {
    if (!isReady) return;
    fetchLogs();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchLogs();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isReady, fetchLogs]);

  const handleCheckDose = async (dose: ScheduledDose, checked: boolean) => {
    // Normalize time to HH:MM for API validation
    const normalizedTime = dose.time.substring(0, 5).padStart(5, '0');
    const key = `${dose.medicationPostId}-${normalizedTime}`;
    const newStatus = checked ? 'taken' : 'pending';
    setSavingDose(key);
    setDoseError(null);

    try {
      const takenAt = newStatus === 'taken'
        ? new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
        : null;

      const { log } = await dosesApi.log({
        medicationPostId: dose.medicationPostId,
        scheduledTime: normalizedTime,
        date: viewDate,
        status: newStatus,
        takenAt,
      });

      const normalizedLog = { ...log, scheduledTime: log.scheduledTime.substring(0, 5) };
      setDoseLogs(prev => ({ ...prev, [key]: normalizedLog }));
      // Vitamins/iron in this dose count toward the day's Meals totals
      const sync = newStatus === 'taken' ? doseToMeals.onTaken : doseToMeals.onUntaken;
      void sync(dose.medicationPostId, viewDate, normalizedTime).catch(err => console.warn('Dose → Meals sync failed:', err));
    } catch (err) {
      console.error('Failed to update dose:', err);
      setDoseError(`Failed to update ${dose.medicationName}`);
    } finally {
      setSavingDose(null);
    }
  };

  const getDoseStatus = (dose: ScheduledDose): string => {
    const key = `${dose.medicationPostId}-${dose.time.substring(0, 5)}`;
    return doseLogs[key]?.status || 'pending';
  };

  const getDoseLog = (dose: ScheduledDose): DoseLogRecord | undefined => {
    const key = `${dose.medicationPostId}-${dose.time.substring(0, 5)}`;
    return doseLogs[key];
  };

  const totalDoses = scheduledDoses.length;
  const completedDoses = scheduledDoses.filter(d => getDoseStatus(d) === 'taken').length;
  const progressPercent = totalDoses > 0 ? Math.round((completedDoses / totalDoses) * 100) : 0;

  const dosesByTime = useMemo(() => {
    const map: Record<string, ScheduledDose[]> = {};
    for (const dose of scheduledDoses) {
      (map[dose.time] ||= []).push(dose);
    }
    return map;
  }, [scheduledDoses]);

  const navigateDate = (days: number) => {
    const date = new Date(viewDate + 'T12:00:00');
    date.setDate(date.getDate() + days);
    setViewDate(toDateStr(date));
  };

  const takeAll = async (timeDoses: ScheduledDose[]) => {
    for (const d of timeDoses) if (getDoseStatus(d) !== 'taken') await handleCheckDose(d, true);
  };

  const isToday = viewDate === toDateStr(new Date());

  return (
    <DashPanel aria-label={title}>
      <DashPanelHead
        title={title}
        aside={(
          <DateNav>
            <NavButton onClick={() => navigateDate(-1)} title="Previous day" aria-label="Previous day">
              <Icon name="chevron-left" size={16} strokeWidth={2} />
            </NavButton>
            <DateLabel>{isToday ? 'Today' : formatDateDisplay(viewDate)}</DateLabel>
            <NavButton onClick={() => navigateDate(1)} title="Next day" aria-label="Next day">
              <Icon name="chevron-right" size={16} strokeWidth={2} />
            </NavButton>
          </DateNav>
        )}
      />

      {totalDoses > 0 && (
        <div>
          <ProgressStats>
            <span>{completedDoses} of {totalDoses} doses taken</span>
            <span>{progressPercent}%</span>
          </ProgressStats>
          <ProgressTrack><ProgressFill $percent={progressPercent} /></ProgressTrack>
        </div>
      )}

      {doseError && <ErrorNote role="alert">{doseError}</ErrorNote>}

      {loadingLogs ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size={30} /></div>
      ) : scheduledDoses.length === 0 ? (
        <EmptyState message="No medications scheduled" submessage="Add active medications with schedule times to see your daily schedule." />
      ) : (
        Object.entries(dosesByTime).map(([time, timeDoses]) => {
          const taken = timeDoses.filter(d => getDoseStatus(d) === 'taken').length;
          return (
            <TimeGroup key={time}>
              <TimeHeader>
                <TimeLabel>{formatTime12h(time)}</TimeLabel>
                <TimeAside>
                  <span>{taken} / {timeDoses.length}</span>
                  <TakeAll type="button" disabled={taken === timeDoses.length || savingDose !== null}
                    onClick={() => void takeAll(timeDoses)}>Take all</TakeAll>
                </TimeAside>
              </TimeHeader>
              {timeDoses.map((dose, i) => {
                const log = getDoseLog(dose);
                const isTaken = getDoseStatus(dose) === 'taken';
                const isSaving = savingDose === `${dose.medicationPostId}-${dose.time.substring(0, 5).padStart(5, '0')}`;
                return (
                  <DoseRow key={`${dose.medicationPostId}-${time}-${i}`}>
                    <DoseCheckButton
                      $taken={isTaken}
                      disabled={isSaving}
                      onClick={() => handleCheckDose(dose, !isTaken)}
                      aria-pressed={isTaken}
                      aria-label={isTaken ? `Mark ${dose.medicationName} as not taken` : `Mark ${dose.medicationName} as taken`}
                    >
                      <TickMark checked={isTaken} />
                    </DoseCheckButton>
                    <DoseName $taken={isTaken}>{dose.medicationName}{dose.dosage ? ` ${dose.dosage}` : ''}</DoseName>
                    {isTaken && log?.takenAt && <DoseTakenAt>Taken {log.takenAt}</DoseTakenAt>}
                  </DoseRow>
                );
              })}
            </TimeGroup>
          );
        })
      )}
    </DashPanel>
  );
}
