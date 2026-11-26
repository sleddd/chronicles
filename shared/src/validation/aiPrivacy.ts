/**
 * "Don't share with AI" (Settings → In-App AI): what no AI may see, and whether
 * the Chronicles AI app may sign in. One shape, read by the browser and by the
 * server (which enforces it for the AI app).
 *
 * Stored twice. `aiPrivacySealed` is sealed with the account's key and is what
 * the browser believes. `aiPrivacy` is a readable copy of it, there only so the
 * server can enforce the choices: it holds ids and switches, nothing else.
 */

/** The readable copy the server enforces. */
export const AI_PRIVACY_KEY = 'aiPrivacy';
/** The sealed copy the browser believes. */
export const AI_PRIVACY_SEALED_KEY = 'aiPrivacySealed';

/** Records outside entries that can be kept from AI. */
export const AI_FEATURE_KEYS = ['doses', 'habits', 'bills', 'vision'] as const;
export type AiFeatureKey = typeof AI_FEATURE_KEYS[number];

export interface AiPrivacy {
  /** The Chronicles AI app (Mac and iPad) may sign in. */
  appEnabled: boolean;
  /** Topics whose entries no AI sees. */
  hiddenTopicIds: number[];
  hiddenFeatures: AiFeatureKey[];
}

/** Anything that isn't well formed is dropped: an unreadable value hides nothing and switches nothing on. */
export function parseAiPrivacy(value: unknown): AiPrivacy {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    appEnabled: v.appEnabled === true,
    hiddenTopicIds: Array.isArray(v.hiddenTopicIds)
      ? v.hiddenTopicIds.filter((n): n is number => Number.isSafeInteger(n) && (n as number) > 0) : [],
    hiddenFeatures: Array.isArray(v.hiddenFeatures)
      ? v.hiddenFeatures.filter((f): f is AiFeatureKey => (AI_FEATURE_KEYS as readonly string[]).includes(f as string)) : [],
  };
}
