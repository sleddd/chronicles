import { useCallback, useMemo, useRef, useState } from 'react';
import type { DecryptedPost } from '@shared/crypto/types';
import { useEncryption } from '../contexts/EncryptionContext.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { entries as entriesApi, topics as topicsApi } from '../services/api.js';
import { stripHtml } from '../utils/stripHtml.js';
import { toDateStr } from '../utils/dateUtils.js';
import {
  activeRoutines, doneItemsOf, sessionFields, sessionTitle, slotsOn, type RoutineSlot,
} from '../utils/routines.js';

const meta = (e: DecryptedPost) => (e.metadata as Record<string, unknown>) ?? {};
const fieldsOf = (e: DecryptedPost) => (meta(e)._customFields as Record<string, unknown>) ?? {};
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Routine slots at one time of day */
export interface RoutineGroup {
  time: string;
  slots: RoutineSlot[];
}

async function exerciseTopicId(): Promise<number> {
  const { allTopics, setTopics } = useEntriesStore.getState();
  let topic = allTopics.find(t => t.name.toLowerCase() === 'exercise');
  if (!topic) {
    topic = await topicsApi.create({ name: 'Exercise', icon: 'dumbbell' });
    setTopics([...allTopics, topic]);
  }
  return topic.id;
}

/**
 * A day's routine checklist (utils/routines): every active routine's slots on
 * `date`, and whether each is done — read from the Exercise entries the ticks
 * logged (metadata._routineLink), so it follows journal edits and other
 * devices' syncs. Ticking a routine logs a full session; ticking exercises
 * logs a partial one; un-ticking everything deletes the session.
 */
export function useRoutineChecklist(date: string = toDateStr(new Date())) {
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const { encryptPost, encryptNewPost } = useEncryption();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // One write at a time per slot, so quick ticks never log two sessions
  const queue = useRef(new Map<string, Promise<void>>());

  const routineTopicId = useMemo(
    () => allTopics.find(t => ['routine', 'routines'].includes(t.name.toLowerCase()))?.id,
    [allTopics],
  );
  const routines = useMemo(() => activeRoutines(entries, routineTopicId, stripHtml), [entries, routineTopicId]);
  const slots = useMemo(() => slotsOn(routines, date), [routines, date]);

  const sessions = useMemo(() => {
    const map = new Map<string, DecryptedPost>();
    for (const e of entries) {
      const link = meta(e)._routineLink;
      if (typeof link === 'string' && link.includes(`|${date}|`)) map.set(link, e);
    }
    return map;
  }, [entries, date]);

  const groups = useMemo(() => {
    const map = new Map<string, RoutineGroup>();
    for (const s of slots) {
      const g = map.get(s.time) ?? { time: s.time, slots: [] };
      g.slots.push(s);
      map.set(s.time, g);
    }
    return [...map.values()];
  }, [slots]);

  /** The exercises done in this slot (all of them once the routine is ticked) */
  const doneItems = useCallback((s: RoutineSlot) => {
    const e = sessions.get(s.key);
    return e ? doneItemsOf(s.routine, fieldsOf(e)) : [];
  }, [sessions]);
  const isDone = useCallback((s: RoutineSlot) => {
    const e = sessions.get(s.key);
    if (!e) return false;
    return s.routine.items.length === 0 || doneItems(s).length >= s.routine.items.length;
  }, [sessions, doneItems]);
  const doneAt = useCallback((s: RoutineSlot) => sessions.get(s.key)?.createdAt, [sessions]);

  /** Write the slot's session with these exercises done (null = delete it). */
  const write = useCallback(async (s: RoutineSlot, doneIds: string[] | null) => {
    const existing = useEntriesStore.getState().decryptedEntries.filter(e => meta(e)._routineLink === s.key);
    if (doneIds === null) {
      for (const e of existing) {
        await entriesApi.delete(e.id);
        useEntriesStore.getState().removeEntry(e.id);
      }
      return;
    }
    const tid = await exerciseTopicId();
    const [first, ...extra] = existing;
    // Keep anything the session gained in the journal (notes, distance…)
    const fields = { ...(first ? fieldsOf(first) : {}), ...sessionFields(s.routine, doneIds, date, s.time) };
    if (first) {
      for (const k of ['notes', 'distance', 'distanceUnit', 'intensity', 'calories', 'caloriesSource', 'calorieBasis']) {
        const prev = fieldsOf(first)[k];
        if (prev !== undefined && prev !== '') fields[k] = prev;
      }
    }
    const content = `<p>${escapeHtml(sessionTitle(s.routine, fields))}</p>`;
    const metadata = { ...(first ? meta(first) : {}), _taxonomyId: tid, _routineLink: s.key, _customFields: fields };
    if (first) {
      const enc = await encryptPost(first.id, content, metadata);
      await entriesApi.update(first.id, {
        contentEncrypted: enc.contentEncrypted, contentIv: enc.contentIv,
        metadataEncrypted: enc.metadataEncrypted, metadataIv: enc.metadataIv,
        taxonomyIds: [tid],
      });
      useEntriesStore.getState().updateDecryptedEntry(first.id, { content, metadata });
      for (const e of extra) {
        await entriesApi.delete(e.id);
        useEntriesStore.getState().removeEntry(e.id);
      }
      return;
    }
    const today = toDateStr(new Date());
    const enc = await encryptNewPost(content, metadata);
    const res = await entriesApi.create({ id: enc.id,
      contentEncrypted: enc.contentEncrypted, contentIv: enc.contentIv,
      metadataEncrypted: enc.metadataEncrypted, metadataIv: enc.metadataIv,
      isEncrypted: true, taxonomyIds: [tid],
      ...(date === today ? {} : { createdAt: new Date(`${date}T${s.time.slice(0, 5).padStart(5, '0')}:00`).toISOString() }),
    });
    useEntriesStore.getState().addDecryptedEntry({
      id: res.id as number, content, metadata, isEncrypted: true,
      createdAt: new Date(res.createdAt as string),
      updatedAt: new Date((res.updatedAt || res.createdAt) as string),
    });
  }, [date, encryptPost, encryptNewPost]);

  const run = useCallback((s: RoutineSlot, next: () => string[] | null) => {
    const prev = queue.current.get(s.key) ?? Promise.resolve();
    const job = prev.then(async () => {
      setBusy(s.key);
      setError(null);
      try {
        await write(s, next());
      } catch (err) {
        console.error('Failed to update routine:', err);
        setError(`Couldn’t update ${s.routine.name}. Try again.`);
      } finally {
        setBusy(b => (b === s.key ? null : b));
      }
    });
    queue.current.set(s.key, job);
    return job;
  }, [write]);

  /** Tick the whole routine (every exercise) or clear it */
  const setDone = useCallback((s: RoutineSlot, on: boolean) =>
    run(s, () => (on ? s.routine.items.map(i => i.id) : null)), [run]);

  /** Tick or untick one exercise — read fresh from the store when its turn comes */
  const toggleItem = useCallback((s: RoutineSlot, itemId: string) => run(s, () => {
    const e = useEntriesStore.getState().decryptedEntries.find(x => meta(x)._routineLink === s.key);
    const done = e ? doneItemsOf(s.routine, fieldsOf(e)) : [];
    const next = done.includes(itemId) ? done.filter(id => id !== itemId) : [...done, itemId];
    return next.length ? next : null;
  }), [run]);

  const doAll = useCallback(async (list: RoutineSlot[]) => {
    for (const s of list) if (!isDone(s)) await setDone(s, true);
  }, [isDone, setDone]);

  const done = slots.filter(isDone).length;
  return { routines, slots, groups, done, total: slots.length, isDone, doneItems, doneAt, setDone, toggleItem, doAll, busy, error };
}
