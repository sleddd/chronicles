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
import { setEgressAccount, recordAiChoice } from '../../services/deviceConsent.js';
import { isAiOnButNotHere, loadAiConfig, encryptAiConfig, chatReply } from '../../services/aiAssistant.js';
import { encryptBytes as rawEncryptBytes, decryptBytes as rawDecryptBytes, generateMasterKey } from '@shared/crypto/primitives.js';
import { SETTING_REVS_STORE } from '../../services/settingCipher.js';
import { beforeEach } from 'vitest';
import { loadAiPrivacy } from '../../services/aiPrivacy.js';

// An entry of a topic that isn't kept from AI (the choices are read in beforeEach: until then everything counts as hidden)
const META = { _taxonomyId: 1 };

// AI is used only where this browser turned it on (deviceConsent.ts)
beforeEach(() => {
  loadAiPrivacy(undefined, {}, false);
  localStorage.clear();
  setEgressAccount('tag-a');
  recordAiChoice(true);
});

const openai: AiConfig = { ...DEFAULT_AI_CONFIG, enabled: true, provider: 'openai', model: 'gpt-5-mini', apiKey: 'sk-test' };

/** Mock the OpenAI endpoint to answer with the given calories; returns the fetch spy. */
function mockOpenAI(calories: number) {
  return mockOpenAIJson({ calories });
}

/** Mock the OpenAI endpoint to answer with a JSON object (fresh Response per call). */
function mockOpenAIJson(payload: Record<string, number>) {
  // Spying again on fetch hands back the same spy, calls and all: start its count afresh
  const spy = vi.spyOn(globalThis, 'fetch');
  spy.mockClear();
  return spy.mockImplementation(async () => new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  ));
}

const FULL = { calories: 250, protein: 4, carbs: 30, fat: 9, iron: 1.5, vitaminD: 0.4, vitaminB12: 0.9, vitaminC: 12 };

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
    expect(hasCredentials(bedrock)).toBe(false); // access keys by default
    expect(hasCredentials({ ...bedrock, bedrockAuth: 'apiKey', bedrockApiKey: 'k' })).toBe(true);
    expect(hasCredentials({ ...bedrock, bedrockAuth: 'iam', awsAccessKeyId: 'AKIA' })).toBe(false);
    expect(hasCredentials({ ...bedrock, bedrockAuth: 'iam', awsAccessKeyId: 'AKIA', awsSecretAccessKey: 's' })).toBe(true);
    expect(hasCredentials({ ...bedrock, awsAccessKeyId: 'AKIA', awsSecretAccessKey: 's', bedrockRegion: '' })).toBe(false);
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
    expect(await autoCaloriesOnSave('food', 'Toast', { calories: '' }, META)).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fills every blank nutrient on a food entry', async () => {
    setAiConfig(openai, null);
    mockOpenAIJson(FULL);
    const out = await autoCaloriesOnSave('food', 'Toast with jam', { mealType: 'breakfast', calories: '' }, META);
    expect(out).toMatchObject({ calories: '250', protein: '4', carbs: '30', fat: '9', iron: '1.5', vitaminD: '0.4', vitaminB12: '0.9', vitaminC: '12' });
    expect(out?.nutrientSource).toEqual({ calories: 'ai', protein: 'ai', carbs: 'ai', fat: 'ai', iron: 'ai', vitaminD: 'ai', vitaminB12: 'ai', vitaminC: 'ai' });
  });

  it('refreshes an AI estimate only when its inputs changed', async () => {
    setAiConfig(openai, null);
    mockOpenAI(300);
    const first = await estimateEntryCalories('exercise', '', { exerciseType: 'running', duration: '30' });
    const fetchSpy = mockOpenAI(450);
    expect(await autoCaloriesOnSave('exercise', '', first, META)).toBeNull();
    const changed = await autoCaloriesOnSave('exercise', '', { ...first, duration: '45' }, META);
    expect(changed?.calories).toBe('450');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('skips exercise with no duration or distance', async () => {
    setAiConfig(openai, null);
    const fetchSpy = mockOpenAI(100);
    expect(await autoCaloriesOnSave('exercise', 'Stretching', { calories: '' }, META)).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('food nutrition', () => {
  it('asks only for missing nutrients and keeps typed calories', async () => {
    setAiConfig(openai, null);
    const spy = mockOpenAIJson({ protein: 1.7, carbs: 26, fat: 0.5, iron: 0.5, vitaminD: 0, vitaminB12: 0, vitaminC: 120 });
    const out = await autoNutritionOnSave('Orange juice, 1 cup', { calories: '112', caloriesSource: 'manual' }, META);
    expect(promptOf(spy)).toContain('protein (g), carbs (g), fat (g), iron (mg), vitaminD (mcg), vitaminB12 (mcg), vitaminC (mg)');
    expect(promptOf(spy)).not.toContain('calories (kcal)');
    expect(out).toMatchObject({ calories: '112', caloriesSource: 'manual', iron: '0.5', vitaminC: '120' });
  });

  it('does nothing when every nutrient is filled by hand', async () => {
    setAiConfig(openai, null);
    const spy = mockOpenAIJson(FULL);
    const cf = { calories: '1', protein: '1', carbs: '1', fat: '1', iron: '1', vitaminD: '1', vitaminB12: '1', vitaminC: '1',
      nutrientSource: { calories: 'manual', protein: 'manual', carbs: 'manual', fat: 'manual', iron: 'manual', vitaminD: 'manual', vitaminB12: 'manual', vitaminC: 'manual' } };
    expect(await autoNutritionOnSave('Toast', cf, META)).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('refreshes AI values when the description changes, never typed ones', async () => {
    setAiConfig(openai, null);
    mockOpenAIJson(FULL);
    const first = (await autoNutritionOnSave('Toast', { mealDescription: 'Toast' }, META))!;
    const edited = { ...first, iron: '9', nutrientSource: { ...(first.nutrientSource as object), iron: 'manual' } };
    const unchanged = mockOpenAIJson(FULL);
    expect(await autoNutritionOnSave('Toast', edited, META)).toBeNull();
    expect(unchanged).not.toHaveBeenCalled();
    const spy = mockOpenAIJson({ calories: 400, protein: 5, carbs: 40, fat: 20, vitaminD: 1, vitaminB12: 1, vitaminC: 1 });
    const out = await autoNutritionOnSave('Toast with butter', { ...edited, mealDescription: 'Toast with butter' }, META);
    expect(promptOf(spy)).not.toContain('iron (mg)');
    expect(out).toMatchObject({ calories: '400', iron: '9' });
  });

  it('rejects replies missing a requested nutrient', () => {
    expect(() => parseNutrients('{"calories": 100}', ['calories', 'iron'])).toThrow(/iron/);
    expect(parseNutrients('```json\n{"calories": 99.6, "vitaminB12": 0.234}\n```', ['calories', 'vitaminB12']))
      .toEqual({ calories: 100, vitaminB12: 0.23 });
  });
});

describe('AI is used only where this browser turned it on (a sealed config can be replayed)', () => {
  async function sealedConfig(cfg: AiConfig) {
    const key = await generateMasterKey();
    const encrypted = await encryptAiConfig(cfg, (d, aad) => rawEncryptBytes(key, d, aad));
    return { encrypted, decrypt: (ct: ArrayBuffer, iv: string, aad?: string) => rawDecryptBytes(key, ct, iv, aad) };
  }

  it('a config opened on a browser that never chose AI sends nothing', async () => {
    localStorage.clear();
    setEgressAccount('tag-b');
    const { encrypted, decrypt } = await sealedConfig(openai);
    localStorage.removeItem(SETTING_REVS_STORE); // the seal noted nothing seen: a fresh browser
    await loadAiConfig(encrypted, decrypt);
    const spy = mockOpenAI(100);
    expect(isAiReady()).toBe(false);
    expect(isAiOnButNotHere()).toBe(true);
    expect(await autoCaloriesOnSave('food', 'An apple', {}, META)).toBeNull();
    expect(await autoNutritionOnSave('An apple', {}, META)).toBeNull();
    await expect(chatReply('sys', [{ role: 'user', content: 'hi' }])).rejects.toThrow(/this browser/);
    expect(spy).not.toHaveBeenCalled();
  });

  it('a browser that had already seen a revision of the config before the upgrade counts as having chosen, once', async () => {
    localStorage.clear();
    setEgressAccount('tag-c');
    const { encrypted, decrypt } = await sealedConfig(openai);
    localStorage.setItem(SETTING_REVS_STORE, JSON.stringify({ 'tag-c|aiConfig': 1 }));
    await loadAiConfig(encrypted, decrypt);
    expect(isAiReady()).toBe(true);
  });

  it('a read that finds AI off or missing ends this browser’s choice, so a replayed config later finds none', async () => {
    localStorage.clear();
    setEgressAccount('tag-d');
    const { encrypted, decrypt } = await sealedConfig({ ...openai, enabled: false });
    await loadAiConfig(encrypted, decrypt);
    // recorded a moment ago (just turned on): kept through a read answered before its save landed
    recordAiChoice(true);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 120_000);
    await loadAiConfig(undefined, decrypt);
    vi.restoreAllMocks();
    const on = await sealedConfig(openai);
    await loadAiConfig(on.encrypted, on.decrypt);
    expect(isAiReady()).toBe(false);
  });
});
