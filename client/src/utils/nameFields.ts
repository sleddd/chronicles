import DOMPurify from 'dompurify';

/*
 * Name-led topics: an entry's name is the FIRST LINE of its main text (the
 * editor's first block). The name field (taskDescription, mealDescription…)
 * is kept as a copy written from that line, so everything that reads the
 * field (med history, the media shelf, calendar sync…) keeps working.
 */

/** Entry type (EntryForm's customType) → the field that holds a copy of its name */
export const NAME_FIELD_BY_TYPE: Record<string, string> = {
  food: 'mealDescription', medication: 'medicationName', allergy: 'allergen',
  goal: 'goalObjective', milestone: 'milestoneObjective', recipe: 'recipeName',
  event: 'eventName', meeting: 'meetingName', task: 'taskDescription', symptom: 'symptomName', change: 'changeWhat',
  routine: 'routineName', training_plan: 'planName', time_tracking: 'activityName', media: 'mediaTitle', habit: 'habitName',
};

/** The editor's placeholder for each name-led type (what its old title box asked) */
export const NAME_PLACEHOLDER_BY_TYPE: Record<string, string> = {
  food: 'What did you eat?', medication: 'Medication name, e.g. Montelukast', allergy: 'Allergen, e.g. Peanuts, Pollen, Dust',
  goal: 'What do you want to achieve?', milestone: 'What does this milestone accomplish?', recipe: 'What is the recipe?',
  event: 'What is the event?', meeting: 'What is the meeting?', task: 'What needs doing?', symptom: 'What’s going on?',
  change: 'What changed? e.g. Cut out dairy', routine: 'Exercise name, e.g. Walk', training_plan: 'Plan name, e.g. Mt Hood',
  time_tracking: 'What are you tracking time to?', media: 'Title', habit: 'What do you want to keep doing?',
};

/** The longest name kept in a name field */
export const NAME_MAX = 200;

const BLOCK = /^(P|H[1-6]|LI|BLOCKQUOTE|PRE|DIV)$/;

/** The plain text of the first block that has any (a paragraph, heading or list item) */
export function nameFromContent(html: string): string {
  if (!html || !html.trim()) return '';
  const frag = DOMPurify.sanitize(html, { RETURN_DOM_FRAGMENT: true });
  const first = (node: Node): string => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) {
        const t = (child.textContent || '').trim();
        if (t) return t;
        continue;
      }
      if (child.nodeType !== 1) continue;
      const el = child as Element;
      if (el.tagName === 'UL' || el.tagName === 'OL') { const t = first(el); if (t) return t; continue; }
      if (BLOCK.test(el.tagName)) {
        const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (t) return t;
        continue;
      }
      const t = (el.textContent || '').trim();
      if (t) return t;
    }
    return '';
  };
  return first(frag).slice(0, NAME_MAX);
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** The content with `name` as its first line: unchanged when it already is, else the name put in front
 *  (everything already there is kept after it) */
export function contentWithName(html: string, name: string): string {
  const n = name.trim();
  if (!n) return html;
  if (nameFromContent(html) === n.slice(0, NAME_MAX)) return html;
  const line = `<p>${escapeHtml(n)}</p>`;
  return html && html.trim() ? line + html : line;
}

/** The content with its first line replaced by `name` (a rename): the rest of the writing is kept.
 *  The first line is replaced only when it is the entry's name now (`current`) — when it is
 *  other writing, or the content doesn't open with a plain paragraph or heading, the name is
 *  put in front instead, so nothing written is lost */
export function contentRenamed(html: string, name: string, current: string): string {
  const n = name.trim();
  if (!n) return html;
  const line = `<p>${escapeHtml(n)}</p>`;
  const opening = /^\s*<(p|h[1-6])(\s[^>]*)?>[\s\S]*?<\/\1>/i;
  const opensWithName = opening.test(html) && nameFromContent(html) === current.trim().slice(0, NAME_MAX);
  // A function, not a string: "$1,000" in a title would be read as a capture group
  return opensWithName ? html.replace(opening, () => line) : contentWithName(html, n);
}
