import type { EntryImage } from '../services/imageStorage.js';

/* A photo of the person's own kept in a setting (the custom background, a Vision
   area's photo): the same record an entry keeps for its images. It is read back
   from the server's copy of the setting, so it is checked before use. Pure. */

/** The only object keys the app makes: `img/<uuid>` and its `-t` thumbnail */
const IMAGE_KEY = /^img\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-t)?$/;
export function isImageKey(key: string): boolean {
  return IMAGE_KEY.test(key);
}
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;

/** The stored photo, or null when it isn't one */
export function parseStoredImage(raw: unknown): EntryImage | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!text(o.key, 80) || !isImageKey(o.key)) return null;
  if (!text(o.thumbKey, 80) || !isImageKey(o.thumbKey)) return null;
  if (!text(o.iv, 64) || !text(o.thumbIv, 64)) return null;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);
  return {
    key: o.key, iv: o.iv, thumbKey: o.thumbKey, thumbIv: o.thumbIv,
    mimeType: 'image/jpeg', // every upload is re-encoded to JPEG
    size: num(o.size) ?? 0,
    ...(num(o.width) ? { width: num(o.width) } : {}),
    ...(num(o.height) ? { height: num(o.height) } : {}),
  };
}

/** Both object keys of a stored photo (none for no photo) */
export const storedImageKeys = (image: EntryImage | null | undefined): string[] => (image ? [image.key, image.thumbKey] : []);
