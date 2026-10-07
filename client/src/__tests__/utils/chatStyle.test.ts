import { describe, it, expect } from 'vitest';
import { BANNED_PHRASES, findBanned, scrubBanned, limitEmojis, rewriteInstruction } from '../../utils/chatStyle.js';
import { chatSystemPrompt } from '../../utils/chatSave.js';

describe('findBanned', () => {
  it('finds banned phrases regardless of case and apostrophe style', () => {
    expect(findBanned('Got it! Let’s plan.')).toEqual(['got it']);
    expect(findBanned("You’re right, that works")).toEqual(["you're right"]);
    expect(findBanned('Haha, sure.')).toEqual(['haha']);
    expect(findBanned("I'm here for you.")).toContain("i'm here for you");
    expect(findBanned('What a Wonderful idea')).toEqual(['wonderful']);
  });

  it('matches whole words only', () => {
    expect(findBanned('That is fairly common, and the harbor is unfair.')).toEqual([]);
    expect(findBanned('Have a hearty breakfast; the graph shows it.')).toEqual([]);
    expect(findBanned('Sitting with friends helps.')).toEqual([]);
  });

  it('ignores code spans such as /save suggestions with the user’s own words', () => {
    expect(findBanned('Want to keep it?\n`/save Journal I know I can do this`')).toEqual([]);
  });

  it('covers the whole list', () => {
    for (const p of BANNED_PHRASES) expect(findBanned(`x ${p} y`).length).toBeGreaterThan(0);
  });
});

describe('scrubBanned', () => {
  it('removes phrases and tidies punctuation and capitals', () => {
    expect(scrubBanned('Got it! Let’s plan the week.')).toBe('Let’s plan the week.');
    expect(scrubBanned("You're right, the walk helps.")).toBe('The walk helps.');
    expect(scrubBanned('That sounds lovely. Try a short walk.')).toBe('That sounds. Try a short walk.');
    expect(findBanned(scrubBanned('Haha yeah, noted. Here is a plan.'))).toEqual([]);
  });

  it('leaves code spans untouched', () => {
    expect(scrubBanned('Okay. `/save Journal yeah I know`')).toContain('`/save Journal yeah I know`');
  });
});

describe('limitEmojis', () => {
  it('keeps the first emoji only', () => {
    expect(limitEmojis('Nice 😊 plan 🎉🎉 go 👍🏽')).toBe('Nice 😊 plan go ');
  });
  it('keeps emoji-free text as is', () => {
    expect(limitEmojis('*smiles* Sounds good.')).toBe('*smiles* Sounds good.');
  });
});

describe('prompt', () => {
  it('lists every banned phrase and the tone rules', () => {
    const sys = chatSystemPrompt(['Journal']);
    for (const p of BANNED_PHRASES) expect(sys).toContain(`"${p}"`);
    expect(sys).toMatch(/active listener/);
    expect(sys).toMatch(/asterisks/);
    expect(sys).toMatch(/What's up/);
  });
  it('builds a rewrite instruction naming the offenders', () => {
    expect(rewriteInstruction(['got it', 'yeah'])).toMatch(/"got it", "yeah"/);
  });
});

describe('user notes', () => {
  it('adds the notes, trimmed and capped, after the house rules', () => {
    const sys = chatSystemPrompt(['Journal'], '  Call me Sam. Keep it short.  ');
    expect(sys).toContain('<user_notes>\nCall me Sam. Keep it short.\n</user_notes>');
    expect(sys.indexOf('<user_notes>')).toBeGreaterThan(sys.indexOf('Never use these words'));
    expect(chatSystemPrompt([], 'x'.repeat(5000))).toContain('x'.repeat(2000) + '\n</user_notes>');
  });
  it('omits the block when there are no notes', () => {
    expect(chatSystemPrompt(['Journal'], '   ')).not.toContain('user_notes');
  });
});
