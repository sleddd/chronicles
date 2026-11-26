import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Anthropic developer-policy safeguards in the browser: every Anthropic request
// names the account only by its anonymous id (metadata.user_id), a declined
// request is reported once, and a pause or block stops every AI feature.

const status = vi.hoisted(() => ({
  current: null as unknown,
}));
vi.mock('../../services/api.js', () => ({
  aiChat: {
    status: vi.fn(async () => status.current),
    refusal: vi.fn(async () => status.current),
  },
}));

import { aiChat } from '../../services/api.js';
import { chatReply, classifyReply, classifyRisk, estimateMealCalories, isAiReady, setAiConfig, DEFAULT_AI_CONFIG, type AiConfig } from '../../services/aiAssistant.js';
import { setEgressAccount, recordAiChoice } from '../../services/deviceConsent.js';
import { AI_WARNED_NOTICE, aiHold, aiWarned, clearAiStatus, getAiStatus, setAiStatus } from '../../services/aiAccess.js';
import { useAiChatStore } from '../../stores/aiChatStore.js';
import type { AiChatStatus, AiEnforcement } from '@shared/validation/schemas.js';

const USER_ID = '0123456789abcdef0123456789abcdef';
const make = (enforcement: Partial<AiEnforcement> = {}, extra: Partial<AiChatStatus> = {}): AiChatStatus => ({
  consentAt: '2026-11-01T00:00:00Z', consentVersion: 2, blocked: false, aiUserId: USER_ID,
  enforcement: { level: 'ok', pausedUntil: null, refusals24h: 0, refusals30d: 0, ...enforcement },
  ...extra,
});

const claude: AiConfig = { ...DEFAULT_AI_CONFIG, enabled: true, provider: 'anthropic', model: 'claude-haiku-4-5', apiKey: 'sk-ant-test' };
const openai: AiConfig = { ...DEFAULT_AI_CONFIG, enabled: true, provider: 'openai', model: 'gpt-5-mini', apiKey: 'sk-test' };

/** Answer every Anthropic request with this stop reason and text; returns the fetch spy. */
function mockClaude(stopReason: string, text = '{"calories": 95}') {
  const spy = vi.spyOn(globalThis, 'fetch');
  spy.mockClear();
  return spy.mockImplementation(async () => new Response(JSON.stringify({
    id: 'msg_1', type: 'message', role: 'assistant', model: claude.model, stop_reason: stopReason, stop_sequence: null,
    content: stopReason === 'refusal' ? [] : [{ type: 'text', text }],
    usage: { input_tokens: 1, output_tokens: 1 },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
}
const bodies = (spy: ReturnType<typeof mockClaude>) =>
  spy.mock.calls.filter(c => String(c[0]).includes('api.anthropic.com')).map(c => JSON.parse(String((c[1] as RequestInit).body)));

beforeEach(() => {
  localStorage.clear();
  setEgressAccount('tag-access');
  recordAiChoice(true);
  clearAiStatus();
  status.current = make();
  vi.mocked(aiChat.status).mockClear();
  vi.mocked(aiChat.refusal).mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
  setAiConfig(null, null);
  clearAiStatus();
});

describe('metadata.user_id on every Anthropic request', () => {
  it('chat, the risk classifier and estimates all carry the anonymous id — and nothing that names the account', async () => {
    setAiConfig(claude, null);
    const spy = mockClaude('end_turn', '{"rating":"none","kind":null,"calories":95}');
    await chatReply('system', [{ role: 'user', content: 'hello' }]);
    await classifyRisk([{ role: 'user', content: 'hello' }]);
    await estimateMealCalories({ description: '1 apple' });
    const sent = bodies(spy);
    expect(sent).toHaveLength(3);
    for (const body of sent) expect(body.metadata).toEqual({ user_id: USER_ID });
  });

  it('reads the id from the server once, before the first request, when the tab doesn’t have it yet', async () => {
    setAiConfig(claude, null);
    const spy = mockClaude('end_turn');
    expect(getAiStatus()).toBeNull();
    await estimateMealCalories({ description: '1 apple' });
    await estimateMealCalories({ description: '1 pear' });
    expect(aiChat.status).toHaveBeenCalledTimes(1);
    expect(bodies(spy).every(b => b.metadata.user_id === USER_ID)).toBe(true);
  });

  it('sends nothing when the id can’t be read', async () => {
    setAiConfig(claude, null);
    vi.mocked(aiChat.status).mockRejectedValueOnce(new Error('offline'));
    const spy = mockClaude('end_turn');
    await expect(estimateMealCalories({ description: '1 apple' })).rejects.toThrow(/Couldn’t reach Chronicles/);
    expect(bodies(spy)).toHaveLength(0);
  });

  it('a new sign-in on the tab never sends under the last account’s id', async () => {
    setAiConfig(claude, null);
    setAiStatus(make({}, { aiUserId: 'a'.repeat(32) }));
    clearAiStatus(); // the session ended (dropDecryptedState)
    const spy = mockClaude('end_turn');
    await estimateMealCalories({ description: '1 apple' });
    expect(bodies(spy)[0].metadata.user_id).toBe(USER_ID);
  });
});

describe('a declined request (stop_reason "refusal")', () => {
  it('is reported once, the status is taken from the answer, and the usual error still shows', async () => {
    setAiConfig(claude, null);
    setAiStatus(make());
    status.current = make({ level: 'warned', refusals24h: 5, refusals30d: 5 });
    mockClaude('refusal');
    await expect(chatReply('system', [{ role: 'user', content: 'x' }])).rejects.toThrow('The model declined this request');
    await vi.waitFor(() => expect(useAiChatStore.getState().status?.enforcement.level).toBe('warned'));
    expect(aiChat.refusal).toHaveBeenCalledTimes(1);
    expect(aiWarned()).toBe(true);
  });

  it('one report per declined request, and none for a request that wasn’t declined', async () => {
    setAiConfig(claude, null);
    setAiStatus(make());
    mockClaude('end_turn');
    await estimateMealCalories({ description: '1 apple' });
    expect(aiChat.refusal).not.toHaveBeenCalled();
    mockClaude('refusal');
    await expect(estimateMealCalories({ description: '1 apple' })).rejects.toThrow('The model declined this request');
    await vi.waitFor(() => expect(aiChat.refusal).toHaveBeenCalledTimes(1));
  });

  it('a safety screening request the model declines is never counted (no one is paused for reaching out)', async () => {
    setAiConfig(claude, null);
    setAiStatus(make());
    mockClaude('refusal');
    await expect(classifyRisk([{ role: 'user', content: 'x' }])).rejects.toThrow('The model declined this request');
    await expect(classifyReply('a reply', 'x')).rejects.toThrow('The model declined this request');
    await new Promise(r => setTimeout(r, 0));
    expect(aiChat.refusal).not.toHaveBeenCalled();
  });

  it('the answer that pauses In-App AI stops the next request before it is sent', async () => {
    setAiConfig(claude, null);
    setAiStatus(make());
    status.current = make({ level: 'paused', pausedUntil: new Date(Date.now() + 86_400_000).toISOString(), refusals24h: 10 });
    const spy = mockClaude('refusal');
    await expect(chatReply('system', [{ role: 'user', content: 'x' }])).rejects.toThrow();
    await vi.waitFor(() => expect(aiHold()?.kind).toBe('paused'));
    spy.mockClear();
    await expect(chatReply('system', [{ role: 'user', content: 'y' }])).rejects.toThrow(/In-App AI is paused until/);
    expect(bodies(spy)).toHaveLength(0);
  });
});

describe('the other providers', () => {
  const bedrock: AiConfig = { ...DEFAULT_AI_CONFIG, enabled: true, provider: 'bedrock', model: 'us.meta.llama4', bedrockRegion: 'us-east-1', bedrockAuth: 'apiKey', bedrockApiKey: 'ABSK' + 'x'.repeat(40) } as AiConfig;
  const answer = (body: unknown) => {
    const spy = vi.spyOn(globalThis, 'fetch');
    spy.mockClear();
    return spy.mockImplementation(async () => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  };
  const sentBody = (spy: ReturnType<typeof answer>) => JSON.parse(String((spy.mock.calls[0][1] as RequestInit).body));

  it('OpenAI: the anonymous id goes as safety_identifier, read from the server first', async () => {
    setAiConfig(openai, null);
    const spy = answer({ choices: [{ finish_reason: 'stop', message: { content: '{"calories": 95}' } }] });
    expect(getAiStatus()).toBeNull();
    await estimateMealCalories({ description: '1 apple' });
    expect(aiChat.status).toHaveBeenCalledTimes(1);
    expect(sentBody(spy).safety_identifier).toBe(USER_ID);
  });

  it('OpenAI: a refusal, or its content filter, is reported once', async () => {
    setAiConfig(openai, null);
    setAiStatus(make());
    answer({ choices: [{ finish_reason: 'stop', message: { content: null, refusal: 'I can’t help with that.' } }] });
    await expect(chatReply('system', [{ role: 'user', content: 'x' }])).rejects.toThrow('The model declined this request');
    await vi.waitFor(() => expect(aiChat.refusal).toHaveBeenCalledTimes(1));
    answer({ choices: [{ finish_reason: 'content_filter', message: { content: '' } }] });
    await expect(chatReply('system', [{ role: 'user', content: 'y' }])).rejects.toThrow('The model declined this request');
    await vi.waitFor(() => expect(aiChat.refusal).toHaveBeenCalledTimes(2));
  });

  it('Bedrock: the anonymous id goes as request metadata, and a blocked answer is reported', async () => {
    setAiConfig(bedrock, null);
    setAiStatus(make());
    const ok = answer({ stopReason: 'end_turn', output: { message: { content: [{ text: '{"calories": 95}' }] } } });
    await estimateMealCalories({ description: '1 apple' });
    expect(sentBody(ok).requestMetadata).toEqual({ user_id: USER_ID });
    expect(aiChat.refusal).not.toHaveBeenCalled();
    answer({ stopReason: 'content_filtered', output: { message: { content: [] } } });
    await expect(estimateMealCalories({ description: '1 pear' })).rejects.toThrow('The model declined this request');
    await vi.waitFor(() => expect(aiChat.refusal).toHaveBeenCalledTimes(1));
  });
});

describe('paused or turned off: every AI feature waits', () => {
  it('a tab that hasn’t read the status yet reads it first: a pause the server holds stops the very first request, on any provider', async () => {
    status.current = make({ level: 'paused', pausedUntil: new Date(Date.now() + 3_600_000).toISOString(), refusals24h: 10 });
    for (const cfg of [claude, openai]) {
      clearAiStatus();
      setAiConfig(cfg, null);
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      fetchSpy.mockClear();
      await expect(estimateMealCalories({ description: '1 apple' })).rejects.toThrow(/In-App AI is paused until/);
      expect(fetchSpy).not.toHaveBeenCalled();
    }
  });

  it('…and so does a block', async () => {
    status.current = make({ level: 'blocked' }, { blocked: true, consentAt: null, consentVersion: null });
    setAiConfig(openai, null);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fetchSpy.mockClear();
    await expect(estimateMealCalories({ description: '1 apple' })).rejects.toThrow('In-App AI is turned off for this account.');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('when the status can’t be read nothing is sent, whichever provider', async () => {
    setAiConfig(openai, null);
    vi.mocked(aiChat.status).mockRejectedValueOnce(new Error('offline'));
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fetchSpy.mockClear();
    await expect(estimateMealCalories({ description: '1 apple' })).rejects.toThrow(/Couldn’t reach Chronicles/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('while paused, isAiReady is false and nothing is sent to any provider', async () => {
    setAiConfig(openai, null);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fetchSpy.mockClear();
    setAiStatus(make({ level: 'paused', pausedUntil: new Date(Date.now() + 3_600_000).toISOString(), refusals24h: 10 }));
    expect(isAiReady()).toBe(false);
    await expect(estimateMealCalories({ description: '1 apple' })).rejects.toThrow(/^In-App AI is paused until .+\.$/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('once the pause has run out, AI is ready again', () => {
    setAiConfig(openai, null);
    setAiStatus(make({ level: 'paused', pausedUntil: new Date(Date.now() - 1000).toISOString(), refusals24h: 10 }));
    expect(aiHold()).toBeNull();
    expect(isAiReady()).toBe(true);
  });

  it('turned off for the account: not ready, with its own message', async () => {
    setAiConfig(openai, null);
    setAiStatus(make({ level: 'blocked' }, { blocked: true, consentAt: null, consentVersion: null }));
    expect(isAiReady()).toBe(false);
    await expect(estimateMealCalories({ description: '1 apple' })).rejects.toThrow('In-App AI is turned off for this account.');
  });

  it('warned is only a notice: AI stays ready', () => {
    setAiConfig(openai, null);
    setAiStatus(make({ level: 'warned', refusals24h: 6 }));
    expect(isAiReady()).toBe(true);
    expect(aiWarned()).toBe(true);
    expect(AI_WARNED_NOTICE).toBe('Some recent requests were declined by the AI. Repeated declined requests pause In-App AI for a day.');
  });
});
