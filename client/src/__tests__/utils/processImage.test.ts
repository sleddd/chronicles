import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { processImage } from '@/utils/processImage';

/** jsdom has no canvas — substitute a recording fake for createElement('canvas'). */
interface FakeCanvas {
  width: number;
  height: number;
  getContext: () => { drawImage: ReturnType<typeof vi.fn> };
  toBlob: (cb: (blob: Blob | null) => void, type?: string, quality?: number) => void;
}

let createdCanvases: FakeCanvas[];
let blobSize: number;
const realCreateElement = document.createElement.bind(document);

function makeFakeCanvas(): FakeCanvas {
  const canvas: FakeCanvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: vi.fn() }),
    toBlob: (cb, type) => cb(new Blob([new Uint8Array(blobSize)], { type })),
  };
  createdCanvases.push(canvas);
  return canvas;
}

beforeEach(() => {
  createdCanvases = [];
  blobSize = 1000;
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) =>
    tag === 'canvas' ? makeFakeCanvas() : realCreateElement(tag)) as typeof document.createElement);
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({
    width: 5120,
    height: 2880,
    close: vi.fn(),
  })));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('processImage', () => {
  it('rejects non-image files', async () => {
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' });
    await expect(processImage(file)).rejects.toThrow(/JPG, PNG, WebP or AVIF/);
  });

  it('rejects SVG and GIF — only JPG, PNG, WebP and AVIF are allowed', async () => {
    for (const [name, type] of [['x.svg', 'image/svg+xml'], ['x.gif', 'image/gif']]) {
      await expect(processImage(new File(['<svg/>'], name, { type }))).rejects.toThrow(/JPG, PNG, WebP or AVIF/);
    }
  });

  it('rejects files that fail to decode', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw new Error('bad data'); }));
    const file = new File([new Uint8Array(10)], 'broken.jpg', { type: 'image/jpeg' });
    await expect(processImage(file)).rejects.toThrow(/could not be read/i);
  });

  it('downscales the full image to a 2560px long edge and the thumb to 400px', async () => {
    const file = new File([new Uint8Array(10)], 'photo.jpg', { type: 'image/jpeg' });
    const result = await processImage(file);

    // 5120x2880 → full 2560x1440, thumb 400x225
    expect(result.width).toBe(2560);
    expect(result.height).toBe(1440);
    const dims = createdCanvases.map(c => [c.width, c.height]);
    expect(dims).toContainEqual([2560, 1440]);
    expect(dims).toContainEqual([400, 225]);
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.full).toBeInstanceOf(Blob);
    expect(result.thumb).toBeInstanceOf(Blob);
  });

  it('keeps small images at their original size', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({
      width: 800, height: 600, close: vi.fn(),
    })));
    const file = new File([new Uint8Array(10)], 'small.jpg', { type: 'image/jpeg' });
    const result = await processImage(file);
    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
    // Thumbnail is still scaled down
    expect(createdCanvases.map(c => [c.width, c.height])).toContainEqual([400, 300]);
  });

  it('rejects images still over 10 MB after downscaling', async () => {
    blobSize = 11 * 1024 * 1024;
    const file = new File([new Uint8Array(10)], 'huge.jpg', { type: 'image/jpeg' });
    await expect(processImage(file)).rejects.toThrow(/too large/i);
  });
});
