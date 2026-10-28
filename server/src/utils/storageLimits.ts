/**
 * Per-account storage caps. Every entry is loaded into the browser in one
 * response (GET /api/entries), so an account's total has to stay small enough
 * to send — and one signed-in account mustn't be able to fill the database.
 * Generous for a personal journal (drawings included); set in MB by env.
 */
const mb = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return (Number.isFinite(n) && n > 0 ? n : fallback) * 1024 * 1024;
};

/** Encrypted entry content + metadata, all entries of one account */
export const ENTRY_STORAGE_LIMIT_BYTES = mb('ENTRY_STORAGE_LIMIT_MB', 200);

/** Encrypted finance payloads, all tables of one account */
export const FINANCE_STORAGE_LIMIT_BYTES = mb('FINANCE_STORAGE_LIMIT_MB', 50);

/**
 * Each stored row counts this much on top of its ciphertext toward the caps,
 * so the caps also bound how many rows an account can make (tiny rows used to
 * be nearly free): 200 MB of entries is at most ~400k rows, 50 MB of finance
 * ~100k. A real journal's few thousand rows add a couple of MB.
 */
export const ROW_OVERHEAD_BYTES = 512;
