import { describe, it, expect } from 'vitest';
import { firstRun, gettingStarted, showChecklist, toggleTicked } from '@/utils/onboarding';

describe('onboarding', () => {
  it('starts the tour for a new account, and quietly skips an existing one', () => {
    expect(firstRun(null, 0)).toBe('tour');
    expect(firstRun(null, 12)).toBe('existing');
    expect(firstRun({ tourDone: true }, 0)).toBeNull();
  });

  it('ticks nothing for the person: every item starts open, with a line on how to do it', () => {
    const items = gettingStarted({ state: {}, voiceSupported: true });
    expect(items.map(i => i.key)).toEqual(['name', 'city', 'entry', 'health', 'voice', 'recovery']);
    expect(items.every(i => !i.done)).toBe(true);
    expect(items.find(i => i.key === 'entry')!.how).toMatch(/Pick a topic in Quick entry/);
    expect(items.every(i => i.how && !i.how.includes(';'))).toBe(true);
    expect(gettingStarted({ state: {}, voiceSupported: false }).map(i => i.key)).not.toContain('voice');
  });

  it('ticking one item ticks only that one (the last one too)', () => {
    const ticked = toggleTicked({}, 'recovery');
    const items = gettingStarted({ state: { ticked }, voiceSupported: true });
    expect(items.filter(i => i.done).map(i => i.key)).toEqual(['recovery']);
    expect(toggleTicked({ ticked }, 'recovery')).toEqual([]);
  });

  it('shows the checklist after the tour, until it\'s closed (even all ticked)', () => {
    expect(showChecklist(null)).toBe(false);
    expect(showChecklist({})).toBe(false);
    expect(showChecklist({ tourDone: true })).toBe(true);
    expect(showChecklist({ tourDone: true, ticked: ['name', 'city', 'entry', 'health', 'voice', 'recovery'] })).toBe(true);
    expect(showChecklist({ tourDone: true, checklistDismissed: true })).toBe(false);
  });
});
