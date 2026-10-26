import { isSealed, openForExport, SEAL_MARKER_KEY } from '../services/privateSettings.js';

/* Settings → Data → Export All: everything the account holds, decrypted here in
   the browser, as one JSON file — entries, topics, the medication dose log,
   settings (AI notes included) and finance. Credentials (AI keys, R2 and AWS
   secrets) are left out: they aren't your data, and a plain file is no place
   for them. */

/** Setting fields never written to an export. */
const SECRET_FIELDS = new Set([
  'apiKey', 'bedrockApiKey', 'awsAccessKeyId', 'awsSecretAccessKey', 'awsSessionToken',
  // imageStorageConfig is stored as an R2Config (r2Signer.ts); the r2-prefixed
  // names are the form schema's, kept in case an old value used them
  'accessKeyId', 'secretAccessKey', 'r2AccessKeyId', 'r2SecretAccessKey',
]);

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([k]) => !SECRET_FIELDS.has(k))
    .map(([k, v]) => [k, redactSecrets(v)]));
}

type DecryptBytes = (ciphertext: ArrayBuffer, iv: string, aad?: string) => Promise<ArrayBuffer>;

/** Every setting, sealed ones opened; a value that won't open is noted, not dropped silently. */
export async function openAllSettings(
  rows: { key: string; value: unknown }[],
  decryptBytes: DecryptBytes,
): Promise<{ settings: Record<string, unknown>; unreadable: string[] }> {
  const settings: Record<string, unknown> = {};
  const unreadable: string[] = [];
  for (const { key, value } of rows) {
    if (key === SEAL_MARKER_KEY) continue;
    if (isSealed(value)) {
      try { settings[key] = redactSecrets(await openForExport(key, value, decryptBytes)); }
      catch { unreadable.push(key); }
    } else {
      settings[key] = redactSecrets(value);
    }
  }
  return { settings, unreadable };
}

export interface FullExportInput {
  entries: unknown[];
  topics: unknown[];
  doseLogs: unknown[];
  settings: Record<string, unknown>;
  finance: unknown;
  now?: Date;
}

export function buildFullExport(i: FullExportInput) {
  return {
    app: 'chronicles',
    kind: 'full-export',
    version: 1,
    exportedAt: (i.now ?? new Date()).toISOString(),
    note: 'Decrypted copy of your Chronicles data. Not encrypted — keep it somewhere safe. AI and storage credentials are left out.',
    entries: i.entries,
    topics: i.topics,
    medicationDoseLogs: i.doseLogs,
    settings: i.settings,
    finance: i.finance,
  };
}
