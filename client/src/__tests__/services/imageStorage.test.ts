import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  collectImageKeys,
  bestEffortDeleteImages,
  getImageObjectUrl,
  clearImageCache,
  setImageStorageConfig,
  setImageStorageDraft,
  getImageStorageConfigValue,
  loadImageStorageConfig,
  rederiveImageStorageConfig,
  encryptImageStorageConfig,
  isImageStorageConfigured,
  isCompleteConfig,
  getImageStorageInfo,
  type R2Config,
} from '@/services/imageStorage';
import { arrayBufferToBase64 } from '@shared/crypto/encoding';

const CFG: R2Config = {
  accountId: 'a'.repeat(32),
  bucket: 'my-images',
  accessKeyId: 'key-id',
  secretAccessKey: 'secret',
};

/** Fake "encryption": ciphertext is just the plaintext bytes, base64'd. */
const identityDecrypt = vi.fn(async (ciphertext: ArrayBuffer) => ciphertext);
const identityEncrypt = vi.fn(async (data: ArrayBuffer) => ({ ciphertext: data, iv: 'aXY=' }));

function encryptedValueOf(cfg: R2Config) {
  const bytes = new TextEncoder().encode(JSON.stringify(cfg));
  return { ciphertext: arrayBufferToBase64(bytes.buffer as ArrayBuffer), iv: 'aXY=' };
}

const img = (n: number) => ({
  key: `img/0000000${n}-0000-0000-0000-000000000000`,
  iv: 'aXY=',
  thumbKey: `img/0000000${n}-0000-0000-0000-000000000000-t`,
  thumbIv: 'aXY=',
  mimeType: 'image/jpeg',
  size: 100,
});

beforeEach(() => {
  vi.clearAllMocks();
  clearImageCache();
  setImageStorageConfig(null, null);
  setImageStorageDraft(null);
  vi.stubGlobal('URL', Object.assign(URL, {
    createObjectURL: vi.fn(() => `blob:mock-${Math.random()}`),
    revokeObjectURL: vi.fn(),
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('collectImageKeys', () => {
  it('flattens full + thumb keys from entries', () => {
    const entries = [
      { metadata: { _images: [img(1), img(2)] } },
      { metadata: {} },
      { metadata: { _images: [img(3)] } },
    ];
    expect(collectImageKeys(entries)).toEqual([
      img(1).key, img(1).thumbKey,
      img(2).key, img(2).thumbKey,
      img(3).key, img(3).thumbKey,
    ]);
  });

  it('ignores malformed metadata', () => {
    expect(collectImageKeys([
      { metadata: { _images: 'nope' as unknown as [] } },
      { metadata: { _images: [{ notAKey: true }] } },
    ])).toEqual([]);
  });
});

describe('config lifecycle', () => {
  it('loads and decrypts the setting value', async () => {
    const ok = await loadImageStorageConfig(encryptedValueOf(CFG), identityDecrypt);
    expect(ok).toBe(true);
    expect(isImageStorageConfigured()).toBe(true);
    expect(getImageStorageInfo()).toEqual({ bucket: 'my-images', accountId: 'a'.repeat(32) });
  });

  it('reports unconfigured for missing or malformed values', async () => {
    expect(await loadImageStorageConfig(undefined, identityDecrypt)).toBe(false);
    expect(await loadImageStorageConfig({ nope: true }, identityDecrypt)).toBe(false);
    expect(isImageStorageConfigured()).toBe(false);
  });

  it('reports unconfigured when decryption fails (wrong key)', async () => {
    const failingDecrypt = vi.fn(async () => { throw new Error('bad key'); });
    expect(await loadImageStorageConfig(encryptedValueOf(CFG), failingDecrypt)).toBe(false);
    expect(getImageStorageInfo()).toBeNull();
  });

  it('clearImageCache drops the plaintext config but rederive restores it', async () => {
    await loadImageStorageConfig(encryptedValueOf(CFG), identityDecrypt);
    clearImageCache(); // lock
    expect(getImageStorageInfo()).toBeNull();
    expect(isImageStorageConfigured()).toBe(true); // encrypted blob is kept
    await rederiveImageStorageConfig(identityDecrypt); // unlock
    expect(getImageStorageInfo()).toEqual({ bucket: 'my-images', accountId: 'a'.repeat(32) });
  });

  it('round-trips through encryptImageStorageConfig', async () => {
    const encrypted = await encryptImageStorageConfig(CFG, identityEncrypt);
    expect(await loadImageStorageConfig(encrypted, identityDecrypt)).toBe(true);
  });

  it('a partial stored config loads for prefill but is not "configured"', async () => {
    const partial: R2Config = { ...CFG, accessKeyId: '', secretAccessKey: '' };
    expect(await loadImageStorageConfig(encryptedValueOf(partial), identityDecrypt)).toBe(false);
    expect(getImageStorageConfigValue()).toEqual(partial); // typed values are preserved
    expect(getImageStorageInfo()).toBeNull();              // but not usable for signing
    expect(isCompleteConfig(partial)).toBe(false);
  });

  it('the unsaved draft survives a lock (clearImageCache) — regression for lost account ID', () => {
    const draft: R2Config = { ...CFG, bucket: '', accessKeyId: '', secretAccessKey: '' };
    setImageStorageDraft(draft);
    clearImageCache(); // tab-away auto-lock
    expect(getImageStorageConfigValue()).toEqual(draft);
  });

  it('the draft takes precedence over the stored config for prefill', async () => {
    await loadImageStorageConfig(encryptedValueOf(CFG), identityDecrypt);
    const draft: R2Config = { ...CFG, bucket: 'renamed-bucket' };
    setImageStorageDraft(draft);
    expect(getImageStorageConfigValue()).toEqual(draft);
  });
});

describe('bestEffortDeleteImages', () => {
  it('skips silently when unconfigured', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await bestEffortDeleteImages(['img/a', 'img/b']);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('issues one signed DELETE per key', async () => {
    setImageStorageConfig(CFG, encryptedValueOf(CFG));
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await bestEffortDeleteImages([img(1).key, img(1).thumbKey]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Keys are signed concurrently, so requests can go out in either order
    for (const [, opts] of fetchMock.mock.calls) expect(opts).toEqual({ method: 'DELETE' });
    const urls = fetchMock.mock.calls.map(([u]) => String(u));
    for (const key of [img(1).key, img(1).thumbKey]) {
      const matching = urls.filter(u => u.includes(`/my-images/${key}?`));
      expect(matching).toHaveLength(1);
      expect(matching[0]).toContain('X-Amz-Signature=');
    }
  });

  it('never throws on network failure', async () => {
    setImageStorageConfig(CFG, encryptedValueOf(CFG));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(bestEffortDeleteImages(['img/a'])).resolves.toBeUndefined();
  });
});

describe('getImageObjectUrl', () => {
  it('fetches a signed GET, decrypts, and caches per key', async () => {
    setImageStorageConfig(CFG, encryptedValueOf(CFG));
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)),
    });
    vi.stubGlobal('fetch', fetchMock);
    const decryptBytes = vi.fn().mockResolvedValue(new ArrayBuffer(8));

    const url1 = await getImageObjectUrl('img/k1', 'aXY=', 'image/jpeg', decryptBytes);
    const url2 = await getImageObjectUrl('img/k1', 'aXY=', 'image/jpeg', decryptBytes);

    expect(url1).toBe(url2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(decryptBytes).toHaveBeenCalledTimes(1);
    const fetchedUrl = fetchMock.mock.calls[0][0] as string;
    expect(fetchedUrl).toContain(`${'a'.repeat(32)}.r2.cloudflarestorage.com/my-images/img/k1?`);
    expect(fetchedUrl).toContain('X-Amz-Signature=');
  });

  it('throws when the journal is locked / unconfigured', async () => {
    await expect(
      getImageObjectUrl('img/k2', 'aXY=', 'image/jpeg', vi.fn())
    ).rejects.toThrow(/not configured|locked/);
  });

  it('propagates fetch failures', async () => {
    setImageStorageConfig(CFG, encryptedValueOf(CFG));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(
      getImageObjectUrl('img/k3', 'aXY=', 'image/jpeg', vi.fn())
    ).rejects.toThrow('404');
  });
});
