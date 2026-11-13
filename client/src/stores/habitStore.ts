import { create } from 'zustand';
import { parseHabitLog, type HabitLog } from '../utils/habits.js';

/*
 * Every habit check-in, opened from the sealed `habitLog` setting by HabitSync
 * (App.tsx) once the journal is unlocked, and written back the same way. One
 * copy for the whole app, so the Habits page, the dashboard card and the
 * planner always agree. Cleared on lock and sign-out.
 */
interface HabitState {
  log: HabitLog;
  loaded: boolean;
  /** Writes the whole log back (sealed); set by HabitSync */
  persist: ((log: HabitLog) => Promise<void>) | null;
  hydrate: (raw: unknown, persist: (log: HabitLog) => Promise<void>) => void;
  /** Change the log and save it (saves run one after another, newest last) */
  apply: (change: (log: HabitLog) => HabitLog) => void;
  reset: () => void;
}

let saving: Promise<void> = Promise.resolve();

export const useHabitStore = create<HabitState>((set, get) => ({
  log: {},
  loaded: false,
  persist: null,
  hydrate: (raw, persist) => set({ log: parseHabitLog(raw), loaded: true, persist }),
  apply: change => {
    const { log, persist, loaded } = get();
    if (!loaded || !persist) return; // never write over a log that wasn't read
    const next = change(log);
    if (next === log) return;
    set({ log: next });
    saving = saving.then(() => persist(next)).catch(err => console.error('Couldn’t save habit check-ins:', err));
  },
  reset: () => set({ log: {}, loaded: false, persist: null }),
}));
