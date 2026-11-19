import { describe, it, expect, beforeEach } from 'vitest';
import { setEgressAccount, recordPublicShelfChoice, publicShelfOnHere, publicShelfTurnedOffHere } from '@/services/deviceConsent';

describe('the public shelf’s per-browser record', () => {
  beforeEach(() => { localStorage.clear(); setEgressAccount('tag-a'); });

  it('Turn off leaves a mark that only Turn on clears', () => {
    expect(publicShelfTurnedOffHere()).toBe(false);
    recordPublicShelfChoice(true);
    expect(publicShelfOnHere()).toBe(true);
    recordPublicShelfChoice(false);
    expect(publicShelfOnHere()).toBe(false);
    expect(publicShelfTurnedOffHere()).toBe(true);
    recordPublicShelfChoice(true);
    expect(publicShelfTurnedOffHere()).toBe(false);
  });

  it('is kept per account', () => {
    recordPublicShelfChoice(false);
    setEgressAccount('tag-b');
    expect(publicShelfTurnedOffHere()).toBe(false);
  });
});
