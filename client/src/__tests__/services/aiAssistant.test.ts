import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  parseCalories,
  hasCredentials,
  isAiReady,
  setAiConfig,
  clearAiConfig,
  autoCaloriesOnSave,
  estimateEntryCalories,
  autoNutritionOnSave,
  parseNutrients,
  DEFAULT_AI_CONFIG,
  type AiConfig,
} from '../../services/aiAssistant.js';

const openai: AiConfig = { ...DEFAULT_AI_CONFIG, enabled: true, provider: 'openai', model: 'gpt-5-mini', apiKey: 'sk-test' };

/** Mock the OpenAI endpoint to answer with the given calories; returns the fetch spy. */
function mockOpenAI(calories: number) {
  return mockOpenAIJson({ calories });
}

/** Mock the OpenAI endpoint to answer with a JSON object (fresh Response per call). */
function mockOpenAIJson(payload: Record<string, number>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  ));
}

const FULL = { calories: 250, iron: 1.5, vitaminD: 0.4, vitaminB12: 0.9, vitaminC: 12 };

function promptOf(spy: ReturnType<typeof mockOpenAIJson>, call = 0): string {
  return JSON.parse(String(spy.mock.calls[call][1]?.body)).messages[1].content as string;
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

  it('fills every blank nutrient on a food entry', async () => {
    setAiConfig(openai, null);
    mockOpenAIJson(FULL);
    const out = await autoCaloriesOnSave('food', 'Toast with jam', { mealType: 'breakfast', calories: '' });
    expect(out).toMatchObject({ calories: '250', iron: '1.5', vitaminD: '0.4', vitaminB12: '0.9', vitaminC: '12' });
    expect(out?.nutrientSource).toEqual({ calories: 'ai', iron: 'ai', vitaminD: 'ai', vitaminB12: 'ai', vitaminC: 'ai' });
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

describe('food nutrition', () => {
  it('asks only for missing nutrients and keeps typed calories', async () => {
    setAiConfig(openai, null);
    const spy = mockOpenAIJson({ iron: 0.5, vitaminD: 0, vitaminB12: 0, vitaminC: 120 });
    const out = await autoNutritionOnSave('Orange juice, 1 cup', { calories: '112', caloriesSource: 'manual' });
    expect(promptOf(spy)).toContain('iron (mg), vitaminD (mcg), vitaminB12 (mcg), vitaminC (mg)');
    expect(promptOf(spy)).not.toContain('calories (kcal)');
    expect(out).toMatchObject({ calories: '112', caloriesSource: 'manual', iron: '0.5', vitaminC: '120' });
  });

  it('does nothing when every nutrient is filled by hand', async () => {
    setAiConfig(openai, null);
    const spy = mockOpenAIJson(FULL);
    const cf = { calories: '1', iron: '1', vitaminD: '1', vitaminB12: '1', vitaminC: '1',
      nutrientSource: { calories: 'manual', iron: 'manual', vitaminD: 'manual', vitaminB12: 'manual', vitaminC: 'manual' } };
    expect(await autoNutritionOnSave('Toast', cf)).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('refreshes AI values when the description changes, never typed ones', async () => {
    setAiConfig(openai, null);
    mockOpenAIJson(FULL);
    const first = (await autoNutritionOnSave('Toast', { mealDescription: 'Toast' }))!;
    const edited = { ...first, iron: '9', nutrientSource: { ...(first.nutrientSource as object), iron: 'manual' } };
    const unchanged = mockOpenAIJson(FULL);
    expect(await autoNutritionOnSave('Toast', edited)).toBeNull();
    expect(unchanged).not.toHaveBeenCalled();
    const spy = mockOpenAIJson({ calories: 400, vitaminD: 1, vitaminB12: 1, vitaminC: 1 });
    const out = await autoNutritionOnSave('Toast with butter', { ...edited, mealDescription: 'Toast with butter' });
    expect(promptOf(spy)).not.toContain('iron (mg)');
    expect(out).toMatchObject({ calories: '400', iron: '9' });
  });

  it('rejects replies missing a requested nutrient', () => {
    expect(() => parseNutrients('{"calories": 100}', ['calories', 'iron'])).toThrow(/iron/);
    expect(parseNutrients('```json\n{"calories": 99.6, "vitaminB12": 0.234}\n```', ['calories', 'vitaminB12']))
      .toEqual({ calories: 100, vitaminB12: 0.23 });
  });
});
