import { create } from 'zustand';
import type { RekeyProgress } from '../services/rekey.js';

/*
 * A re-encryption under a new master key, while it runs (services/rekey.ts).
 * The app stays shut behind RekeyOverlay until it is done: nothing reads or
 * writes a record while some are under one key and some under the other.
 */

export type RekeyStatus = 'idle' | 'waiting' | 'running' | 'error';

interface RekeyState {
  status: RekeyStatus;
  progress: RekeyProgress | null;
  error: string | null;
  /**
   * 'missing': photos couldn't be found, and the person may choose to finish
   * without them. 'photos': the bucket couldn't be used. Both offer the
   * bucket's settings, since Settings can't be reached while this runs
   */
  errorKind: 'missing' | 'photos' | null;
  set: (s: Partial<Pick<RekeyState, 'status' | 'progress' | 'error' | 'errorKind'>>) => void;
  reset: () => void;
}

export const useRekeyStore = create<RekeyState>(set => ({
  status: 'idle',
  progress: null,
  error: null,
  errorKind: null,
  set: s => set(s),
  reset: () => set({ status: 'idle', progress: null, error: null, errorKind: null }),
}));

/** A re-encryption is under way in this tab (the key isn't handed to other tabs meanwhile) */
export const rekeyActive = (): boolean => useRekeyStore.getState().status !== 'idle';
