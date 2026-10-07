import { describe, it, expect } from 'vitest';
import { parseSaveCommand, textToEntryHtml, chatSystemPrompt } from '../../utils/chatSave.js';

const topics = [
  { id: 1, name: 'Journal' },
  { id: 2, name: 'Shopping List' },
  { id: 3, name: 'Shopping' },
  { id: 4, name: 'Meals' },
];

describe('parseSaveCommand', () => {
  it('ignores ordinary messages', () => {
    expect(parseSaveCommand('how do I save money?', topics)).toEqual({ kind: 'none' });
    expect(parseSaveCommand('/saved it', topics)).toEqual({ kind: 'none' });
  });

  it('shows help for a bare /save', () => {
    expect(parseSaveCommand('  /save ', topics)).toEqual({ kind: 'help' });
  });

  it('matches topics case-insensitively, longest name first', () => {
    expect(parseSaveCommand('/save shopping list Eggs, milk', topics))
      .toEqual({ kind: 'save', topic: topics[1], text: 'Eggs, milk' });
    expect(parseSaveCommand('/SAVE Shopping Eggs', topics))
      .toEqual({ kind: 'save', topic: topics[2], text: 'Eggs' });
  });

  it('needs a whole-word topic and some text', () => {
    expect(parseSaveCommand('/save Mealsy salad', topics)).toEqual({ kind: 'noTopic', attempted: 'Mealsy' });
    expect(parseSaveCommand('/save Meals', topics)).toEqual({ kind: 'noText', topic: topics[3] });
  });

  it('keeps multi-line text', () => {
    const cmd = parseSaveCommand('/save Journal Line one\nLine two', topics);
    expect(cmd).toEqual({ kind: 'save', topic: topics[0], text: 'Line one\nLine two' });
  });
});

describe('textToEntryHtml', () => {
  it('escapes HTML and keeps paragraphs and line breaks', () => {
    expect(textToEntryHtml('a <b>\nnext\n\nsecond')).toBe('<p>a &lt;b&gt;<br>next</p><p>second</p>');
  });
});

describe('chatSystemPrompt', () => {
  it('lists the user\'s topics for /save suggestions', () => {
    expect(chatSystemPrompt(['Journal', 'Meals'])).toContain('Journal, Meals');
  });
});
