import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setEgressAccount, recordAiFeatureChoice, aiFeatureChosenHere, reconcileAiFeature, EGRESS_STORE } from '@/services/deviceConsent';
import { AI_SHARING_CONSENT_VERSION } from '@/utils/chatDisclosure';

describe('AI sharing features: this browser’s agreement', () => {
  beforeEach(() => { localStorage.clear(); setEgressAccount('tag-a'); });
  afterEach(() => { vi.useRealTimers(); });

  it('is off until agreed to, per feature', () => {
    expect(aiFeatureChosenHere('aiPlan')).toBe(false);
    recordAiFeatureChoice('aiPlan', true);
    expect(aiFeatureChosenHere('aiPlan')).toBe(true);
    expect(aiFeatureChosenHere('aiInsights')).toBe(false);
    recordAiFeatureChoice('aiPlan', false);
    expect(aiFeatureChosenHere('aiPlan')).toBe(false);
  });

  it('is kept per account, and nothing counts with no account', () => {
    recordAiFeatureChoice('aiInsights', true);
    setEgressAccount('tag-b');
    expect(aiFeatureChosenHere('aiInsights')).toBe(false);
    setEgressAccount(null);
    expect(aiFeatureChosenHere('aiInsights')).toBe(false);
  });

  it('names the wording agreed to, so an agreement to older wording doesn’t count', () => {
    localStorage.setItem(EGRESS_STORE, JSON.stringify({ [`tag-a|aiPlan:v${AI_SHARING_CONSENT_VERSION - 1}`]: true }));
    expect(aiFeatureChosenHere('aiPlan')).toBe(false);
    recordAiFeatureChoice('aiPlan', true);
    expect(Object.keys(JSON.parse(localStorage.getItem(EGRESS_STORE)!))).toContain(`tag-a|aiPlan:v${AI_SHARING_CONSENT_VERSION}`);
  });

  it('a config read with the feature off ends the agreement (not one given a moment ago)', () => {
    recordAiFeatureChoice('aiPlan', true);
    reconcileAiFeature('aiPlan', false);
    expect(aiFeatureChosenHere('aiPlan')).toBe(true); // just turned on: its save may still be on its way
    // Two minutes on, the same read does end it
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 120_000);
    reconcileAiFeature('aiPlan', false);
    expect(aiFeatureChosenHere('aiPlan')).toBe(false);
  });
});
