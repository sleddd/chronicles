/**
 * Entry rows as the server sent them, before anything is decrypted. An
 * entry's ciphertext is bound to its id (`…:<entry id>:…` in the AAD), and the
 * id goes into that string as text — so a row whose id came as the string "7"
 * would open as entry 7 while comparing unequal to the number 7 everywhere
 * else (the server could then hand 7 out again as a "fresh" id). Only rows
 * with a real positive integer id are kept, each id once.
 */
export function validEntryRows<T extends { id?: unknown }>(rows: T[]): T[] {
  const seen = new Set<number>();
  return rows.filter(row => {
    const id = row.id;
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1 || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
