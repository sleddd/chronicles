import { useState, useEffect, useCallback } from 'react';

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
  const [state, setState] = useState<TimezoneState>({
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    loading: true,
    today: new Date().toISOString().split('T')[0],
  });

  const fetchTimezone = useCallback(async () => {
    try {
      const response = await fetch('/api/settings');
      const data = await response.json();
      const userTimezone = data.settings?.timezone || 'UTC';
      setState({
        timezone: userTimezone,
        loading: false,
        today: getTodayInTimezone(userTimezone),
      });
    } catch (error) {
      console.error('Failed to fetch timezone:', error);
      // Fall back to browser timezone
      const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      setState({
        timezone: browserTimezone,
        loading: false,
        today: getTodayInTimezone(browserTimezone),
      });
    }
  }, []);

  useEffect(() => {
    fetchTimezone();
  }, [fetchTimezone]);

  // Check if a given date is today in user's timezone
  const isToday = useCallback((date: string): boolean => {
    return date === state.today;
  }, [state.today]);

  return {
    timezone: state.timezone,
    loading: state.loading,
    today: state.today,
    isToday,
    refetch: fetchTimezone,
  };
}
