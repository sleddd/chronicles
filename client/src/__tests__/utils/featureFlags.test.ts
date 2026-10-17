import { describe, it, expect } from 'vitest';
import { featureFlagsFrom, KNOWN_FEATURE_FLAGS } from '../../utils/featureFlags.js';

describe('featureFlagsFrom', () => {
  it('turns known flags on and Finance off when nothing is saved', () => {
    const flags = featureFlagsFrom({});
    for (const key of KNOWN_FEATURE_FLAGS) expect(flags[key]).toBe(true);
    expect(flags.financeEnabled).toBe(false);
  });

  it('keeps saved values', () => {
    const flags = featureFlagsFrom({ financeEnabled: true, foodEnabled: false });
    expect(flags.financeEnabled).toBe(true);
    expect(flags.foodEnabled).toBe(false);
  });
});
