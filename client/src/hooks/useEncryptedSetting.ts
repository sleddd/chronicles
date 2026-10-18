import { useCallback, useEffect, useRef, useState } from 'react';
import { useEncryption } from '../contexts/EncryptionContext.js';
import { settings as settingsApi } from '../services/api.js';
import { arrayBufferToBase64, base64ToArrayBuffer } from '@shared/crypto/encoding.js';

interface EncryptedValue { ciphertext: string; iv: string }

function isEncryptedValue(v: unknown): v is EncryptedValue {
  return !!v && typeof v === 'object'
    && typeof (v as EncryptedValue).ciphertext === 'string'
    && typeof (v as EncryptedValue).iv === 'string';
}

/**
 * A JSON setting encrypted with the master key (the server stores ciphertext
 * only) — for personal data such as nutrition goals or saved foods.
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
        const all = await settingsApi.getAll();
        const stored = all.find(s => s.key === key)?.value;
        if (isEncryptedValue(stored)) {
          const plain = await decryptBytes(base64ToArrayBuffer(stored.ciphertext), stored.iv);
          const parsed = JSON.parse(new TextDecoder().decode(plain)) as T;
          if (!cancelled) setValue(parsed);
        }
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
    const data = new TextEncoder().encode(JSON.stringify(next));
    const { ciphertext, iv } = await encryptBytes(data.buffer as ArrayBuffer);
    await settingsApi.upsert(key, { ciphertext: arrayBufferToBase64(ciphertext), iv });
  }, [key, encryptBytes]);

  return [value, save, loaded];
}
