import { useCallback, useEffect } from 'react';
import { useEncryption } from '../contexts/EncryptionContext.js';
import { useFinanceStore } from '../stores/financeStore.js';
import { finance as financeApi } from '../services/api.js';
import { newId } from '../utils/finance.js';
import type { FinanceKind, FinanceRecord, FinanceRecordMap } from '../types/finance.js';

type Decrypt = <T>(kind: string, id: string, payload: string, iv: string) => Promise<T>;

const loading = new Map<FinanceKind, Promise<void>>();

/* Writes to one record go out one at a time, in order, so quick edits (ticking
   several lines) can't land on the server out of order. */
const writeQueues = new Map<string, Promise<unknown>>();

function queued<T>(key: string, task: () => Promise<T>): Promise<T> {
  const prev = writeQueues.get(key) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(task);
  writeQueues.set(key, next);
  void next.finally(() => { if (writeQueues.get(key) === next) writeQueues.delete(key); }).catch(() => undefined);
  return next;
}

/** Fetch + decrypt one kind into the store (shared by every caller while in flight). */
function loadKind(kind: FinanceKind, decrypt: Decrypt): Promise<void> {
  const pending = loading.get(kind);
  if (pending) return pending;
  const store = useFinanceStore.getState();
  const generation = store.generation;
  store.setStatus(kind, 'loading');
  const p = (async () => {
    try {
      const { records } = await financeApi.list(kind);
      let unreadable = 0;
      const out: FinanceRecord<FinanceKind>[] = [];
      await Promise.all(records.map(async (r) => {
        try {
          const data = await decrypt<FinanceRecordMap[FinanceKind]>(kind, r.id, r.payload, r.iv);
          out.push({ ...data, id: r.id, createdAt: r.createdAt, updatedAt: r.updatedAt } as FinanceRecord<FinanceKind>);
        } catch {
          unreadable++;
        }
      }));
      out.sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
      // Locked (and reset) while this was in flight — don't repopulate
      if (useFinanceStore.getState().generation !== generation) return;
      useFinanceStore.getState().setRecords(kind, out as never, unreadable);
    } catch {
      if (useFinanceStore.getState().generation === generation) useFinanceStore.getState().setStatus(kind, 'error');
    } finally {
      loading.delete(kind);
    }
  })();
  loading.set(kind, p);
  return p;
}

/** Strip the row fields so only the record itself is encrypted. */
function payloadOf<T extends { id?: string; createdAt?: string; updatedAt?: string }>(record: T) {
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = record;
  return rest;
}

/**
 * One kind of Finance record: loads it on first use (when unlocked), and
 * saves/deletes optimistically — encrypted in the browser, rolled back with
 * an inline error if the server refuses. `enabled: false` skips the load
 * (e.g. the Calendar while Finance is switched off).
 */
export function useFinance<K extends FinanceKind>(kind: K, { enabled = true }: { enabled?: boolean } = {}) {
  const { isUnlocked, encryptRecord, decryptRecord } = useEncryption();
  const records = useFinanceStore(s => s.records[kind]) as FinanceRecord<K>[];
  const status = useFinanceStore(s => s.status[kind]);
  const unreadable = useFinanceStore(s => s.unreadable[kind]);

  useEffect(() => {
    if (enabled && isUnlocked && status === 'idle') void loadKind(kind, decryptRecord as Decrypt);
  }, [enabled, isUnlocked, status, kind, decryptRecord]);

  const reload = useCallback(() => loadKind(kind, decryptRecord as Decrypt), [kind, decryptRecord]);

  /** Create (no id) or replace a record; resolves with the saved record. */
  const save = useCallback(async (record: FinanceRecordMap[K] & { id?: string }): Promise<FinanceRecord<K> | null> => {
    const store = useFinanceStore.getState();
    const id = record.id ?? newId();
    const previous = (store.records[kind] as FinanceRecord<K>[]).find(r => r.id === id);
    const now = new Date().toISOString();
    const next = { ...payloadOf(record), id, createdAt: previous?.createdAt ?? now, updatedAt: now } as FinanceRecord<K>;
    store.upsertLocal(kind, next);
    try {
      await queued(`${kind}:${id}`, async () => {
        const { payload, iv } = await encryptRecord(kind, id, payloadOf(record));
        await financeApi.put(kind, id, payload, iv);
      });
      useFinanceStore.getState().setError(null);
      return next;
    } catch (err) {
      const s = useFinanceStore.getState();
      if (previous) s.upsertLocal(kind, previous); else s.removeLocal(kind, id);
      s.setError(err instanceof Error ? `Couldn't save: ${err.message}` : "Couldn't save");
      return null;
    }
  }, [kind, encryptRecord]);

  const remove = useCallback(async (id: string): Promise<boolean> => {
    const store = useFinanceStore.getState();
    const previous = (store.records[kind] as FinanceRecord<K>[]).find(r => r.id === id);
    store.removeLocal(kind, id);
    try {
      await queued(`${kind}:${id}`, () => financeApi.remove(kind, id));
      useFinanceStore.getState().setError(null);
      return true;
    } catch (err) {
      if (previous) useFinanceStore.getState().upsertLocal(kind, previous);
      useFinanceStore.getState().setError(err instanceof Error ? `Couldn't delete: ${err.message}` : "Couldn't delete");
      return false;
    }
  }, [kind]);

  return { records, status, unreadable, save, remove, reload };
}
