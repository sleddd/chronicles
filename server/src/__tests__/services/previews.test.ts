import { describe, it, expect, afterEach } from 'vitest';
import { previewsFor } from '../../services/previews.js';

describe('previewsFor', () => {
  const saved = process.env.PREVIEW_ACCOUNT_IDS;
  afterEach(() => { process.env.PREVIEW_ACCOUNT_IDS = saved; });

  it('gives the previews only to the listed accounts', () => {
    process.env.PREVIEW_ACCOUNT_IDS = '1, 2';
    expect(previewsFor(1)).toEqual(['focus']);
    expect(previewsFor(2)).toEqual(['focus']);
    expect(previewsFor(3)).toEqual([]);
  });

  it('defaults to nobody (hidden for now), and an empty list turns them off', () => {
    delete process.env.PREVIEW_ACCOUNT_IDS;
    expect(previewsFor(1)).toEqual([]);
    process.env.PREVIEW_ACCOUNT_IDS = '';
    expect(previewsFor(1)).toEqual([]);
  });
});
