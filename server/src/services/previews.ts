/* Feature previews: features shown only to some accounts while they're tried out.
   PREVIEW_ACCOUNT_IDS (comma-separated account ids) says which; by default none — Focus
   sounds is hidden from everyone for now (kept in the code; set the variable to bring it back). The client gets the list with the user (`previews`) and shows a preview only
   when it's there. It hides a feature from view — it is not a security boundary. */

const PREVIEWS = ['focus'] as const;
export type Preview = typeof PREVIEWS[number];

function previewAccounts(): Set<number> {
  const raw = process.env.PREVIEW_ACCOUNT_IDS ?? '';
  return new Set(raw.split(',').map(s => Number(s.trim())).filter(n => Number.isInteger(n) && n > 0));
}

/** The previews an account sees */
export function previewsFor(accountId: number): Preview[] {
  return previewAccounts().has(accountId) ? [...PREVIEWS] : [];
}

/** The user object's previews field: only there when the account has any */
export function previewField(accountId: number): { previews?: Preview[] } {
  const previews = previewsFor(accountId);
  return previews.length ? { previews } : {};
}
