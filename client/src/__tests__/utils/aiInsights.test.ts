import { describe, it, expect } from 'vitest';
import { buildInsightsRequest, insightsText, parseInsights } from '@/utils/aiInsights';

const entry = (id: number, day: string, text: string) => ({ id, day, title: text.slice(0, 20), text });

describe('buildInsightsRequest', () => {
  it('sends only entries in the period, newest first', () => {
    const req = buildInsightsRequest([
      entry(1, '2026-11-01', 'Too old to send'),
      entry(2, '2026-11-14', 'A slow Saturday'),
      entry(3, '2026-11-18', 'Walked by the river'),
      entry(4, '2026-11-17', '   '),
    ], 7, '2026-11-19', '2026-11-13');
    expect(req.count).toBe(2);
    expect(req.prompt).not.toContain('Too old');
    expect(req.prompt.indexOf('river')).toBeLessThan(req.prompt.indexOf('Saturday'));
    expect(req.shared).toEqual([{ label: '2 journal entries, 2026-11-14 to 2026-11-18', items: ['2026-11-18 · Walked by the river', '2026-11-14 · A slow Saturday'] }]);
  });

  it('cuts a long entry and leaves older ones out once the request is full', () => {
    const long = 'word '.repeat(2000);
    const req = buildInsightsRequest(Array.from({ length: 30 }, (_, i) => entry(i + 1, '2026-11-18', long)), 7, '2026-11-19', '2026-11-13');
    expect(req.count).toBe(16);
    expect(req.leftOut).toBe(14);
    expect(req.digest.length).toBeLessThan(25_000);
  });

  it('writes under the safe rules when the writing itself shows risk', () => {
    const calm = buildInsightsRequest([entry(1, '2026-11-18', 'A good day')], 7, '2026-11-19', '2026-11-13');
    const risk = buildInsightsRequest([entry(1, '2026-11-18', 'I want to kill myself')], 7, '2026-11-19', '2026-11-13');
    expect(calm.risk.rating).toBe('none');
    expect(calm.system).not.toContain('SAFETY MODE');
    expect(risk.risk.rating).not.toBe('none');
    expect(risk.system).toContain('SAFETY MODE');
  });
});

describe('parseInsights', () => {
  it('reads the reflection, prompts and suggestions as plain text, capped at three each', () => {
    const r = parseInsights('{"reflection":"You keep coming back to rest.","prompts":["One?","Two?","Three?","Four?"],"chatSuggestions":["Help me plan rest", 5]}');
    expect(r).toEqual({ reflection: 'You keep coming back to rest.', prompts: ['One?', 'Two?', 'Three?'], chatSuggestions: ['Help me plan rest'] });
    expect(insightsText(r)).toContain('Help me plan rest');
  });

  it('throws when there is no reflection', () => {
    expect(() => parseInsights('{"prompts":["One?"]}')).toThrow(/didn’t return a reflection/);
    expect(() => parseInsights('Sorry.')).toThrow();
  });
});
