/**
 * Settings the server must only ever store sealed (`{ ciphertext, iv, v: 2 }`
 * — master-key AES-GCM bound to the key; client/src/services/settingCipher.ts).
 * The client refuses plaintext for these on load; the server refuses to store
 * it, so an old or buggy client can't leave one readable.
 */

/** Feature flags the app knows about — each defaults to enabled when never saved. */
export const KNOWN_FEATURE_FLAGS = [
  'foodEnabled', 'medicationEnabled', 'goalsEnabled', 'milestonesEnabled',
  'exerciseEnabled', 'allergiesEnabled', 'entertainmentEnabled', 'inspirationEnabled',
] as const;

/** Opt-in features — off until the user turns them on in Settings. */
export const OPT_IN_FEATURE_FLAGS = ['financeEnabled', 'reconcileEnabled'] as const;

/** Personal settings saved with savePrivateSetting. */
export const PRIVATE_SETTING_KEYS = [
  'displayName', 'weatherCity', 'timezone', 'plannerFilters', 'topicCustomFields', 'planningViews',
  ...KNOWN_FEATURE_FLAGS, ...OPT_IN_FEATURE_FLAGS, 'cycleTrackingEnabled', 'icsIncludeDetails',
  // Private since v2: they decide what leaves the device (calendar) or which features are used
  'calendarSyncEnabled', 'googleCalendarId', 'calendarImportMode', 'icsFeedEnabled', 'imagesEnabled', 'topicHideText',
] as const;

/** Every key the server stores sealed only: private settings, the master-key settings with their own hooks, credentials and the seal marker. */
export const SEALED_SETTING_KEYS: readonly string[] = [
  ...PRIVATE_SETTING_KEYS,
  'nutritionGoals', 'dashboardConfig', 'planningOrder',
  'aiConfig', 'imageStorageConfig',
  'settingsSealV2',
];

/** A value sealed bound to its key (the only shape stored for SEALED_SETTING_KEYS). */
export function isBoundSealedValue(v: unknown): boolean {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return typeof o.ciphertext === 'string' && typeof o.iv === 'string' && o.v === 2 && Object.keys(o).length === 3;
}
