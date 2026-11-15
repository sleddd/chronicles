import { describe, expect, it } from 'vitest';
import { shadeFor } from '../../components/organisms/Wallpaper.js';

describe('shadeFor', () => {
  it('asks nothing extra of a dark photo', () => {
    expect(shadeFor(0.1, 0.12, 0.2)).toBe(0);
  });
  it('asks about 54% of a near-white photo, enough for small white text', () => {
    expect(shadeFor(1, 1, 1)).toBeGreaterThan(0.52);
    expect(shadeFor(1, 1, 1)).toBeLessThan(0.56);
  });
  it('asks less of a mid-bright photo', () => {
    const mid = shadeFor(0.7, 0.7, 0.7);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(shadeFor(1, 1, 1));
  });
});
