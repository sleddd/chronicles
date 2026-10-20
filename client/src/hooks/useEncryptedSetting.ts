import { useCallback, useEffect, useRef, useState } from 'react';
import { useEncryption } from '../contexts/EncryptionContext.js';
import { settings as settingsApi } from '../services/api.js';
import { openSettingsMap, sealSetting, isSealed } from '../services/privateSettings.js';

/**
 * A JSON setting encrypted with the master key (the server stores ciphertext
 * only, bound to its key — see services/privateSettings.ts) — for personal
 * data such as nutrition goals or saved foods.
 * Returns [value, save, loaded]; `save` updates state at once and persists.
 *
 * It loads only once the master key is unlocked. A fresh launch (e.g. the
 * installed iPad app restoring a remembered key) can mount the page before the
 * key is back — decrypting then would fail, fall back to the empty default and
 * a later save would overwrite the real value. Until it has loaded, `loaded`
 * stays false and `save` is refused.
 */
export function useEncryptedSetting<T>(key: string, fallback: T): [T, (next: T) => Promise<void>, boolean] {
  const { encryptBytes, decryptBytes, isUnlocked } = useEncryption();
  const [value, setValue] = useState<T>(fallback);
  const [loaded, setLoaded] = useState(false);
  const fallbackRef = useRef(fallback);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!isUnlocked) return;
    let cancelled = false;
    (async () => {
      try {
        // The whole map, so the same trust rules apply as at startup (the
        // seal marker decides whether a pre-v2 value may still be opened)
        const map: Record<string, unknown> = {};
        for (const row of await settingsApi.getAll()) map[row.key] = row.value;
        // Only ever a sealed value: plaintext from the server is never taken
        const wasSealed = isSealed(map[key]);
        await openSettingsMap(map, decryptBytes);
        if (wasSealed && map[key] !== undefined && map[key] !== null && !cancelled) setValue(map[key] as T);
      } catch (err) {
        console.warn(`Setting "${key}" could not be loaded:`, err);
        if (!cancelled) setValue(fallbackRef.current);
      } finally {
        if (!cancelled) { loadedRef.current = true; setLoaded(true); }
      }
    })();
    return () => { cancelled = true; };
  }, [key, decryptBytes, isUnlocked]);

  const save = useCallback(async (next: T) => {
    // Never write before the stored value was read — it would replace it
    if (!loadedRef.current) throw new Error(`Setting "${key}" isn't loaded yet`);
    setValue(next);
    await settingsApi.upsert(key, await sealSetting(key, next, encryptBytes));
  }, [key, encryptBytes]);

  return [value, save, loaded];
}
