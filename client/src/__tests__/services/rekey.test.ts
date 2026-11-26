import { describe, it, expect, vi, beforeEach } from 'vitest';
import { encryptionService } from '@shared/crypto/encryptionService.js';
import { generateMasterKey } from '@shared/crypto/primitives.js';
import { arrayBufferToBase64, base64ToArrayBuffer } from '@shared/crypto/encoding.js';

// An in-memory server and R2 bucket: the job sees only what it would over the wire
const server = vi.hoisted(() => ({
  entries: new Map<number, Record<string, unknown>>(),
  topics: new Map<number, { id: number; color: string | null; payload: string; iv: string }>(),
  doses: new Map<string, { id: string; date: string; payload: string; iv: string }>(),
  finance: new Map<string, { id: string; payload: string; iv: string; createdAt: string; updatedAt: string }>(),
  settings: new Map<string, unknown>(),
  bucket: new Map<string, ArrayBuffer>(),
  finished: [] as string[],
  finishRunners: [] as string[],
  refuseFinish: false,
  failDosesOnce: false,
  refuseEntryOnce: 0,
  financeBatches: [] as number[],
  /** Versions kept of what the Chronicles AI app overwrote (sealed with the old key) */
  keptChanges: 0,
  /** How DELETE /assistant-changes answers: fine, a failure, or a server from before the feature */
  clearChanges: 'ok' as 'ok' | 'fail' | 'missing',
}));

vi.mock('@/services/api', () => {
  class ApiError extends Error {
    constructor(public status: number, message: string) { super(message); }
  }
  return {
  ApiError,
  assistantChanges: {
    clear: async () => {
      if (server.clearChanges === 'fail') throw new ApiError(500, 'Failed to delete');
      if (server.clearChanges === 'missing') throw new ApiError(404, 'Not found');
      server.keptChanges = 0;
      return { success: true };
    },
  },
  auth: {
    rekeyFinish: async (id: string, runner: string) => {
      server.finishRunners.push(runner);
      if (server.refuseFinish) return { finished: false };
      server.finished.push(id);
      return { finished: true };
    },
  },
  entries: {
    getAll: async () => [...server.entries.values()].map(e => ({ ...e })),
    get: async (id: number) => ({ ...server.entries.get(id) }),
    reseal: async (list: { id: number; contentEncrypted: string; contentIv: string; metadataEncrypted: string; metadataIv: string }[]) => {
      let n = 0;
      for (const e of list) {
        // The server refuses one that changed since it was read
        if (server.refuseEntryOnce === e.id) { server.refuseEntryOnce = 0; continue; }
        server.entries.set(e.id, { ...server.entries.get(e.id), ...e });
        n++;
      }
      return { resealed: n };
    },
  },
  finance: {
    list: async (kind: string) => ({ records: [...server.finance.entries()].filter(([k]) => k.startsWith(`${kind}:`)).map(([, r]) => ({ ...r })) }),
  },
  settings: {
    getAll: async () => [...server.settings.entries()].map(([key, value]) => ({ key, value, updatedAt: '' })),
    upsert: async (key: string, value: unknown) => { server.settings.set(key, value); return { key, value, updatedAt: '' }; },
  },
  rekeyRecords: {
    topics: async () => [...server.topics.values()].map(t => ({ ...t })),
    putTopic: async (id: number, sealed: { payload: string; iv: string }) => { server.topics.set(id, { ...server.topics.get(id)!, ...sealed }); return {}; },
    doses: async () => ({ records: [...server.doses.values()].map(d => ({ ...d })) }),
    resealDoses: async (records: { id: string; date: string; payload: string; iv: string }[]) => {
      if (server.failDosesOnce) { server.failDosesOnce = false; throw new Error('connection lost'); }
      for (const r of records) server.doses.set(r.id, r);
      return { resealed: records.length };
    },
    resealFinance: async (kind: string, records: { id: string; payload: string; iv: string }[]) => {
      server.financeBatches.push(records.reduce((n, r) => n + r.payload.length, 0));
      for (const r of records) server.finance.set(`${kind}:${r.id}`, { ...server.finance.get(`${kind}:${r.id}`)!, ...r });
      return { resealed: records.length };
    },
  },
  };
});

vi.mock('@/services/r2Signer', () => ({
  presignR2: async (_cfg: unknown, method: string, key: string) => `r2://${method}/${key}`,
}));

// jsdom's Blob has no arrayBuffer(), and node's Response doesn't read a jsdom Blob
const blobBytes = (blob: Blob) => new Promise<ArrayBuffer>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result as ArrayBuffer);
  r.onerror = () => reject(r.error);
  r.readAsArrayBuffer(blob);
});

const fetchFn = (async (url: string, init?: { method?: string; body?: Blob }) => {
  const [, method, ...rest] = url.replace('r2://', '/').split('/');
  const key = rest.join('/');
  if (method === 'GET') {
    const body = server.bucket.get(key);
    return body ? new Response(body) : new Response(null, { status: 404 });
  }
  if (method === 'PUT') { server.bucket.set(key, await blobBytes(init!.body!)); return new Response(null, { status: 200 }); }
  if (method === 'DELETE') { server.bucket.delete(key); return new Response(null, { status: 204 }); }
  return new Response(null, { status: 400 });
}) as unknown as typeof fetch;

import { runRekey, movedImageKey, movedImageIv, findImageRefs, inBatches, settingsHoldPhotos, checkPhotosReachable, RekeyError } from '@/services/rekey';
import { imageAad } from '@/services/imageStorage';
import { settingAad } from '@/services/settingCipher';

const IMG = 'img/11111111-2222-4333-8444-555555555555';
const THUMB = `${IMG}-t`;
const REKEY = 'c'.repeat(32);
const RUNNER = 'd'.repeat(32);
const enc = new TextEncoder();
const dec = new TextDecoder();

async function sealSettingWith(key: CryptoKey, name: string, value: unknown) {
  const { ciphertext, iv } = await encryptionService.encryptFile(key, enc.encode(JSON.stringify(value)).buffer as ArrayBuffer, settingAad(name));
  return { ciphertext: arrayBufferToBase64(ciphertext), iv, v: 2 };
}
async function openSettingWith(key: CryptoKey, name: string) {
  const v = server.settings.get(name) as { ciphertext: string; iv: string };
  return JSON.parse(dec.decode(await encryptionService.decryptFile(key, base64ToArrayBuffer(v.ciphertext), v.iv, settingAad(name))));
}

async function seed(oldKey: CryptoKey) {
  for (const m of Object.values(server)) if (m instanceof Map) m.clear();
  server.finished.length = 0;
  server.finishRunners.length = 0;
  server.refuseFinish = false;
  server.financeBatches.length = 0;
  server.refuseEntryOnce = 0;
  server.keptChanges = 0;
  server.clearChanges = 'ok';
  server.failDosesOnce = false;
  // A photo and its thumbnail in the bucket, under the old key
  const photo = await encryptionService.encryptFile(oldKey, enc.encode('photo-bytes').buffer as ArrayBuffer, imageAad(IMG));
  const thumb = await encryptionService.encryptFile(oldKey, enc.encode('thumb-bytes').buffer as ArrayBuffer, imageAad(THUMB));
  server.bucket.set(IMG, photo.ciphertext);
  server.bucket.set(THUMB, thumb.ciphertext);
  const ref = { key: IMG, iv: photo.iv, thumbKey: THUMB, thumbIv: thumb.iv, mimeType: 'image/jpeg', size: 10 };

  const post = async (id: number, content: string, metadata: Record<string, unknown>) =>
    server.entries.set(id, { id, isEncrypted: true, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z', ...(await encryptionService.encryptPost(oldKey, id, content, metadata)) });
  await post(1, '<p>Trip</p>', { _images: [ref], _featuredKey: IMG });
  await post(2, '<p>A private line</p>', { _taxonomyId: 5 });

  server.topics.set(5, { id: 5, color: null, ...(await encryptionService.encryptRecord(oldKey, 'topic', '5', { name: 'Journal', icon: 'book' })) });
  const doseId = '0a0b0c0d-0000-4000-8000-000000000001';
  server.doses.set(doseId, { id: doseId, date: '2026-11-20', ...(await encryptionService.encryptRecord(oldKey, 'dose', `${doseId}|2026-11-20`, { medicationPostId: 3, scheduledTime: '08:00', status: 'taken', takenAt: '8:01 AM' })) });
  const billId = '0a0b0c0d-0000-4000-8000-0000000000b1';
  const bill = await encryptionService.encryptRecord(oldKey, 'bills', billId, { name: 'Rent', amountCents: 150000 });
  server.finance.set(`bills:${billId}`, { id: billId, payload: bill.payload, iv: bill.iv, createdAt: '', updatedAt: '' });

  server.settings.set('displayName', await sealSettingWith(oldKey, 'displayName', 'Olivia'));
  server.settings.set('imageStorageConfig', await sealSettingWith(oldKey, 'imageStorageConfig', { accountId: 'a', bucket: 'b', accessKeyId: 'c', secretAccessKey: 'd', _rev: 3 }));
  server.settings.set('wallpaper', await sealSettingWith(oldKey, 'wallpaper', { choice: 'custom', custom: ref }));
  server.settings.set('themeMode', 'dark');
  return { doseId, billId };
}

async function expectAllUnderNewKey(newKey: CryptoKey, oldKey: CryptoKey, ids: { doseId: string; billId: string }) {
  for (const e of server.entries.values()) {
    const post = e as never;
    await expect(encryptionService.decryptPost(oldKey, post)).rejects.toThrow();
    await encryptionService.decryptPost(newKey, post);
  }
  const t = server.topics.get(5)!;
  expect(await encryptionService.decryptRecord(newKey, 'topic', '5', t.payload, t.iv)).toEqual({ name: 'Journal', icon: 'book' });
  await expect(encryptionService.decryptRecord(oldKey, 'topic', '5', t.payload, t.iv)).rejects.toThrow();
  const d = server.doses.get(ids.doseId)!;
  expect((await encryptionService.decryptRecord<{ status: string }>(newKey, 'dose', `${ids.doseId}|2026-11-20`, d.payload, d.iv)).status).toBe('taken');
  const b = server.finance.get(`bills:${ids.billId}`)!;
  expect((await encryptionService.decryptRecord<{ name: string }>(newKey, 'bills', ids.billId, b.payload, b.iv)).name).toBe('Rent');
  expect(await openSettingWith(newKey, 'displayName')).toBe('Olivia');
  // The rollback revision inside a guarded setting is kept as it was
  expect((await openSettingWith(newKey, 'imageStorageConfig'))._rev).toBe(3);
  await expect(openSettingWith(oldKey, 'displayName')).rejects.toThrow();
  expect(server.settings.get('themeMode')).toBe('dark');
}

describe('runRekey', () => {
  let oldKey: CryptoKey;
  let newKey: CryptoKey;
  beforeEach(async () => {
    oldKey = await generateMasterKey();
    newKey = await generateMasterKey();
  });

  it('moves every record and photo to the new key, then tells the server to drop the old one', async () => {
    const ids = await seed(oldKey);
    await runRekey({ newKey, oldKey, rekeyId: REKEY, runner: RUNNER, fetchFn });
    await expectAllUnderNewKey(newKey, oldKey, ids);

    // The photo lives at its new object under the new key; the old objects are gone
    const newImg = await movedImageKey(IMG, REKEY);
    const entry = await encryptionService.decryptPost(newKey, server.entries.get(1) as never);
    const [ref] = findImageRefs(entry.metadata);
    expect(ref.key).toBe(newImg);
    expect(ref.thumbKey).toBe(await movedImageKey(THUMB, REKEY));
    expect(entry.metadata._featuredKey).toBe(newImg);
    expect(dec.decode(await encryptionService.decryptFile(newKey, server.bucket.get(newImg)!, ref.iv, imageAad(newImg)))).toBe('photo-bytes');
    expect(server.bucket.has(IMG)).toBe(false);
    expect(server.bucket.has(THUMB)).toBe(false);
    // The background that pointed at the same photo follows it
    expect((await openSettingWith(newKey, 'wallpaper')).custom.key).toBe(newImg);
    expect(server.finished).toEqual([REKEY]);
  });

  it('carries on after a run cut short, ending with nothing under the old key and no old photo left', async () => {
    const ids = await seed(oldKey);
    server.failDosesOnce = true;
    await expect(runRekey({ newKey, oldKey, rekeyId: REKEY, runner: RUNNER, fetchFn })).rejects.toThrow('connection lost');
    expect(server.finished).toEqual([]);
    // Photos and entries already moved; the old objects are still there (nothing deleted yet)
    expect(server.bucket.has(IMG)).toBe(true);

    await runRekey({ newKey, oldKey, rekeyId: REKEY, runner: RUNNER, fetchFn });
    await expectAllUnderNewKey(newKey, oldKey, ids);
    expect(server.bucket.has(IMG)).toBe(false);
    expect(server.bucket.has(THUMB)).toBe(false);
    expect([...server.bucket.keys()].sort()).toEqual([await movedImageKey(IMG, REKEY), await movedImageKey(THUMB, REKEY)].sort());
    expect(server.finished).toEqual([REKEY]);
  });

  it('a resumed run leaves a photo shared by an entry and a background readable from both', async () => {
    await seed(oldKey);
    // Run 1 stops after the entries moved but before the settings (the background still points at the old object)
    server.failDosesOnce = true;
    await expect(runRekey({ newKey, oldKey, rekeyId: REKEY, runner: RUNNER, fetchFn })).rejects.toThrow('connection lost');
    await runRekey({ newKey, oldKey, rekeyId: REKEY, runner: RUNNER, fetchFn });

    const newImg = await movedImageKey(IMG, REKEY);
    const entry = await encryptionService.decryptPost(newKey, server.entries.get(1) as never);
    const [ref] = findImageRefs(entry.metadata);
    const bg = (await openSettingWith(newKey, 'wallpaper')).custom;
    for (const holder of [ref, bg]) {
      expect(holder.key).toBe(newImg);
      expect(dec.decode(await encryptionService.decryptFile(newKey, server.bucket.get(holder.key)!, holder.iv, imageAad(holder.key)))).toBe('photo-bytes');
      expect(dec.decode(await encryptionService.decryptFile(newKey, server.bucket.get(holder.thumbKey)!, holder.thumbIv, imageAad(holder.thumbKey)))).toBe('thumb-bytes');
    }
  });

  it('moving a photo twice writes the same object, so a second runner can’t break the first one’s IV', async () => {
    await seed(oldKey);
    const entries = new Map(server.entries);
    const settings = new Map(server.settings);
    const oldObjects = [[IMG, server.bucket.get(IMG)!], [THUMB, server.bucket.get(THUMB)!]] as const;
    await runRekey({ newKey, oldKey, rekeyId: REKEY, runner: RUNNER, fetchFn });
    const newImg = await movedImageKey(IMG, REKEY);
    const first = new Uint8Array(server.bucket.get(newImg)!).slice();
    // A run cut short after the photos went up, started again: nothing points
    // at the new objects yet and the old ones are still there
    for (const [id, e] of entries) server.entries.set(id, e);
    for (const [k, v] of settings) server.settings.set(k, v);
    for (const [k, v] of oldObjects) server.bucket.set(k, v);
    await runRekey({ newKey, oldKey, rekeyId: REKEY, runner: RUNNER, fetchFn });
    expect(new Uint8Array(server.bucket.get(newImg)!)).toEqual(first);
    const entry = await encryptionService.decryptPost(newKey, server.entries.get(1) as never);
    const [ref] = findImageRefs(entry.metadata);
    expect(ref.key).toBe(newImg);
    expect(dec.decode(await encryptionService.decryptFile(newKey, server.bucket.get(newImg)!, ref.iv, imageAad(newImg)))).toBe('photo-bytes');
  });

  it('never seals two different photos under one IV, even when the source is swapped between runs', async () => {
    await seed(oldKey);
    const entries = new Map(server.entries);
    const settings = new Map(server.settings);
    const before = await encryptionService.decryptPost(oldKey, server.entries.get(1) as never);
    const oldRef = findImageRefs(before.metadata)[0];
    await runRekey({ newKey, oldKey, rekeyId: REKEY, runner: RUNNER, fetchFn });
    const newImg = await movedImageKey(IMG, REKEY);
    const firstIv = findImageRefs((await encryptionService.decryptPost(newKey, server.entries.get(1) as never)).metadata)[0].iv;
    // Someone with the old key and the bucket puts other bytes at the old
    // object (same IV, so the entry's reference still opens it) and the run repeats
    for (const [id, e] of entries) server.entries.set(id, e);
    for (const [k, v] of settings) server.settings.set(k, v);
    const forged = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: base64ToArrayBuffer(oldRef.iv), additionalData: enc.encode(imageAad(IMG)) },
      oldKey, enc.encode('other-bytes'),
    );
    server.bucket.set(IMG, forged);
    const thumb = await encryptionService.encryptFile(oldKey, enc.encode('thumb-bytes').buffer as ArrayBuffer, imageAad(THUMB));
    server.bucket.set(THUMB, thumb.ciphertext);
    // (the thumbnail's reference IV is the entry's own: put it back as it was)
    const thumbAgain = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: base64ToArrayBuffer(oldRef.thumbIv), additionalData: enc.encode(imageAad(THUMB)) },
      oldKey, enc.encode('thumb-bytes'),
    );
    server.bucket.set(THUMB, thumbAgain);
    await runRekey({ newKey, oldKey, rekeyId: REKEY, runner: RUNNER, fetchFn });
    const ref = findImageRefs((await encryptionService.decryptPost(newKey, server.entries.get(1) as never)).metadata)[0];
    expect(ref.key).toBe(newImg);
    expect(ref.iv).not.toBe(firstIv);
    expect(dec.decode(await encryptionService.decryptFile(newKey, server.bucket.get(newImg)!, ref.iv, imageAad(newImg)))).toBe('other-bytes');
  });

  // What the AI app overwrote is kept sealed with the old key: none of it may outlive that key
  it('clears the versions kept of the AI app’s changes before it finishes, and never finishes while that fails', async () => {
    await seed(oldKey);
    server.keptChanges = 3;
    server.clearChanges = 'fail';
    await expect(runRekey({ newKey, oldKey, rekeyId: REKEY, runner: RUNNER, fetchFn })).rejects.toThrow();
    expect(server.finished).toEqual([]);
    expect(server.keptChanges).toBe(3);
    server.clearChanges = 'ok';
    await runRekey({ newKey, oldKey, rekeyId: REKEY, runner: RUNNER, fetchFn });
    expect(server.keptChanges).toBe(0);
    expect(server.finished).toEqual([REKEY]);
  });

  it('finishes against a server from before the AI app (nothing kept there to clear)', async () => {
    await seed(oldKey);
    server.clearChanges = 'missing';
    await runRekey({ newKey, oldKey, rekeyId: REKEY, runner: RUNNER, fetchFn });
    expect(server.finished).toEqual([REKEY]);
  });

  it('names itself when it finishes, and leaves the job open when the server says it isn’t its own', async () => {
    await seed(oldKey);
    server.refuseFinish = true;
    await expect(runRekey({ newKey, oldKey, rekeyId: REKEY, runner: RUNNER, fetchFn })).rejects.toMatchObject({ kind: 'taken' });
    expect(server.finished).toEqual([]);
    server.refuseFinish = false;
    await runRekey({ newKey, oldKey, rekeyId: REKEY, runner: RUNNER, fetchFn });
    expect(server.finished).toEqual([REKEY]);
    expect(server.finishRunners).toEqual([RUNNER, RUNNER]);
  });

  it('writes a setting as it is now, not as it was when the job started', async () => {
    await seed(oldKey);
    // A save lands while the photos and entries are moving
    const api = await import('@/services/api');
    const real = api.rekeyRecords.topics;
    const spy = vi.spyOn(api.rekeyRecords as never as { topics: typeof real }, 'topics').mockImplementation(async () => {
      server.settings.set('displayName', await sealSettingWith(newKey, 'displayName', 'Liv'));
      return real();
    });
    await runRekey({ newKey, oldKey, rekeyId: REKEY, runner: RUNNER, fetchFn });
    spy.mockRestore();
    expect(await openSettingWith(newKey, 'displayName')).toBe('Liv');
  });

  it('goes round again for an entry the server refused, and only then finishes', async () => {
    const ids = await seed(oldKey);
    server.refuseEntryOnce = 2;
    await runRekey({ newKey, oldKey, rekeyId: REKEY, runner: RUNNER, fetchFn });
    await expectAllUnderNewKey(newKey, oldKey, ids);
    expect(server.finished).toEqual([REKEY]);
  });

  it('never finishes while something is still under the old key', async () => {
    await seed(oldKey);
    // An entry the server keeps refusing: the job stops, the old key is kept
    const api = await import('@/services/api');
    const reseal = vi.spyOn(api.entries as never as { reseal: (l: unknown[]) => Promise<{ resealed: number }> }, 'reseal').mockResolvedValue({ resealed: 0 });
    await expect(runRekey({ newKey, oldKey, rekeyId: REKEY, runner: RUNNER, fetchFn, pauseMs: 0 })).rejects.toBeInstanceOf(RekeyError);
    expect(server.finished).toEqual([]);
    reseal.mockRestore();
  });

  it('stops writing the moment the claim is lost', async () => {
    await seed(oldKey);
    let calls = 0;
    const guard = async () => { if (++calls > 1) throw new RekeyError('taken', 'taken'); };
    const before = JSON.stringify([...server.entries.values()]);
    await expect(runRekey({ newKey, oldKey, rekeyId: REKEY, runner: RUNNER, fetchFn, guard })).rejects.toMatchObject({ kind: 'taken' });
    expect(JSON.stringify([...server.entries.values()])).toBe(before);
    expect(server.finished).toEqual([]);
  });

  it('sends finance records in batches that stay under the request size limit', async () => {
    await seed(oldKey);
    // 40 records of about 40 KB each: one request would be far over 1 MB
    for (let i = 0; i < 40; i++) {
      const id = `0a0b0c0d-0000-4000-8000-${String(i).padStart(12, '0')}`;
      const r = await encryptionService.encryptRecord(oldKey, 'savings', id, { name: `Fund ${i}`, pad: 'x'.repeat(30_000) });
      server.finance.set(`savings:${id}`, { id, payload: r.payload, iv: r.iv, createdAt: '', updatedAt: '' });
    }
    await runRekey({ newKey, oldKey, rekeyId: REKEY, runner: RUNNER, fetchFn });
    expect(server.financeBatches.length).toBeGreaterThan(2);
    expect(Math.max(...server.financeBatches)).toBeLessThanOrEqual(600_000);
    for (const [k, r] of server.finance) {
      const [kind] = k.split(':');
      await encryptionService.decryptRecord(newKey, kind, r.id, r.payload, r.iv);
    }
  });

  it('stops before touching anything when photos exist but the bucket can’t be opened', async () => {
    await seed(oldKey);
    server.settings.delete('imageStorageConfig');
    const before = JSON.stringify([...server.entries.values()]);
    await expect(runRekey({ newKey, oldKey, rekeyId: REKEY, runner: RUNNER, fetchFn })).rejects.toThrow(/R2 bucket/);
    expect(JSON.stringify([...server.entries.values()])).toBe(before);
    expect(server.finished).toEqual([]);
  });

  it('stops and asks when a photo isn’t in the bucket, and only finishes without it once told to', async () => {
    await seed(oldKey);
    server.bucket.delete(IMG);
    const err = await runRekey({ newKey, oldKey, rekeyId: REKEY, runner: RUNNER, fetchFn }).catch(e => e);
    expect(err).toBeInstanceOf(RekeyError);
    expect((err as RekeyError).kind).toBe('missing');
    expect((err as RekeyError).message).toMatch(/^1 photo /);
    // The old key is kept, and no entry has moved yet
    expect(server.finished).toEqual([]);
    await encryptionService.decryptPost(oldKey, server.entries.get(2) as never);

    await runRekey({ newKey, oldKey, rekeyId: REKEY, runner: RUNNER, fetchFn, allowMissingPhotos: true });
    expect(server.finished).toEqual([REKEY]);
    await encryptionService.decryptPost(newKey, server.entries.get(1) as never);
  });

  it('a bucket that can’t be reached is photo trouble, so the paused screen can offer its settings', async () => {
    await seed(oldKey);
    const down = (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    const err = await runRekey({ newKey, oldKey, rekeyId: REKEY, runner: RUNNER, fetchFn: down }).catch(e => e);
    expect(err).toBeInstanceOf(RekeyError);
    expect((err as RekeyError).kind).toBe('photos');
    expect(server.finished).toEqual([]);
  });

  it('moves the settings (the R2 and AI credentials) before the photos', async () => {
    await seed(oldKey);
    let checked = false;
    const watching = (async (url: string, init?: { method?: string; body?: Blob }) => {
      if (!checked) {
        checked = true;
        // The first photo request: the credentials are under the new key already
        expect((await openSettingWith(newKey, 'imageStorageConfig')).bucket).toBe('b');
        expect(await openSettingWith(newKey, 'displayName')).toBe('Olivia');
      }
      return (fetchFn as unknown as (u: string, i?: unknown) => Promise<Response>)(url, init);
    }) as unknown as typeof fetch;
    await runRekey({ newKey, oldKey, rekeyId: REKEY, runner: RUNNER, fetchFn: watching });
    expect(checked).toBe(true);
    expect(server.finished).toEqual([REKEY]);
  });
});

describe('checkPhotosReachable', () => {
  const cfg = { accountId: 'a', bucket: 'b', accessKeyId: 'c', secretAccessKey: 'd' };
  const probe = async () => {};

  it('passes when the bucket answers and a photo is there', async () => {
    await seed(await generateMasterKey());
    await checkPhotosReachable(cfg, [IMG], fetchFn, probe);
  });

  it('refuses when the test upload fails, before anything is sent', async () => {
    await expect(checkPhotosReachable(cfg, [IMG], fetchFn, async () => { throw new Error('The bucket refused a test upload (HTTP 403)'); })).rejects.toThrow(/403/);
  });

  it('refuses when none of the photos are in this bucket, or it won’t let them be read', async () => {
    await seed(await generateMasterKey());
    server.bucket.clear();
    await expect(checkPhotosReachable(cfg, [IMG], fetchFn, probe)).rejects.toThrow(/weren’t found/);
    const denied = (async () => new Response(null, { status: 403 })) as unknown as typeof fetch;
    await expect(checkPhotosReachable(cfg, [IMG], denied, probe)).rejects.toThrow(/HTTP 403/);
  });

  it('one photo already gone doesn’t block it while another is there', async () => {
    await seed(await generateMasterKey());
    await checkPhotosReachable(cfg, ['img/99999999-2222-4333-8444-555555555555', IMG], fetchFn, probe);
  });
});

describe('settingsHoldPhotos', () => {
  it('finds a photo kept by a setting, so a re-key is never started without the bucket for it', async () => {
    const key = await generateMasterKey();
    await seed(key);
    const open = (c: ArrayBuffer, iv: string, aad?: string) => encryptionService.decryptFile(key, c, iv, aad);
    expect(await settingsHoldPhotos(open)).toBe(true);
    server.settings.delete('wallpaper');
    expect(await settingsHoldPhotos(open)).toBe(false);
  });
});

describe('inBatches', () => {
  it('caps a batch by count and by bytes, and never drops an oversized item', () => {
    expect(inBatches([1, 1, 1, 1, 1], n => n, 2, 100)).toEqual([[1, 1], [1, 1], [1]]);
    expect(inBatches([60, 60, 500, 10], n => n, 10, 100)).toEqual([[60], [60], [500], [10]]);
    expect(inBatches([], () => 1, 2, 2)).toEqual([]);
  });
});

describe('movedImageIv (the IV a moved photo is sealed with)', () => {
  const bytes = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;
  const hex = (iv: Uint8Array) => Array.from(iv, b => b.toString(16).padStart(2, '0')).join('');

  it('is the same for the same photo, object and re-key (a repeated move writes the identical object)', async () => {
    const a = await movedImageIv('img/x', 'rk1', bytes('photo'), 'tag-of-the-new-key');
    const b = await movedImageIv('img/x', 'rk1', bytes('photo'), 'tag-of-the-new-key');
    expect(a).toHaveLength(12);
    expect(hex(a)).toBe(hex(b));
  });

  it('differs for other bytes, another object or another re-key', async () => {
    const base = hex(await movedImageIv('img/x', 'rk1', bytes('photo'), 'tag'));
    expect(hex(await movedImageIv('img/x', 'rk1', bytes('other photo'), 'tag'))).not.toBe(base);
    expect(hex(await movedImageIv('img/y', 'rk1', bytes('photo'), 'tag'))).not.toBe(base);
    expect(hex(await movedImageIv('img/x', 'rk2', bytes('photo'), 'tag'))).not.toBe(base);
  });

  it('can’t be worked out without the new key: it is keyed with the new key’s tag, and refuses to run without one', async () => {
    const mine = hex(await movedImageIv('img/x', 'rk1', bytes('photo'), 'tag-only-the-new-key-makes'));
    const guess = hex(await movedImageIv('img/x', 'rk1', bytes('photo'), 'someone-else'));
    expect(guess).not.toBe(mine);
    await expect(movedImageIv('img/x', 'rk1', bytes('photo'), '')).rejects.toThrow();
  });
});
