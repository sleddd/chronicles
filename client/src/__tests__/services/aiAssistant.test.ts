import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  parseCalories,
  hasCredentials,
  isAiReady,
  setAiConfig,
  clearAiConfig,
  autoCaloriesOnSave,
  estimateEntryCalories,
  DEFAULT_AI_CONFIG,
  type AiConfig,
} from '../../services/aiAssistant.js';

const openai: AiConfig = { ...DEFAULT_AI_CONFIG, enabled: true, provider: 'openai', model: 'gpt-5-mini', apiKey: 'sk-test' };

/** Mock the OpenAI endpoint to answer with the given calories; returns the fetch spy. */
function mockOpenAI(calories: number) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
    JSON.stringify({ choices: [{ message: { content: `{"calories": ${calories}}` } }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  ));
}

afterEach(() => {
  vi.restoreAllMocks();
  setAiConfig(null, null);
});

describe('parseCalories', () => {
  it('reads the JSON reply', () => {
    expect(parseCalories('{"calories": 420}')).toBe(420);
  });

  it('finds JSON wrapped in prose or code fences', () => {
    expect(parseCalories('Sure!\n```json\n{"calories": 95.4}\n```')).toBe(95);
  });

  it('falls back to a bare number', () => {
    expect(parseCalories('About 310 kcal')).toBe(310);
  });

  it('rejects replies without a usable number', () => {
    expect(() => parseCalories('I cannot tell')).toThrow();
    expect(() => parseCalories('{"calories": -5}')).toThrow();
  });
});

describe('hasCredentials / isAiReady', () => {
  it('needs an API key for Claude and OpenAI', () => {
    expect(hasCredentials({ ...openai, apiKey: '' })).toBe(false);
    expect(hasCredentials(openai)).toBe(true);
  });

  it('needs region plus the chosen Bedrock credentials', () => {
    const bedrock: AiConfig = { ...DEFAULT_AI_CONFIG, provider: 'bedrock', model: 'anthropic.claude-opus-5-5' };
    expect(hasCredentials({ ...bedrock, bedrockApiKey: 'k' })).toBe(true);
    expect(hasCredentials({ ...bedrock, bedrockAuth: 'iam', awsAccessKeyId: 'AKIA' })).toBe(false);
    expect(hasCredentials({ ...bedrock, bedrockAuth: 'iam', awsAccessKeyId: 'AKIA', awsSecretAccessKey: 's' })).toBe(true);
    expect(hasCredentials({ ...bedrock, bedrockApiKey: 'k', bedrockRegion: '' })).toBe(false);
  });

  it('is off when disabled, unconfigured, or locked', () => {
    setAiConfig({ ...openai, enabled: false }, null);
    expect(isAiReady()).toBe(false);
    setAiConfig(openai, null);
    expect(isAiReady()).toBe(true);
    clearAiConfig();
    expect(isAiReady()).toBe(false);
  });
});

describe('estimateEntryCalories', () => {
  it('sends exercise details and body weight, and marks the result as AI', async () => {
    setAiConfig({ ...openai, bodyWeight: '160', weightUnit: 'lb' }, null);
    const fetchSpy = mockOpenAI(330);
    const out = await estimateEntryCalories('exercise', 'Morning run', {
      exerciseType: 'running', duration: '30', distance: '3', distanceUnit: 'miles', intensity: 'medium',
    });
    expect(out.calories).toBe('330');
    expect(out.caloriesSource).toBe('ai');
    const sent = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
    const prompt = sent.messages[1].content as string;
    expect(prompt).toContain('Duration: 30 minutes');
    expect(prompt).toContain('Distance: 3 miles');
    expect(prompt).toContain('Body weight: 160 lb');
  });
});

describe('autoCaloriesOnSave', () => {
  it('does nothing when AI is off', async () => {
    const fetchSpy = mockOpenAI(100);
    expect(await autoCaloriesOnSave('food', 'Toast', { calories: '' })).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fills blank calories', async () => {
    setAiConfig(openai, null);
    mockOpenAI(250);
    const out = await autoCaloriesOnSave('food', 'Toast with jam', { mealType: 'breakfast', calories: '' });
    expect(out?.calories).toBe('250');
  });

  it('never overwrites calories the user typed', async () => {
    setAiConfig(openai, null);
    const fetchSpy = mockOpenAI(250);
    expect(await autoCaloriesOnSave('food', 'Toast', { calories: '180', caloriesSource: 'manual' })).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refreshes an AI estimate only when its inputs changed', async () => {
    setAiConfig(openai, null);
    mockOpenAI(300);
    const first = await estimateEntryCalories('exercise', '', { exerciseType: 'running', duration: '30' });
    const fetchSpy = mockOpenAI(450);
    expect(await autoCaloriesOnSave('exercise', '', first)).toBeNull();
    const changed = await autoCaloriesOnSave('exercise', '', { ...first, duration: '45' });
    expect(changed?.calories).toBe('450');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('skips exercise with no duration or distance', async () => {
    setAiConfig(openai, null);
    const fetchSpy = mockOpenAI(100);
    expect(await autoCaloriesOnSave('exercise', 'Stretching', { calories: '' })).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
