import { create } from 'zustand';
import { parseSessions, type TimeSession } from '../utils/timeTracking.js';

/*
 * Every time-tracking session, opened from the sealed `timeLog` setting by
 * TimeSync (App.tsx) once the journal is unlocked, and written back the same
 * way. One copy for the whole app, so the entry form and the floating timer
 * always agree. Cleared on lock and sign-out.
 */
interface TimeState {
  sessions: TimeSession[];
  loaded: boolean;
  /** Writes the whole list back (sealed); set by TimeSync */
  persist: ((sessions: TimeSession[]) => Promise<void>) | null;
  hydrate: (raw: unknown, persist: (sessions: TimeSession[]) => Promise<void>) => void;
  /** Change the list and save it (saves run one after another, newest last) */
  apply: (change: (sessions: TimeSession[]) => TimeSession[]) => void;
  reset: () => void;
}

let saving: Promise<void> = Promise.resolve();

export const useTimeStore = create<TimeState>((set, get) => ({
  sessions: [],
  loaded: false,
  persist: null,
  hydrate: (raw, persist) => set({ sessions: parseSessions(raw), loaded: true, persist }),
  apply: change => {
    const { sessions, persist, loaded } = get();
    if (!loaded || !persist) return; // never write over a list that wasn't read
    const next = change(sessions);
    if (next === sessions) return;
    set({ sessions: next });
    saving = saving.then(() => persist(next)).catch(err => console.error('Couldn’t save time tracking:', err));
  },
  reset: () => set({ sessions: [], loaded: false, persist: null }),
}));
