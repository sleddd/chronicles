'use client';

import { useEffect } from 'react';

/**
 * DevToolsBlocker - Disables React DevTools in production builds
 *
 * Security purpose:
 * - Prevents casual inspection of component state via React DevTools
 * - Disables console methods (except error) to prevent data leakage
 * - Raises the bar for state inspection attacks
 *
 * Limitations (documented):
 * - Bypassable by determined attackers who can disable the blocker before React loads
 * - Browser DevTools (Elements, Network, etc.) still work
 * - Memory profiler/heap snapshots can still expose data
 * - This is defense-in-depth, not absolute protection
 */
export function DevToolsBlocker() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      // Disable React DevTools
      if (typeof window !== 'undefined') {
        const disableDevTools = () => {
          const noop = () => {};

          // React DevTools looks for this global hook
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const hook = (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__;
          if (typeof hook === 'object' && hook !== null) {
            for (const prop in hook) {
              if (typeof hook[prop] === 'function') {
                hook[prop] = noop;
              }
            }
          }
        };

        disableDevTools();

        // Disable console methods that could leak data
        // Keep console.error for critical issues
        const noop = () => {};
        ['log', 'debug', 'info', 'warn'].forEach(method => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (console as any)[method] = noop;
        });
      }
    }
  }, []);

  return null;
}
