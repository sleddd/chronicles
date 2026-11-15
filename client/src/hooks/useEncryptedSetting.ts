import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { useEncryption } from '../contexts/EncryptionContext.js';
import { settings as settingsApi } from '../services/api.js';
import { openSettingsMap, sealSetting, isSealed } from '../services/privateSettings.js';

type DecryptBytes = Parameters<typeof openSettingsMap>[1];

/*
 * One copy of each setting for the whole app. Every use of the hook for a key
 * reads and writes the same value, so two forms on one page (the Quick entry's
 * Symptom form and the Log a symptom card both hold `symptomChips`) can't save
 * over each other from a stale copy of their own.
 *
 * The copies are decrypted values: `clearEncryptedSettings` drops them all on
 * lock and sign-out.
 */
interface Slot {
  /** Undefined until read, or when nothing (openable) is stored: callers show their fallback */
  value: unknown;
  /** The server's value was read. Until then `save` is refused */
  loaded: boolean;
  /** Bumped by every save, so a read that began before one never replaces it */
  version: number;
  mounted: number;
  loading: boolean;
  timer?: ReturnType<typeof setTimeout>;
  listeners: Set<() => void>;
}

const slots = new Map<string, Slot>();
/** Bumped on lock: a read answered afterwards is dropped */
let generation = 0;

function slotFor(key: string): Slot {
  let slot = slots.get(key);
  if (!slot) {
    slot = { value: undefined, loaded: false, version: 0, mounted: 0, loading: false, listeners: new Set() };
    slots.set(key, slot);
  }
  return slot;
}

const notify = (slot: Slot) => { for (const l of slot.listeners) l(); };

/** Lock / sign-out: nothing decrypted stays, and anything in flight is dropped. */
export function clearEncryptedSettings(): void {
  generation++;
  for (const slot of slots.values()) {
    clearTimeout(slot.timer);
    slot.timer = undefined;
    slot.value = undefined;
    slot.loaded = false;
    slot.loading = false;
    slot.version++;
    notify(slot);
  }
}

function load(key: string, decryptBytes: DecryptBytes, attempt = 0): void {
  const slot = slotFor(key);
  if (slot.loading) return;
  slot.loading = true;
  clearTimeout(slot.timer);
  slot.timer = undefined;
  const gen = generation;
  const version = slot.version;
  void (async () => {
    let rows: Awaited<ReturnType<typeof settingsApi.getAll>>;
    try {
      rows = await settingsApi.getAll();
    } catch (err) {
      if (gen !== generation) return;
      slot.loading = false;
      // The stored value was NOT read (offline, a 5xx, a 429): stay unloaded,
      // so nothing can save the empty default over it, and ask again
      console.warn(`Setting "${key}" could not be loaded, trying again:`, err);
      if (slot.mounted > 0) {
        slot.timer = setTimeout(() => load(key, decryptBytes, attempt + 1), Math.min(5_000 * 2 ** attempt, 60_000));
      }
      return;
    }
    let value: unknown;
    try {
      // The whole map, so the same trust rules apply as at startup (the
      // seal marker decides whether a pre-v2 value may still be opened)
      const map: Record<string, unknown> = {};
      for (const row of rows) map[row.key] = row.value;
      // Only ever a sealed value: plaintext from the server is never taken
      const wasSealed = isSealed(map[key]);
      await openSettingsMap(map, decryptBytes);
      if (wasSealed && map[key] !== undefined && map[key] !== null) value = map[key];
    } catch (err) {
      console.warn(`Setting "${key}" could not be opened:`, err);
    }
    if (gen !== generation) return;
    slot.loading = false;
    // Saved here while this read was on its way: what was saved is newer
    if (slot.version === version) slot.value = value;
    // The server answered: what it holds was read (or can't be opened by this
    // key at all), so saving is allowed from here
    slot.loaded = true;
    notify(slot);
  })();
}

/**
 * A JSON setting encrypted with the master key (the server stores ciphertext
 * only, bound to its key — see services/privateSettings.ts) — for personal
 * data such as nutrition goals or saved foods.
 * Returns [value, save, loaded]; `save` updates the value at once, everywhere
 * it is shown, and persists.
 *
 * It loads only once the master key is unlocked. A fresh launch (e.g. the
 * installed iPad app restoring a remembered key) can mount the page before the
 * key is back — decrypting then would fail, fall back to the empty default and
 * a later save would overwrite the real value. Until it has loaded, `loaded`
 * stays false and `save` is refused — and a read that FAILED is not a load:
 * it is tried again (5 s, 10 s … up to a minute apart) and `loaded` stays
 * false meanwhile, or the next save (one habit tick, one timer) would replace
 * the whole stored value with the empty default.
 *
 * The first use of a key to mount reads it again from the server (so a change
 * made on another device shows up when a page opens); others mounting while
 * one is already showing share its copy.
 */
export function useEncryptedSetting<T>(key: string, fallback: T): [T, (next: T) => Promise<void>, boolean] {
  const { encryptBytes, decryptBytes, isUnlocked } = useEncryption();
  const fallbackRef = useRef(fallback);
  const subscribe = useCallback((onChange: () => void) => {
    const s = slotFor(key);
    s.listeners.add(onChange);
    return () => { s.listeners.delete(onChange); };
  }, [key]);
  const stored = useSyncExternalStore(subscribe, () => slotFor(key).value);
  const loaded = useSyncExternalStore(subscribe, () => slotFor(key).loaded);

  useEffect(() => {
    if (!isUnlocked) return;
    const s = slotFor(key);
    s.mounted++;
    // Alone on the page: read it afresh. Beside another use: share its copy
    if (s.mounted === 1 || !s.loaded) load(key, decryptBytes);
    return () => {
      s.mounted--;
      if (s.mounted === 0) { clearTimeout(s.timer); s.timer = undefined; }
    };
  }, [key, decryptBytes, isUnlocked]);

  const save = useCallback(async (next: T) => {
    const s = slotFor(key);
    // Never write before the stored value was read — it would replace it
    if (!s.loaded) throw new Error(`Setting "${key}" isn't loaded yet`);
    s.value = next;
    s.version++;
    notify(s);
    await settingsApi.upsert(key, await sealSetting(key, next, encryptBytes));
  }, [key, encryptBytes]);

  const value = (stored === undefined ? fallbackRef.current : stored) as T;
  return [value, save, loaded];
}
