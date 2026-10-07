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
 */
export function useEncryptedSetting<T>(key: string, fallback: T): [T, (next: T) => Promise<void>, boolean] {
  const { encryptBytes, decryptBytes } = useEncryption();
  const [value, setValue] = useState<T>(fallback);
  const [loaded, setLoaded] = useState(false);
  const fallbackRef = useRef(fallback);

  useEffect(() => {
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
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [key, decryptBytes]);

  const save = useCallback(async (next: T) => {
    setValue(next);
    const data = new TextEncoder().encode(JSON.stringify(next));
    const { ciphertext, iv } = await encryptBytes(data.buffer as ArrayBuffer);
    await settingsApi.upsert(key, { ciphertext: arrayBufferToBase64(ciphertext), iv });
  }, [key, encryptBytes]);

  return [value, save, loaded];
}
