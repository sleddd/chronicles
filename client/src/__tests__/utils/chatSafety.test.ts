import { describe, it, expect } from 'vitest';
import {
  minorPattern, replyNeedsReview, patternScreen, replyPatternScreen, parseClassification, parseReplyClassification, maxRisk,
  classifierTranscript, NO_RISK, riskClassifierPrompt, SAFE_CONVERSATION_RULES,
} from '@/utils/chatSafety';
import { chatSystemPrompt, stripMinorTag, MINOR_TAG } from '@/utils/chatSave';

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
    ['I’m terrified of gaining weight', 'concern', 'eating_disorder'],
    ['I’m scared to eat because I’ll get fat', 'concern', 'eating_disorder'],
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
    // A bad food day or a hard day is not a risk sign
    'Bad food day, I ate so much junk',
    'I felt so guilty after eating that whole pizza',
    'I hate myself for eating all those cookies lol',
    'Ugh, I feel disgusting after eating so much at the party',
    'Today was a really hard day',
    'I had a terrible day and stress ate everything',
    // Comfort food and eating to cope are ordinary
    'I am eating ice cream',
    'I have an ice cream craving and it is my coping mechanism, so I won’t give it up',
    'Rough week, I just want chocolate and to watch TV',
    // Fear of eating for allergy or medical reasons is not an eating disorder
    'I’m scared to eat anything',
    'I’m afraid to eat out with my peanut allergy',
    'Since the surgery I’m scared to eat solid food',
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

describe('minorPattern', () => {
  it.each([
    'No. I am eight',
    'I’m 12 years old',
    'i am 15 and i hate school',
    'I\'m in 4th grade',
    'im in fifth grade',
    'I am only ten.',
  ])('catches: %s', t => expect(minorPattern(t)).toBe(true));

  it.each([
    'I’m 5 minutes away',
    'I’m five foot two',
    'I’m eight episodes in',
    'I’m 34 years old',
    'I am 18',
    'I teach 3rd grade',
    'My son is 9 years old',
    'I’m one of those people',
    'When I was 12 I loved horses',
  ])('ignores: %s', t => expect(minorPattern(t)).toBe(false));
});

describe('minor flag and tag', () => {
  it('reads "minor" from the classifier, with or without a risk', () => {
    expect(parseClassification('{"rating":"none","kind":null,"minor":true}')).toEqual({ rating: 'none', kind: null, minor: true });
    expect(parseClassification('{"rating":"concern","kind":"self_harm","minor":true}')).toEqual({ rating: 'concern', kind: 'self_harm', minor: true });
    expect(parseClassification('{"rating":"none","kind":null,"minor":false}')).toEqual(NO_RISK);
  });
  it('strips the model\'s tag', () => {
    expect(stripMinorTag(`${MINOR_TAG}\nThank you for telling me.`)).toEqual({ text: 'Thank you for telling me.', tagged: true });
    expect(stripMinorTag('Hello')).toEqual({ text: 'Hello', tagged: false });
  });
  it('always includes the age rules, with the one exception in the persona', () => {
    const p = chatSystemPrompt(['Journal']);
    expect(p).toContain('Chronicles is for adults 18 and older');
    expect(p).toContain('The one exception is someone under 18');
    expect(p).toContain('Childhelp at 1-800-422-4453');
  });
});

describe('riskClassifierPrompt', () => {
  it('tells the classifier that everyday food talk and hard days are not risk signs', () => {
    const p = riskClassifierPrompt();
    expect(p).toMatch(/bad food day/);
    expect(p).toMatch(/food allergies, intolerances/);
    expect(p).toMatch(/regret or guilt about a meal/);
    expect(p).toMatch(/A hard or bad day[^.]*is "none"/);
    expect(p).toMatch(/Everyday venting and food talk are not borderline/);
    expect(p).not.toMatch(/guilt after eating or body weight preoccupation → "concern"/);
    expect(p).toMatch(/cravings, treats, eating something to cope/);
    expect(p).toMatch(/coping mechanism, or saying they won't give it up/);
    expect(p).toMatch(/Mentioning something negative is not a risk sign/);
  });

  it('the chat itself keeps crisis lines for real risk, not an ordinary bad day', () => {
    const p = chatSystemPrompt(['Journal']);
    expect(p).toMatch(/do not mention hotlines, crisis lines, 988/);
    expect(p).toMatch(/if they say a food or habit helps them cope, do not lecture them/);
    expect(p).toMatch(/Bring up crisis help only for a real sign/);
    expect(SAFE_CONVERSATION_RULES).toMatch(/do not repeat them in every reply/);
  });
});
