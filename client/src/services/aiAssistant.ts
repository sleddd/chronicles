/**
 * Bring-your-own AI assistant — fully client-side, like entry images.
 * The user's provider credentials are encrypted with the master key and stored
 * as the `aiConfig` setting (ciphertext the server cannot read). After unlock
 * they are decrypted into module memory and requests go straight from the
 * browser to the chosen provider; the Chronicles server never sees the key,
 * the prompt, or the answer.
 *
 * Used today for calorie estimates on food and exercise entries.
 */

import { arrayBufferToBase64, base64ToArrayBuffer } from '@shared/crypto/encoding.js';
import {
  bedrockConverse,
  fallbackBedrockModels,
  listBedrockTextModels,
  type BedrockAuth,
  type BedrockCredentials,
  type BedrockModelOption,
} from './bedrock.js';
import { NUTRIENTS, NUTRIENT_KEYS, nutrientSourceOf, type NutrientKey, type NutrientSource } from '../types/nutrition.js';

export type { BedrockAuth, BedrockModelOption };
export type AiProvider = 'anthropic' | 'bedrock' | 'openai';

export interface AiConfig {
  enabled: boolean;
  provider: AiProvider;
  model: string;
  /** Claude API key or OpenAI API key */
  apiKey: string;
  bedrockRegion: string;
  bedrockAuth: BedrockAuth;
  /** Amazon Bedrock API key (bearer) */
  bedrockApiKey: string;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsSessionToken: string;
  /** Optional — improves calories-burned estimates */
  bodyWeight: string;
  weightUnit: 'lb' | 'kg';
}

export const DEFAULT_AI_CONFIG: AiConfig = {
  enabled: false,
  provider: 'anthropic',
  model: 'claude-opus-5-5',
  apiKey: '',
  bedrockRegion: 'us-east-1',
  bedrockAuth: 'apiKey',
  bedrockApiKey: '',
  awsAccessKeyId: '',
  awsSecretAccessKey: '',
  awsSessionToken: '',
  bodyWeight: '',
  weightUnit: 'lb',
};

/** Suggested models per provider — the Settings form also accepts any model ID. */
export const AI_MODEL_PRESETS: Record<AiProvider, { id: string; label: string }[]> = {
  anthropic: [
    { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
    { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  ],
  // Bedrock's picker loads the account's own model list (see listBedrockTextModels);
  // this is only the starter list before that loads
  bedrock: fallbackBedrockModels('us-east-1'),
  openai: [
    { id: 'gpt-5-mini', label: 'GPT-5 mini' },
    { id: 'gpt-5', label: 'GPT-5' },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
  ],
};

export const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  anthropic: 'Claude (Anthropic API)',
  bedrock: 'Amazon Bedrock',
  openai: 'OpenAI',
};

type EncryptBytesFn = (data: ArrayBuffer) => Promise<{ ciphertext: ArrayBuffer; iv: string }>;
type DecryptBytesFn = (ciphertext: ArrayBuffer, iv: string) => Promise<ArrayBuffer>;

/** Value shape of the `aiConfig` setting: master-key ciphertext. */
export interface EncryptedAiConfig {
  ciphertext: string; // base64
  iv: string;         // base64
}

// ── In-memory credential state (mirrors the master key's lifecycle) ─────────
let aiConfig: AiConfig | null = null;
let encryptedConfig: EncryptedAiConfig | null = null;

const listeners = new Set<() => void>();
function notify(): void { for (const l of listeners) l(); }

/** Subscribe to config changes (async decrypt on init/unlock). Returns unsubscribe. */
export function subscribeAi(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Credentials present for the chosen provider — requests can be made. */
export function hasCredentials(cfg: AiConfig): boolean {
  if (!cfg.model.trim()) return false;
  if (cfg.provider === 'bedrock') {
    if (!cfg.bedrockRegion.trim()) return false;
    return cfg.bedrockAuth === 'apiKey'
      ? !!cfg.bedrockApiKey.trim()
      : !!(cfg.awsAccessKeyId.trim() && cfg.awsSecretAccessKey.trim());
  }
  return !!cfg.apiKey.trim();
}

/** AI is switched on, unlocked, and fully configured. */
export function isAiReady(): boolean {
  return !!aiConfig && aiConfig.enabled && hasCredentials(aiConfig);
}

/** Latest stored config for the Settings form (null when none / locked). */
export function getAiConfigValue(): AiConfig | null {
  return aiConfig;
}

/** Load the `aiConfig` setting: remember the encrypted blob and decrypt it. */
export async function loadAiConfig(value: unknown, decryptBytes: DecryptBytesFn): Promise<void> {
  aiConfig = null;
  encryptedConfig = null;
  try {
    if (!value || typeof value !== 'object') return;
    const { ciphertext, iv } = value as Partial<EncryptedAiConfig>;
    if (typeof ciphertext !== 'string' || typeof iv !== 'string') return;
    encryptedConfig = { ciphertext, iv };
    try {
      const plaintext = await decryptBytes(base64ToArrayBuffer(ciphertext), iv);
      const parsed = JSON.parse(new TextDecoder().decode(plaintext));
      if (parsed && typeof parsed === 'object') aiConfig = { ...DEFAULT_AI_CONFIG, ...parsed };
    } catch (err) {
      console.warn('AI settings could not be decrypted:', err);
    }
  } finally {
    notify();
  }
}

/** Re-derive the in-memory config after an unlock (called from EncryptionContext). */
export async function rederiveAiConfig(decryptBytes: DecryptBytesFn): Promise<void> {
  if (aiConfig || !encryptedConfig) return;
  await loadAiConfig(encryptedConfig, decryptBytes);
}

/** Drop decrypted credentials on lock; the encrypted blob stays for unlock. */
export function clearAiConfig(): void {
  aiConfig = null;
  notify();
}

/** Set (or clear) the config directly — used by the Settings autosave. */
export function setAiConfig(cfg: AiConfig | null, encrypted: EncryptedAiConfig | null): void {
  aiConfig = cfg;
  encryptedConfig = encrypted;
  notify();
}

/** Encrypt a config for storage in the `aiConfig` setting. */
export async function encryptAiConfig(cfg: AiConfig, encryptBytes: EncryptBytesFn): Promise<EncryptedAiConfig> {
  const data = new TextEncoder().encode(JSON.stringify(cfg));
  const { ciphertext, iv } = await encryptBytes(data.buffer as ArrayBuffer);
  return { ciphertext: arrayBufferToBase64(ciphertext), iv };
}

// ── Provider calls ───────────────────────────────────────────────────────────

/** Claude models that run adaptive thinking and accept `output_config.effort`. */
function isClaude5(model: string): boolean {
  return /claude-(opus|sonnet|fable)-5/.test(model);
}

/** Models that take the server-side refusal fallback (`fallbacks: "default"`). */
function supportsServerFallback(model: string): boolean {
  return /^claude-(opus-5-5|opus-5|sonnet-5-5|fable-5-1)$/.test(model);
}

interface ClaudeMessage {
  stop_reason: string | null;
  content: { type: string; text?: string }[];
}

function claudeText(res: ClaudeMessage): string {
  if (res.stop_reason === 'refusal') throw new Error('The model declined this request');
  return res.content.filter(b => b.type === 'text').map(b => b.text ?? '').join('');
}

async function completeClaude(cfg: AiConfig, system: string, prompt: string): Promise<string> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  // Keys are the user's own, typed into their own browser — there is no
  // server to hold them, which is the point of the zero-knowledge design
  const client = new Anthropic({ apiKey: cfg.apiKey.trim(), dangerouslyAllowBrowser: true, maxRetries: 1 });
  const model = cfg.model.trim();
  const params = {
    model,
    max_tokens: 2048,
    system,
    messages: [{ role: 'user' as const, content: prompt }],
    // A one-number estimate is a simple task — low effort keeps it fast and cheap
    ...(isClaude5(model) ? { output_config: { effort: 'low' as const } } : {}),
  };
  try {
    const res = supportsServerFallback(model)
      ? await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
      : await client.messages.create(params);
    return claudeText(res as ClaudeMessage);
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new Error('Claude rejected the API key');
    if (err instanceof Anthropic.NotFoundError) throw new Error(`Model "${model}" was not found`);
    if (err instanceof Anthropic.RateLimitError) throw new Error('Claude rate limit reached — try again shortly');
    if (err instanceof Anthropic.APIError && err.status) throw new Error(`Claude API error ${err.status}: ${err.message}`);
    throw err;
  }
}

function bedrockCreds(cfg: AiConfig): BedrockCredentials {
  return {
    region: cfg.bedrockRegion,
    auth: cfg.bedrockAuth,
    apiKey: cfg.bedrockApiKey,
    accessKeyId: cfg.awsAccessKeyId,
    secretAccessKey: cfg.awsSecretAccessKey,
    sessionToken: cfg.awsSessionToken,
  };
}

/** Every text model the Bedrock account can use in its region (Settings model picker). */
export function listBedrockModels(cfg: AiConfig): Promise<BedrockModelOption[]> {
  return listBedrockTextModels(bedrockCreds(cfg));
}

/** Starter Bedrock model list for a region, shown until the live list loads. */
export function suggestedBedrockModels(region: string): BedrockModelOption[] {
  return fallbackBedrockModels(region);
}

async function completeBedrock(cfg: AiConfig, system: string, prompt: string): Promise<string> {
  return bedrockConverse(bedrockCreds(cfg), cfg.model, system, prompt);
}

async function completeOpenAI(cfg: AiConfig, system: string, prompt: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey.trim()}` },
    body: JSON.stringify({
      model: cfg.model.trim(),
      messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) {
    let detail = '';
    try { detail = ((await res.json()) as { error?: { message?: string } }).error?.message ?? ''; } catch { /* non-JSON body */ }
    if (res.status === 401) throw new Error('OpenAI rejected the API key');
    throw new Error(`OpenAI error ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? '';
}

async function complete(cfg: AiConfig, system: string, prompt: string): Promise<string> {
  try {
    if (cfg.provider === 'anthropic') return await completeClaude(cfg, system, prompt);
    if (cfg.provider === 'bedrock') return await completeBedrock(cfg, system, prompt);
    return await completeOpenAI(cfg, system, prompt);
  } catch (err) {
    // A browser CORS/network failure surfaces as a bare TypeError
    if (err instanceof TypeError) throw new Error(`Could not reach ${AI_PROVIDER_LABELS[cfg.provider]} — check your connection`);
    throw err;
  }
}

// ── Calorie estimates ────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  'You are a nutrition and fitness assistant inside a personal health journal. ' +
  'You give a single best-estimate number of calories for what the user describes. ' +
  'When details are missing, assume typical portions, an average adult and moderate effort. ' +
  'Reply with only a JSON object of the form {"calories": <integer>} and nothing else.';

/** Pull the calorie number out of a model reply — JSON first, then a bare number. */
export function parseCalories(text: string): number {
  const json = text.match(/\{[\s\S]*\}/);
  let value: unknown;
  if (json) {
    try { value = (JSON.parse(json[0]) as Record<string, unknown>).calories; } catch { /* fall through */ }
  }
  if (value == null) value = text.match(/\d+(\.\d+)?/)?.[0];
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 0 || n > 20000) throw new Error('The AI did not return a calorie estimate');
  return n;
}

function requireReady(): AiConfig {
  if (!aiConfig || !aiConfig.enabled) throw new Error('AI assistant is off');
  if (!hasCredentials(aiConfig)) throw new Error('AI assistant is not fully set up');
  return aiConfig;
}

export interface MealInput {
  description: string;
  mealType?: string;
  ingredients?: string;
}

export interface ExerciseInput {
  description?: string;
  exerciseType?: string;
  durationMinutes?: string;
  distance?: string;
  distanceUnit?: string;
  intensity?: string;
}

/** Calories in a food item, using the given config (Settings test) or the saved one. */
export async function estimateMealCalories(input: MealInput, cfg: AiConfig = requireReady()): Promise<number> {
  const lines = [
    `Food eaten: ${input.description.trim()}`,
    input.mealType ? `Meal: ${input.mealType}` : '',
    input.ingredients?.trim() ? `Ingredients: ${input.ingredients.trim()}` : '',
    'Estimate the total calories (kcal) consumed.',
  ].filter(Boolean);
  return parseCalories(await complete(cfg, SYSTEM_PROMPT, lines.join('\n')));
}

/** Calories burned by a workout, factoring in the user's body weight when set. */
export async function estimateExerciseCalories(input: ExerciseInput): Promise<number> {
  const cfg = requireReady();
  const lines = [
    input.description?.trim() ? `Activity: ${input.description.trim()}` : '',
    input.exerciseType ? `Exercise type: ${input.exerciseType}` : '',
    input.durationMinutes?.trim() ? `Duration: ${input.durationMinutes.trim()} minutes` : '',
    input.distance?.trim() ? `Distance: ${input.distance.trim()} ${input.distanceUnit === 'km' ? 'km' : 'miles'}` : '',
    input.intensity ? `Intensity: ${input.intensity}` : '',
    cfg.bodyWeight.trim() ? `Body weight: ${cfg.bodyWeight.trim()} ${cfg.weightUnit}` : '',
    'Estimate the total calories (kcal) burned.',
  ].filter(Boolean);
  return parseCalories(await complete(cfg, SYSTEM_PROMPT, lines.join('\n')));
}

const NUTRITION_PROMPT =
  'You are a nutrition assistant inside a personal health journal. ' +
  'For a food, drink or supplement the user logged, estimate the nutrients in the amount described. ' +
  'When details are missing, assume a typical single portion (or one dose for a supplement). ' +
  'Use 0 for nutrients the item does not contain. ' +
  'Reply with only a JSON object containing exactly the requested keys with numeric values, and nothing else.';

const NUTRIENT_PROMPT_UNITS: Record<NutrientKey, string> = {
  calories: 'calories (kcal)',
  iron: 'iron (mg)',
  vitaminD: 'vitaminD (mcg)',
  vitaminB12: 'vitaminB12 (mcg)',
  vitaminC: 'vitaminC (mg)',
};

/** Pull the requested nutrient numbers out of a model reply; throws if any is missing. */
export function parseNutrients(text: string, keys: NutrientKey[]): Partial<Record<NutrientKey, number>> {
  const json = text.match(/\{[\s\S]*\}/);
  if (!json) throw new Error('The AI did not return a nutrition estimate');
  let data: Record<string, unknown>;
  try { data = JSON.parse(json[0]) as Record<string, unknown>; }
  catch { throw new Error('The AI did not return a nutrition estimate'); }
  const out: Partial<Record<NutrientKey, number>> = {};
  for (const key of keys) {
    const n = Number(data[key]);
    const max = NUTRIENTS.find(x => x.key === key)!.max;
    if (!Number.isFinite(n) || n < 0 || n > max) throw new Error(`The AI did not return a usable ${key} estimate`);
    out[key] = key === 'calories' ? Math.round(n) : Number(n.toFixed(Math.abs(n) < 1 ? 2 : 1));
  }
  return out;
}

/** Nutrients in a logged food/drink/supplement — only the requested keys. */
export async function estimateFoodNutrition(
  input: MealInput, keys: NutrientKey[] = NUTRIENT_KEYS, cfg: AiConfig = requireReady(),
): Promise<Partial<Record<NutrientKey, number>>> {
  const lines = [
    `Item: ${input.description.trim()}`,
    input.mealType ? `Logged as: ${input.mealType}` : '',
    input.ingredients?.trim() ? `Ingredients: ${input.ingredients.trim()}` : '',
    `Estimate these and reply with JSON using exactly these keys: ${keys.map(k => NUTRIENT_PROMPT_UNITS[k]).join(', ')}.`,
  ].filter(Boolean);
  return parseNutrients(await complete(cfg, NUTRITION_PROMPT, lines.join('\n')), keys);
}

// ── Entry helpers ────────────────────────────────────────────────────────────

/** The inputs a calorie estimate was based on — a change means it is stale. */
function calorieBasis(kind: 'food' | 'exercise', text: string, cf: Record<string, unknown>): string {
  const keys = kind === 'food'
    ? ['mealDescription', 'mealType', 'ingredients']
    : ['exerciseType', 'duration', 'distance', 'distanceUnit', 'intensity'];
  return JSON.stringify([text.trim(), ...keys.map(k => String(cf[k] ?? '').trim())]);
}

function hasEstimateInputs(kind: 'food' | 'exercise', text: string, cf: Record<string, unknown>): boolean {
  if (kind === 'food') return !!(text.trim() || String(cf.mealDescription ?? '').trim() || String(cf.ingredients ?? '').trim());
  return !!(String(cf.duration ?? '').trim() || String(cf.distance ?? '').trim());
}

/**
 * Estimate an entry's numbers on demand (the "Estimate" button): calories
 * burned for exercise; every missing or AI nutrient for food.
 * `text` is the entry's plain-text content. Returns the updated fields, marked
 * as AI-estimated with the inputs they were based on.
 */
export async function estimateEntryCalories(
  kind: 'food' | 'exercise', text: string, cf: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  // Food gets the full nutrient panel; anything typed by hand is kept
  if (kind === 'food') return (await estimateEntryNutrition(text, cf, { refreshAi: true })) ?? cf;
  const calories = await estimateExerciseCalories({
    description: text,
    exerciseType: String(cf.exerciseType ?? ''),
    durationMinutes: String(cf.duration ?? ''),
    distance: String(cf.distance ?? ''),
    distanceUnit: String(cf.distanceUnit ?? ''),
    intensity: String(cf.intensity ?? ''),
  });
  return { ...cf, calories: String(calories), caloriesSource: 'ai', calorieBasis: calorieBasis(kind, text, cf) };
}

/**
 * On save: fill in calories when they are blank, and refresh an earlier AI
 * estimate whose inputs changed. Calories the user typed are never touched.
 * Returns null when nothing needs to change (or AI is off).
 */
export async function autoCaloriesOnSave(
  kind: 'food' | 'exercise', text: string, cf: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  if (kind === 'food') return autoNutritionOnSave(text, cf);
  if (!isAiReady() || !hasEstimateInputs(kind, text, cf)) return null;
  const blank = !String(cf.calories ?? '').trim();
  const staleAi = cf.caloriesSource === 'ai' && cf.calorieBasis !== calorieBasis(kind, text, cf);
  if (!blank && !staleAi) return null;
  return estimateEntryCalories(kind, text, cf);
}

// ── Food nutrition ───────────────────────────────────────────────────────────

/** What a food's AI nutrient values were based on — a change means they are stale. */
function nutritionBasis(text: string, cf: Record<string, unknown>): string {
  return calorieBasis('food', text, cf);
}

/** Description the AI sees for a food entry. */
function foodDescription(text: string, cf: Record<string, unknown>): string {
  return [String(cf.mealDescription ?? '').trim(), text.trim()]
    .filter((v, i, all) => v && all.indexOf(v) === i).join(' — ') || String(cf.ingredients ?? '').trim();
}

/** Nutrients on this food entry that the AI should (re)fill. Typed values are never included. */
export function nutrientsToEstimate(
  text: string, cf: Record<string, unknown>, opts: { refreshAi?: boolean } = {},
): NutrientKey[] {
  const stale = cf.nutritionBasis !== undefined
    ? cf.nutritionBasis !== nutritionBasis(text, cf)
    : cf.calorieBasis !== undefined && cf.calorieBasis !== nutritionBasis(text, cf);
  return NUTRIENT_KEYS.filter(key => {
    const blank = !String(cf[key] ?? '').trim();
    const source = nutrientSourceOf(cf, key);
    if (source === 'manual' && !blank) return false;
    if (blank) return true;
    return source === 'ai' && (opts.refreshAi || stale);
  });
}

/**
 * Estimate the missing (or stale AI) nutrients of a food entry in one request.
 * Returns the updated fields — values marked as AI with the inputs they were
 * based on — or null when there is nothing to estimate.
 */
export async function estimateEntryNutrition(
  text: string, cf: Record<string, unknown>, opts: { refreshAi?: boolean } = {},
): Promise<Record<string, unknown> | null> {
  const description = foodDescription(text, cf);
  if (!description) return null;
  const keys = nutrientsToEstimate(text, cf, opts);
  if (keys.length === 0) return null;
  const values = await estimateFoodNutrition({
    description,
    mealType: String(cf.mealType ?? ''),
    ingredients: String(cf.ingredients ?? ''),
  }, keys);
  const sources: Partial<Record<NutrientKey, NutrientSource>> = {
    ...((cf.nutrientSource as Partial<Record<NutrientKey, NutrientSource>> | undefined) ?? {}),
  };
  const next: Record<string, unknown> = { ...cf };
  for (const key of keys) {
    next[key] = String(values[key]);
    sources[key] = 'ai';
  }
  next.nutrientSource = sources;
  if (keys.includes('calories')) { next.caloriesSource = 'ai'; next.calorieBasis = nutritionBasis(text, cf); }
  next.nutritionBasis = nutritionBasis(text, cf);
  return next;
}

/** On save: fill blank nutrients and refresh stale AI ones. Null when AI is off or nothing changes. */
export async function autoNutritionOnSave(text: string, cf: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  if (!isAiReady()) return null;
  return estimateEntryNutrition(text, cf);
}
