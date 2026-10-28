/**
 * Safely parse a route param as a positive integer.
 * Returns NaN for non-numeric strings like "abc".
 */
export function parseId(value: string): number {
  const id = Number(value);
  // Ids are Postgres int columns: anything larger failed the cast as a 500
  if (!Number.isInteger(id) || id < 1 || id > 2_147_483_647) return NaN;
  return id;
}
