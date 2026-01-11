import { useState, useEffect, useCallback } from 'react';
import { useEntriesCache } from '@/lib/hooks/useEntriesCache';

interface TimezoneState {
  timezone: string;
  loading: boolean;
  today: string;
}

// Get today's date in a specific timezone
function getTodayInTimezone(timezone: string): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  // en-CA format gives us YYYY-MM-DD
  return formatter.format(now);
}

export function useTimezone() {
  const { settings, isInitialized: isCacheInitialized } = useEntriesCache();

  const [state, setState] = useState<TimezoneState>({
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    loading: true,
    today: new Date().toISOString().split('T')[0],
  });

  // Load timezone from cache when available
  useEffect(() => {
    if (!isCacheInitialized) return;

    const userTimezone = settings.timezone || 'UTC';
    setState({
      timezone: userTimezone,
      loading: false,
      today: getTodayInTimezone(userTimezone),
    });
  }, [isCacheInitialized, settings.timezone]);

  // Check if a given date is today in user's timezone
  const isToday = useCallback((date: string): boolean => {
    return date === state.today;
  }, [state.today]);

  // Refetch just reloads from cache (settings may have been updated)
  const refetch = useCallback(() => {
    if (!isCacheInitialized) return;
    const userTimezone = settings.timezone || 'UTC';
    setState({
      timezone: userTimezone,
      loading: false,
      today: getTodayInTimezone(userTimezone),
    });
  }, [isCacheInitialized, settings.timezone]);

  return {
    timezone: state.timezone,
    loading: state.loading,
    today: state.today,
    isToday,
    refetch,
  };
}
