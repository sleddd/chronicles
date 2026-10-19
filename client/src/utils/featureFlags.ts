import { KNOWN_FEATURE_FLAGS, OPT_IN_FEATURE_FLAGS } from '@shared/validation/sealedSettings.js';

// Known (default on) and opt-in (default off) flags — one list, shared with the server
export { KNOWN_FEATURE_FLAGS, OPT_IN_FEATURE_FLAGS };

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
