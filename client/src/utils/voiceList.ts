/* Voice commands on an existing list: cross an item off, or add one —
   "add priority call the bank" / "cross call the bank off my priorities" (the
   current Priorities list, the dashboard's), 
   "cross laundry off my to-do list titled my to do's", "cross off laundry from
   my to do's", "add milk to to-do list groceries", "add eggs to my shopping
   list". Pure: says what to do and which list was named; the voice panel
   finds the list (a to-do list, or a shopping list when one is said). */

export interface ListItemCommand {
  action: 'check' | 'add';
  item: string;
  /** The list's name as said ('' = none named: the newest one) */
  list: string;
  shopping: boolean;
  /** Today's priorities (the newest Priorities entry) */
  priorities: boolean;
  /** The words named a list ("to-do list", "list", "checklist", "to do's"…) — else it's only a list if one has that name */
  saidList: boolean;
}

/* "the / my / active / current…" then the list word; "active" etc. mean the newest open one */
const LIST_WORDS = /^(?:(?:the|my|our)\s+)?(?:(?:active|current|open|latest|newest|main|today'?s)\s+)?(?:(shopping|grocery)\s+list|((?:top\s+)?priorit(?:y|ies)(?:\s+list)?)|to[\s-]?do\s+list|todo\s+list|check\s*list|list|to[\s-]?do'?s|todos)\b/i;
const NAMED = /^[\s,]*(?:(?:that'?s\s+)?(?:titled|called|named)\b)?[\s,:]*/i;

const tidy = (s: string) => s.replace(/^[\s,.:-]+|[\s,.:!?-]+$/g, '').trim();

/** Which list a phrase names: "to-do list titled my to do's" → "my to do's"; "my to do's" → itself */
function listOf(phrase: string): { list: string; shopping: boolean; priorities: boolean; saidList: boolean } {
  const p = tidy(phrase);
  const m = p.match(LIST_WORDS);
  if (!m) return { list: p, shopping: false, priorities: false, saidList: false };
  // Priorities: one current list, never named
  if (m[2]) return { list: '', shopping: false, priorities: true, saidList: true };
  const after = tidy(p.slice(m[0].length).replace(NAMED, ''));
  const shopping = !!m[1];
  // "my to do's" is itself a name (and a list word): keep it to match by title
  return { list: after || (shopping || /^(?:(?:the|my|our)\s+)?(?:(?:active|current|open|latest|newest|main|today'?s)\s+)?(?:list|check\s*list|to[\s-]?do\s+list|todo\s+list)$/i.test(p) ? '' : p), shopping, priorities: false, saidList: true };
}

export function parseListItemCommand(said: string): ListItemCommand | null {
  const s = said.trim().replace(/\s+/g, ' ').replace(/^(?:please|ok(?:ay)?)[,\s]+/i, '');
  const PRIORITIES = { list: '', shopping: false, priorities: true, saidList: true };
  // "add priority call the bank" / "add a new priority …"
  let p = s.match(/^(?:add|new|set)\s+(?:(?:a|an|another|new|my)\s+)*(?:top\s+)?priority\s+(?:item\s+)?(?:to\s+)?(.+)$/i);
  if (p) return tidy(p[1]) ? { action: 'add', item: tidy(p[1]), ...PRIORITIES } : null;
  // "mark priority call the bank done" / "cross off priority …"
  p = s.match(/^(?:mark|cross|tick|check|strike)\s+(?:off\s+)?(?:my\s+|the\s+)?priority\s+(.+?)(?:\s+(?:as\s+)?(?:done|complete(?:d)?|finished))?$/i);
  if (p) return tidy(p[1]) ? { action: 'check', item: tidy(p[1]), ...PRIORITIES } : null;
  // cross / tick / check / mark [off] ITEM (off|off of|from|on|in) LIST
  let m = s.match(/^(?:cross|tick|check|mark|strike)\s+(?:off\s+)?(.+?)\s+(?:as\s+done\s+)?(?:off(?:\s+of|\s+from)?|from|on|in)\s+(.+)$/i);
  if (m) {
    const item = tidy(m[1]);
    const where = listOf(m[2]);
    return item ? { action: 'check', item, ...where } : null;
  }
  // add ITEM to LIST
  m = s.match(/^(?:add|put)\s+(.+?)\s+(?:on|to|onto)\s+(.+)$/i);
  if (m) {
    const item = tidy(m[1]);
    const where = listOf(m[2]);
    return item ? { action: 'add', item, ...where } : null;
  }
  return null;
}
