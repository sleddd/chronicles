/* Voice "mark" commands: tick today's next dose of a medication or the next
   session of an exercise routine by name — "mark oregano oil taken", "I took
   my vitamin D", "mark exercise ocean breathing", "mark ocean breathing done".
   Pure: says what to mark; the voice panel finds it and ticks it. */

export type MarkKind = 'med' | 'exercise' | 'any';

export interface MarkCommand {
  kind: MarkKind;
  /** The medication or routine as said */
  name: string;
}

const MED_WORDS = /^(?:my\s+)?(?:medication|medicine|meds?|dose(?:\s+of)?|pill)\s+/i;
const EXERCISE_WORDS = /^(?:my\s+)?(?:exercise|routine|workout|session(?:\s+of)?)\s+/i;
const TAKEN_END = /\s+(?:as\s+)?taken[.!]?$/i;
const DONE_END = /\s+(?:as\s+)?(?:done|complete(?:d)?|finished)[.!]?$/i;

export function parseMarkCommand(said: string): MarkCommand | null {
  const s = said.trim().replace(/\s+/g, ' ').replace(/^(?:please|ok(?:ay)?)[,\s]+/i, '');
  let m = s.match(/^(?:i\s+)?(?:took|have\s+taken|just\s+took)\s+(?:my\s+)?(.+)$/i);
  if (m) return clean('med', m[1]);
  m = s.match(/^(?:i\s+)?(?:did|have\s+done|just\s+did|finished)\s+(?:my\s+)?(.+)$/i);
  if (m) return clean('exercise', m[1]);
  m = s.match(/^(?:mark|tick(?:\s+off)?|check\s+off|check)\s+(.+)$/i);
  if (!m) return null;
  let rest = m[1];
  let kind: MarkKind = 'any';
  if (MED_WORDS.test(rest)) { kind = 'med'; rest = rest.replace(MED_WORDS, ''); }
  else if (EXERCISE_WORDS.test(rest)) { kind = 'exercise'; rest = rest.replace(EXERCISE_WORDS, ''); }
  if (TAKEN_END.test(rest)) { if (kind === 'any') kind = 'med'; rest = rest.replace(TAKEN_END, ''); }
  else rest = rest.replace(DONE_END, '');
  return clean(kind, rest);
}

function clean(kind: MarkKind, name: string): MarkCommand | null {
  const n = name.replace(/^(?:my|the)\s+/i, '').replace(/[\s,.!]+$/, '').replace(/\s+(?:today|now|this morning|tonight)$/i, '').trim();
  return n.length >= 2 ? { kind, name: n } : null;
}
