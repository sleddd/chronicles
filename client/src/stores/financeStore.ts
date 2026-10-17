import { create } from 'zustand';
import type { FinanceKind, FinanceRecord } from '../types/finance.js';

/**
 * Decrypted Finance records, per kind. Loaded lazily the first time a Finance
 * tab (or the Calendar's bills) needs them — never part of the app's initial
 * load — and wiped on lock (clearFinanceCache, called from EncryptionContext).
 */

export type FinanceLoadStatus = 'idle' | 'loading' | 'ready' | 'error';

type Records = { [K in FinanceKind]: FinanceRecord<K>[] };

const KINDS: FinanceKind[] = ['paydays', 'bills', 'budget', 'expenses', 'goals', 'savings'];

const emptyRecords = (): Records => ({ paydays: [], bills: [], budget: [], expenses: [], goals: [], savings: [] });
const noneUnreadable = (): Record<FinanceKind, number> =>
  Object.fromEntries(KINDS.map(k => [k, 0])) as Record<FinanceKind, number>;
const idleStatus = (): Record<FinanceKind, FinanceLoadStatus> =>
  Object.fromEntries(KINDS.map(k => [k, 'idle'])) as Record<FinanceKind, FinanceLoadStatus>;

interface FinanceState {
  records: Records;
  status: Record<FinanceKind, FinanceLoadStatus>;
  /** Rows that wouldn't decrypt (tampered or from another key) — shown as a warning. */
  unreadable: Record<FinanceKind, number>;
  /** Last failed save/delete, shown inline by the views. */
  error: string | null;
  /** Bumped by reset() so a load that finishes after a lock is dropped. */
  generation: number;

  setStatus: (kind: FinanceKind, status: FinanceLoadStatus) => void;
  setRecords: <K extends FinanceKind>(kind: K, records: FinanceRecord<K>[], unreadable: number) => void;
  upsertLocal: <K extends FinanceKind>(kind: K, record: FinanceRecord<K>) => void;
  removeLocal: (kind: FinanceKind, id: string) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useFinanceStore = create<FinanceState>((set) => ({
  records: emptyRecords(),
  status: idleStatus(),
  unreadable: noneUnreadable(),
  error: null,
  generation: 0,

  setStatus: (kind, status) => set(s => ({ status: { ...s.status, [kind]: status } })),

  setRecords: (kind, records, unreadable) => set(s => ({
    records: { ...s.records, [kind]: records },
    status: { ...s.status, [kind]: 'ready' },
    unreadable: { ...s.unreadable, [kind]: unreadable },
  })),

  upsertLocal: (kind, record) => set(s => {
    const list = s.records[kind] as FinanceRecord<typeof kind>[];
    const i = list.findIndex(r => r.id === record.id);
    const next = i === -1 ? [...list, record] : list.map(r => (r.id === record.id ? record : r));
    return { records: { ...s.records, [kind]: next } };
  }),

  removeLocal: (kind, id) => set(s => ({
    records: { ...s.records, [kind]: (s.records[kind] as { id: string }[]).filter(r => r.id !== id) },
  })),

  setError: (error) => set({ error }),

  reset: () => set(s => ({
    records: emptyRecords(),
    status: idleStatus(),
    unreadable: noneUnreadable(),
    error: null,
    generation: s.generation + 1,
  })),
}));

/** Drop every decrypted Finance record (on lock / logout). */
export function clearFinanceCache(): void {
  useFinanceStore.getState().reset();
}
