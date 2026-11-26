import { describe, it, expect, vi, afterEach } from 'vitest';
import { addUsage, fitsWithoutCounting, forgetUsage, knownUsage, setUsage } from '../../db/storageUsage.js';

const S = 'usr_1_abc123';

describe('remembered storage figures', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('nothing fits without counting until something was counted', () => {
    expect(fitsWithoutCounting(S, 'posts', { bytes: 1 }, { maxBytes: 1000 })).toBe(false);
  });

  it('a write fits only while figure + write stays under half the cap', () => {
    setUsage(S, 'posts', { bytes: 300, rows: 0 });
    expect(fitsWithoutCounting(S, 'posts', { bytes: 200 }, { maxBytes: 1000 })).toBe(true);
    expect(fitsWithoutCounting(S, 'posts', { bytes: 201 }, { maxBytes: 1000 })).toBe(false);
  });

  it('holds the row cap to half as well', () => {
    setUsage(S, 'doses', { bytes: 0, rows: 4 });
    expect(fitsWithoutCounting(S, 'doses', { bytes: 1, rows: 1 }, { maxBytes: 1000, maxRows: 10 })).toBe(true);
    setUsage(S, 'doses', { bytes: 0, rows: 5 });
    expect(fitsWithoutCounting(S, 'doses', { bytes: 1, rows: 1 }, { maxBytes: 1000, maxRows: 10 })).toBe(false);
  });

  it('every uncounted write goes on the figure, so a run of them ends in a count', () => {
    setUsage(S, 'posts', { bytes: 0, rows: 0 });
    let writes = 0;
    while (fitsWithoutCounting(S, 'posts', { bytes: 100 }, { maxBytes: 1000 })) { addUsage(S, 'posts', { bytes: 100 }); writes++; }
    expect(writes).toBe(5);
  });

  it('a figure is dropped after five minutes, and adding to it never renews it', () => {
    vi.useFakeTimers();
    setUsage(S, 'posts', { bytes: 0, rows: 0 });
    vi.advanceTimersByTime(4 * 60 * 1000);
    addUsage(S, 'posts', { bytes: 1 });
    expect(knownUsage(S, 'posts')).not.toBeNull();
    vi.advanceTimersByTime(61 * 1000);
    expect(knownUsage(S, 'posts')).toBeNull();
  });

  it('kinds and accounts are separate, and forgetting takes one kind or all', () => {
    setUsage(S, 'posts', { bytes: 1, rows: 0 });
    setUsage(S, 'finance', { bytes: 2, rows: 0 });
    setUsage('usr_2_def456', 'posts', { bytes: 3, rows: 0 });
    forgetUsage(S, 'posts');
    expect(knownUsage(S, 'posts')).toBeNull();
    expect(knownUsage(S, 'finance')?.bytes).toBe(2);
    forgetUsage(S);
    expect(knownUsage(S, 'finance')).toBeNull();
    expect(knownUsage('usr_2_def456', 'posts')?.bytes).toBe(3);
  });

  it('never keeps a figure that is not a number', () => {
    setUsage(S, 'posts', { bytes: Number.NaN, rows: 0 });
    expect(knownUsage(S, 'posts')).toBeNull();
  });
});
