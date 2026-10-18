import { describe, it, expect } from 'vitest';
import {
  replyNeedsReview, patternScreen, replyPatternScreen, parseClassification, parseReplyClassification, maxRisk,
  classifierTranscript, NO_RISK,
} from '@/utils/chatSafety';
import { chatSystemPrompt } from '@/utils/chatSave';

describe('patternScreen', () => {
  const cases: [string, string, string | null][] = [
    ['I wish I didn’t wake up tomorrow', 'concern', 'suicide'],
    ['Everyone would be better off without me', 'concern', 'suicide'],
    ['I want to kill myself', 'elevated', 'suicide'],
    ['Sometimes I think I should just kill myself', 'elevated', 'suicide'],
    ['I’ve been feeling suicidal lately', 'elevated', 'suicide'],
    ['I’m going to kill myself tonight', 'urgent', 'suicide'],
    ['I tried to end my life last week', 'urgent', 'suicide'],
    ['How many pills would be lethal', 'urgent', 'suicide'],
    ['I keep wanting to hurt myself', 'elevated', 'self_harm'],
    ['I’ve been self-harming again', 'elevated', 'self_harm'],
    ['how deep should i cut', 'urgent', 'self_harm'],
    ['I made myself throw up after dinner', 'elevated', 'eating_disorder'],
    ['I haven’t eaten in three days', 'elevated', 'eating_disorder'],
    ['I’m scared to eat anything', 'concern', 'eating_disorder'],
  ];
  it.each(cases)('%s → %s', (text, rating, kind) => {
    expect(patternScreen(text)).toEqual({ rating, kind });
  });

  it.each([
    'This movie killed me, so funny',
    'I cut myself chopping onions',
    'Traffic is killing me today',
    'I’m dying to see that show',
    'What should I eat for dinner?',
    'I read a book about suicide prevention',
  ])('no risk: %s', text => {
    expect(patternScreen(text)).toEqual(NO_RISK);
  });

  it('takes the most serious match', () => {
    expect(patternScreen('I wish I was dead and I want to kill myself').rating).toBe('elevated');
  });
});

describe('replyPatternScreen', () => {
  it('flags method information and encouragement', () => {
    expect(replyPatternScreen('A lethal dose of that is about 10 grams.')).toBe('suicide');
    expect(replyPatternScreen('Here is how to hide your cuts from family.')).toBe('self_harm');
    expect(replyPatternScreen('Try to eat under 500 calories a day.')).toBe('eating_disorder');
  });
  it('lets supportive replies through', () => {
    expect(replyPatternScreen('I’m really glad you told me. You can call or text 988 any time.')).toBeNull();
  });
});

describe('replyNeedsReview', () => {
  it('reviews only replies that touch the topics', () => {
    expect(replyNeedsReview('Here is a pasta recipe.')).toBe(false);
    expect(replyNeedsReview('Purging can be very dangerous.')).toBe(true);
  });
});

describe('parseClassification', () => {
  it('reads a rating and kind', () => {
    expect(parseClassification('{"rating":"elevated","kind":"self_harm"}')).toEqual({ rating: 'elevated', kind: 'self_harm' });
    expect(parseClassification('Sure: {"rating": "URGENT", "kind": "suicide"}')).toEqual({ rating: 'urgent', kind: 'suicide' });
  });
  it('treats none, junk and unknown ratings as no risk', () => {
    expect(parseClassification('{"rating":"none","kind":null}')).toEqual(NO_RISK);
    expect(parseClassification('not json')).toEqual(NO_RISK);
    expect(parseClassification('{"rating":"high"}')).toEqual(NO_RISK);
  });
  it('keeps an unknown kind as null rather than guessing', () => {
    expect(parseClassification('{"rating":"concern","kind":"other"}')).toEqual({ rating: 'concern', kind: null });
  });
});

describe('parseReplyClassification', () => {
  it('returns the kind only when harmful', () => {
    expect(parseReplyClassification('{"harmful":true,"kind":"eating_disorder"}')).toBe('eating_disorder');
    expect(parseReplyClassification('{"harmful":false,"kind":null}')).toBeNull();
    expect(parseReplyClassification('???')).toBeNull();
  });
});

describe('maxRisk + transcript + safe mode', () => {
  it('keeps the more serious rating', () => {
    expect(maxRisk({ rating: 'concern', kind: 'suicide' }, { rating: 'urgent', kind: 'self_harm' })).toEqual({ rating: 'urgent', kind: 'self_harm' });
    expect(maxRisk({ rating: 'elevated', kind: 'suicide' }, NO_RISK).rating).toBe('elevated');
  });
  it('marks the latest user message and keeps the last six turns', () => {
    const turns = Array.from({ length: 8 }, (_, i) => ({ role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant', content: `m${i}` }));
    turns.push({ role: 'user', content: 'latest' });
    const t = classifierTranscript(turns);
    expect(t).toContain('USER (latest — rate this): latest');
    expect(t).not.toContain('m2');
  });
  it('adds the safe conversation rules only in safe mode', () => {
    expect(chatSystemPrompt(['Journal'])).not.toContain('SAFETY MODE');
    expect(chatSystemPrompt(['Journal'], '', true)).toContain('SAFETY MODE');
  });
  it('adds the eating rules only in safe mode with eating risk', () => {
    expect(chatSystemPrompt(['Journal'], '', false, true)).not.toContain('calorie counts');
    expect(chatSystemPrompt(['Journal'], '', true, true)).toContain('calorie counts');
  });
  it('never tells the AI to turn someone away, and never to be a companion', () => {
    const p = chatSystemPrompt(['Journal']);
    expect(p).not.toContain('might not be the best place');
    expect(p).toContain('never end or refuse the conversation');
    expect(p).toContain('do not call yourself their friend');
  });
});
