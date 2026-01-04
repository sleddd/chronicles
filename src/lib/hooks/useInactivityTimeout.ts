'use client';

import { useEffect, useRef, useCallback } from 'react';

// Default timeout: 5 minutes (300000ms)
const DEFAULT_TIMEOUT = parseInt(process.env.NEXT_PUBLIC_INACTIVITY_TIMEOUT || '300000', 10);
// Warning before timeout: 1 minute before (60000ms)
const DEFAULT_WARNING = parseInt(process.env.NEXT_PUBLIC_INACTIVITY_WARNING || '60000', 10);

interface UseInactivityTimeoutOptions {
  timeout?: number;
  warningTime?: number;
  onTimeout: () => void;
  onWarning?: () => void;
  enabled?: boolean;
}

/**
 * Hook that monitors user activity and triggers callbacks on inactivity
 *
 * Security purpose:
 * - Auto-clears sensitive data after period of inactivity
 * - Reduces exposure window if user walks away from computer
 * - Shows warning before timeout to prevent accidental data loss
 *
 * Activity events monitored:
 * - Mouse movement, clicks
 * - Keyboard input
 * - Touch events
 * - Scroll events
 *
 * @param options Configuration options
 * @returns reset function to manually restart the timer
 */
export function useInactivityTimeout({
  timeout = DEFAULT_TIMEOUT,
  warningTime = DEFAULT_WARNING,
  onTimeout,
  onWarning,
  enabled = true,
}: UseInactivityTimeoutOptions) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const warningRef = useRef<NodeJS.Timeout | null>(null);
  const warningShownRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (warningRef.current) {
      clearTimeout(warningRef.current);
      warningRef.current = null;
    }
  }, []);

  const startTimers = useCallback(() => {
    clearTimers();
    warningShownRef.current = false;

    // Set warning timer (fires before timeout)
    if (onWarning && warningTime > 0 && timeout > warningTime) {
      warningRef.current = setTimeout(() => {
        if (!warningShownRef.current) {
          warningShownRef.current = true;
          onWarning();
        }
      }, timeout - warningTime);
    }

    // Set timeout timer
    timeoutRef.current = setTimeout(() => {
      onTimeout();
    }, timeout);
  }, [clearTimers, timeout, warningTime, onTimeout, onWarning]);

  const reset = useCallback(() => {
    if (enabled) {
      startTimers();
    }
  }, [enabled, startTimers]);

  useEffect(() => {
    if (!enabled) {
      clearTimers();
      return;
    }

    // Activity events to monitor
    const events = [
      'mousedown',
      'mousemove',
      'keydown',
      'scroll',
      'touchstart',
      'click',
    ];

    const handleActivity = () => {
      reset();
    };

    // Start initial timer
    startTimers();

    // Add event listeners
    events.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    // Cleanup
    return () => {
      clearTimers();
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [enabled, startTimers, clearTimers, reset]);

  return { reset };
}
