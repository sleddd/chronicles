/** A topic name as one item, lowercased: "Recipes" → "recipe", "Allergies" → "allergy", "Books" → "book" */
export function singular(name: string): string {
  const n = name.trim().toLowerCase();
  if (n.endsWith('ies')) return n.slice(0, -3) + 'y';
  if (n.endsWith('s') && !n.endsWith('ss')) return n.slice(0, -1);
  return n;
}
