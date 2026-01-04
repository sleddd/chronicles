'use client';

import { create } from 'zustand';

/**
 * Centralized Security Clear Registry
 *
 * Security purpose:
 * - Single point of control for clearing ALL sensitive data app-wide
 * - Components register their cleanup callbacks
 * - On logout/timeout, clearAllSensitiveData() clears everything
 * - Easy to audit: one place lists all sensitive data sources
 *
 * Usage:
 * 1. Components register cleanup on mount:
 *    useSecurityClear().registerCleanup('my-component', () => dispatch({ type: 'RESET_ALL' }));
 *
 * 2. Components unregister on unmount:
 *    useSecurityClear().unregisterCleanup('my-component');
 *
 * 3. Logout/timeout calls:
 *    useSecurityClear().clearAllSensitiveData();
 */

interface SecurityClearStore {
  // Registry of cleanup functions
  cleanupRegistry: Map<string, () => void>;

  // Register a cleanup function for a component
  registerCleanup: (id: string, cleanup: () => void) => void;

  // Unregister a cleanup function
  unregisterCleanup: (id: string) => void;

  // Clear all registered sensitive data
  clearAllSensitiveData: () => void;

  // Get list of registered cleanups (for debugging/auditing)
  getRegisteredCleanups: () => string[];
}

export const useSecurityClear = create<SecurityClearStore>((set, get) => ({
  cleanupRegistry: new Map(),

  registerCleanup: (id: string, cleanup: () => void) => {
    set((state) => {
      const newRegistry = new Map(state.cleanupRegistry);
      newRegistry.set(id, cleanup);
      return { cleanupRegistry: newRegistry };
    });
  },

  unregisterCleanup: (id: string) => {
    set((state) => {
      const newRegistry = new Map(state.cleanupRegistry);
      newRegistry.delete(id);
      return { cleanupRegistry: newRegistry };
    });
  },

  clearAllSensitiveData: () => {
    const { cleanupRegistry } = get();

    // Call all registered cleanup functions
    cleanupRegistry.forEach((cleanup, id) => {
      try {
        cleanup();
      } catch (error) {
        // Log but don't throw - we want to clear as much as possible
        console.error(`[SecurityClear] Failed to clear ${id}:`, error);
      }
    });

    // Also clear sessionStorage items that might contain sensitive data
    try {
      sessionStorage.removeItem('chronicles_session_key');
      sessionStorage.removeItem('recent_login');
    } catch {
      // Ignore storage errors
    }
  },

  getRegisteredCleanups: () => {
    return Array.from(get().cleanupRegistry.keys());
  },
}));

/**
 * React hook for components to register cleanup functions
 *
 * @param id Unique identifier for the component
 * @param cleanup Function to call to clear sensitive data
 */
export function useRegisterSecurityCleanup(id: string, cleanup: () => void) {
  const { registerCleanup, unregisterCleanup } = useSecurityClear();

  // Register on mount, unregister on unmount
  // This is intentionally using import-time registration pattern
  // to ensure cleanup is always available
  if (typeof window !== 'undefined') {
    registerCleanup(id, cleanup);
  }

  return () => {
    unregisterCleanup(id);
  };
}
