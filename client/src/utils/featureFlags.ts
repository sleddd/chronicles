/** Feature flags the app knows about — each defaults to enabled when never saved. */
export const KNOWN_FEATURE_FLAGS = [
  'foodEnabled', 'medicationEnabled', 'goalsEnabled', 'milestonesEnabled',
  'exerciseEnabled', 'allergiesEnabled', 'entertainmentEnabled', 'inspirationEnabled',
] as const;

/** Opt-in features — off until the user turns them on in Settings. */
export const OPT_IN_FEATURE_FLAGS = ['financeEnabled', 'reconcileEnabled'] as const;

/** Feature flags from loaded settings: saved booleans win; known flags default to true, opt-in flags to false. */
export function featureFlagsFrom(settingsMap: Record<string, unknown>): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  for (const key of Object.keys(settingsMap)) {
    if (key.endsWith('Enabled') && typeof settingsMap[key] === 'boolean') flags[key] = settingsMap[key] as boolean;
  }
  for (const key of KNOWN_FEATURE_FLAGS) {
    if (typeof flags[key] !== 'boolean') flags[key] = true;
  }
  for (const key of OPT_IN_FEATURE_FLAGS) {
    if (typeof flags[key] !== 'boolean') flags[key] = false;
  }
  return flags;
}
