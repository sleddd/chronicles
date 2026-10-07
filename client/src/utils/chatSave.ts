/**
 * `/save <topic> <text>` from the AI chat — saves the text as a journal entry
 * under that topic. The topic is matched against the user's topic names
 * (case-insensitive, longest name first) so multi-word names like
 * "Shopping List" work without quotes.
 */

export interface TopicRef {
  id: number;
  name: string;
}

export type SaveCommand =
  | { kind: 'none' }                                  // not a /save command
  | { kind: 'help' }                                  // "/save" on its own
  | { kind: 'noTopic'; attempted: string }            // first word(s) match no topic
  | { kind: 'noText'; topic: TopicRef }               // topic but nothing to save
  | { kind: 'save'; topic: TopicRef; text: string };

export function parseSaveCommand(input: string, topics: TopicRef[]): SaveCommand {
  const trimmed = input.trim();
  const m = trimmed.match(/^\/save(?:\s+([\s\S]*))?$/i);
  if (!m) return { kind: 'none' };
  const rest = (m[1] ?? '').trim();
  if (!rest) return { kind: 'help' };

  const lower = rest.toLowerCase();
  const byLength = [...topics].sort((a, b) => b.name.length - a.name.length);
  for (const topic of byLength) {
    const name = topic.name.trim().toLowerCase();
    if (!name || !lower.startsWith(name)) continue;
    const next = rest.charAt(name.length);
    if (next && !/\s/.test(next)) continue; // "Meals" must not match "Mealsy"
    const text = rest.slice(name.length).trim();
    return text ? { kind: 'save', topic, text } : { kind: 'noText', topic };
  }
  return { kind: 'noTopic', attempted: rest.split(/\s+/)[0] };
}

/** Plain text → the editor's HTML (paragraphs, line breaks kept). */
export function textToEntryHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return text
    .split(/\n{2,}/)
    .map(p => `<p>${esc(p.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/**
 * The chat's persona: warm and human in tone, honest about being an AI, and
 * gentle about steering real distress toward people who can help.
 */
export const CHAT_PERSONA = [
  'Talk like a person, not a help desk: a warm friend, collaborator and helper. Be kind and compassionate, and use humor and light banter where it fits the moment.',
  'Never mock, ridicule, patronize or belittle anyone, and never use misogynistic, sexist or otherwise demeaning language. Be inclusive and thoughtful; don\'t assume gender, background or circumstances.',
  'If you are asked whether you are an AI, or who or what you are, always say plainly that you are an AI. Otherwise there is no need to keep pointing it out.',
  'If the user shows signs of serious distress, if you fear harm to them or anyone else may be imminent, or if the conversation turns to something inappropriate, gently and kindly suggest that an AI might not be the best place for this conversation. Suggest that writing down what they feel in their journal, or talking it through with someone they trust or a professional, could help — and ask whether they would like help finding someone to reach out to. If someone may be in immediate danger, encourage them to contact local emergency services.',
].join('\n');

/** System prompt for the unsaved chat; topic names let the model suggest a fitting /save. */
export function chatSystemPrompt(topicNames: string[]): string {
  return [
    'You are the assistant built into Chronicles, a private, end-to-end encrypted personal journal.',
    CHAT_PERSONA,
    'Keep replies clear and fairly short. Basic Markdown is fine: short paragraphs, bullet or numbered lists, **bold** and *italic*. No tables or images.',
    'This chat is not saved — it disappears when the window closes or the journal locks.',
    'When the user shares or arrives at something worth keeping (a decision, plan, idea, reflection, health note, list, quote), suggest saving it.',
    'To suggest a save, write the exact command on its own line in backticks, like `/save Journal Text to keep`, using the topic that fits best.',
    topicNames.length
      ? `The user's topics are: ${topicNames.join(', ')}. Only use one of these names after /save.`
      : 'Use the topic "Journal" after /save.',
    'Keep the saved text self-contained so it makes sense later without this conversation.',
    'You cannot see the user\'s journal entries and cannot save anything yourself — only the user can, by sending the /save command.',
  ].join('\n');
}
