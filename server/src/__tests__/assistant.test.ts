import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

// The Chronicles AI app (Smith): an assistant session may only call a short
// allowlist, only while the account has the app switched on.

const mockPrisma = vi.hoisted(() => ({
  session: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
  account: { findUnique: vi.fn() },
}));
vi.mock('../db/prisma.js', () => ({ prisma: mockPrisma }));
vi.mock('../db/tenantQueries.js', () => ({ getSetting: vi.fn() }));
vi.mock('../db/rekeyQueries.js', () => ({ getRekey: vi.fn().mockResolvedValue(null) }));

import { readFileSync } from 'node:fs';
import { assistantMay, parseAiPrivacy, assistantAllowedForEmail, assistantMayReadSetting, isAssistantSignOut, ASSISTANT_RULES, type AiPrivacy } from '../services/assistant.js';
import { authMiddleware } from '../middleware/auth.js';
import { getSetting } from '../db/tenantQueries.js';
import { getRekey } from '../db/rekeyQueries.js';

const ON: AiPrivacy = { appEnabled: true, hiddenTopicIds: [], hiddenFeatures: [] };
const UUID = '0b5c8f4e-8a51-4c3f-9d55-3a1f7c2e9b10';

describe('assistantMay', () => {
  const allowed: [string, string][] = [
    ['GET', '/api/auth/me'], ['POST', '/api/auth/logout'],
    ['GET', '/api/entries'], ['GET', '/api/entries/cursor'], ['GET', '/api/entries/changes'], ['GET', '/api/entries/visible-ids'],
    ['GET', '/api/entries/42'], ['POST', '/api/entries/ids'], ['POST', '/api/entries'], ['PUT', '/api/entries/42'],
    ['DELETE', '/api/entries/42'],
    ['GET', '/api/topics'], ['POST', '/api/topics/ids'], ['POST', '/api/topics'], ['GET', '/api/settings'], ['PUT', '/api/settings'],
    ['GET', '/api/doses'], ['GET', '/api/doses/all'], ['PUT', `/api/doses/${UUID}`],
    ['GET', '/api/finance/bills'], ['PUT', `/api/finance/bills/${UUID}`],
    ['GET', '/api/ai-chat'], ['POST', '/api/ai-chat/consent'], ['POST', '/api/ai-chat/refusal'],
  ];
  it.each(allowed)('allows %s %s', (method, path) => {
    expect(assistantMay(method, path, ON)).toEqual({ ok: true });
  });

  const refused: [string, string][] = [
    // Account, security and sessions
    ['POST', '/api/auth/change-password'], ['POST', '/api/auth/2fa/setup'], ['DELETE', '/api/auth/2fa'],
    ['GET', '/api/sessions'], ['POST', '/api/sessions/revoke-all'], ['POST', '/api/auth/passkey/options'],
    ['DELETE', '/api/auth/account'], ['POST', '/api/auth/password-wrap'],
    // Removing things, and everything outside the list
    ['DELETE', `/api/doses/${UUID}`], ['DELETE', `/api/finance/bills/${UUID}`], ['DELETE', '/api/settings/habitLog'],
    ['POST', '/api/entries/batch'], ['PUT', '/api/entries/reseal'], ['PUT', '/api/entries/ai-hidden'], ['GET', '/api/entries/ai-hidden'],
    ['GET', '/api/entries/fingerprint'],
    // Topics: it may create one (above), never rename, reorder or delete one
    ['PUT', '/api/topics/3'], ['DELETE', '/api/topics/3'], ['POST', '/api/topics/reorder'], ['GET', '/api/topics/3'],
    // Finance other than bills
    ['GET', '/api/finance/expenses'], ['GET', '/api/finance/budget'], ['GET', '/api/finance/savings'], ['GET', '/api/finance/goals'],
    ['PUT', `/api/finance/expenses/${UUID}`], ['PUT', '/api/finance/bills'],
    // Other features
    ['POST', '/api/ai-chat/log'], ['DELETE', '/api/ai-chat/consent'], ['GET', '/api/ai-chat/consent'], ['GET', '/api/ai-chat/refusal'],
    ['POST', '/api/ai-chat'], ['POST', '/api/ai-chat/refusal/extra'], ['GET', '/api/calendar/status'], ['POST', '/api/shares'], ['GET', '/api/analytics/x'],
    ['PUT', '/api/doses/reseal'], ['GET', '/api/entries/42/extra'],
  ];
  it.each(refused)('refuses %s %s', (method, path) => {
    expect(assistantMay(method, path, ON).ok).toBe(false);
  });

  it('refuses everything while the app is switched off', () => {
    const off = { ...ON, appEnabled: false };
    for (const rule of ASSISTANT_RULES) {
      expect(assistantMay(rule.method, '/api/auth/me', off).ok).toBe(false);
    }
  });

  it('refuses features the account chose not to share with AI', () => {
    const p = { ...ON, hiddenFeatures: ['doses', 'bills', 'habits'] as AiPrivacy['hiddenFeatures'] };
    expect(assistantMay('GET', '/api/doses', p).ok).toBe(false);
    expect(assistantMay('PUT', `/api/doses/${UUID}`, p).ok).toBe(false);
    expect(assistantMay('GET', '/api/finance/bills', p).ok).toBe(false);
    expect(assistantMay('PUT', '/api/settings', p).ok).toBe(false);
    // Entries and topics are still fine
    expect(assistantMay('GET', '/api/entries', p).ok).toBe(true);
  });

  it('ignores a trailing slash but not other tricks', () => {
    expect(assistantMay('GET', '/api/entries/', ON).ok).toBe(true);
    expect(assistantMay('GET', '/api/entries/../sessions', ON).ok).toBe(false);
    expect(assistantMay('GET', '/api/entries/1;DROP', ON).ok).toBe(false);
  });
});

describe('parseAiPrivacy and the account list', () => {
  it('keeps only known, well-formed values', () => {
    expect(parseAiPrivacy({ appEnabled: 'yes', hiddenTopicIds: [3, -1, 'x', 2.5, 7], hiddenFeatures: ['doses', 'nope'] }))
      .toEqual({ appEnabled: false, hiddenTopicIds: [3, 7], hiddenFeatures: ['doses'] });
    expect(parseAiPrivacy(null)).toEqual({ appEnabled: false, hiddenTopicIds: [], hiddenFeatures: [] });
  });

  it('only listed emails may use the app', () => {
    expect(assistantAllowedForEmail('Me@Example.com', 'me@example.com, other@x.com')).toBe(true);
    expect(assistantAllowedForEmail('me@example.com', undefined)).toBe(false);
    expect(assistantAllowedForEmail('me@example.com', '')).toBe(false);
    expect(assistantAllowedForEmail('you@example.com', 'me@example.com')).toBe(false);
  });
});

describe('authMiddleware with an assistant session', () => {
  const verifier = 'v'.repeat(32).replace(/v/g, 'a');
  const token = 'aabbccddee11' + verifier;
  const session = {
    id: 9, selector: 'aabbccddee11', accountId: 1, tenantSchemaName: 'usr_1_a1b2c3',
    verifierHash: crypto.createHash('sha256').update(verifier).digest('hex'),
    revokedAt: null, expiresAt: new Date(Date.now() + 86_400_000), lastActiveAt: new Date(), deviceInfo: 'assistant',
  };
  const req = (method: string, url: string) => ({ method, originalUrl: url, url, headers: { authorization: `Bearer ${token}` }, cookies: {} }) as any;
  const res = () => { const r: any = {}; r.status = vi.fn().mockReturnValue(r); r.json = vi.fn().mockReturnValue(r); return r; };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ASSISTANT_CLIENT_EMAILS = 'me@example.com';
    mockPrisma.session.findUnique.mockResolvedValue(session);
    mockPrisma.account.findUnique.mockResolvedValue({ email: 'me@example.com' });
    (getSetting as any).mockResolvedValue({ key: 'aiPrivacy', value: { appEnabled: true } });
    (getRekey as any).mockResolvedValue(null);
  });

  it('lets an allowed request through and marks it as the assistant', async () => {
    const r = req('GET', '/api/entries?v=2');
    const next = vi.fn();
    await authMiddleware(r, res(), next);
    expect(next).toHaveBeenCalled();
    expect(r.auth.assistant).toBe(true);
  });

  it('hands the routes the choices it read for this request', async () => {
    (getSetting as any).mockResolvedValue({ key: 'aiPrivacy', value: { appEnabled: true, hiddenTopicIds: [4], hiddenFeatures: ['habits'] } });
    const r = req('GET', '/api/topics');
    await authMiddleware(r, res(), vi.fn());
    expect(r.auth.aiPrivacy).toEqual({ appEnabled: true, hiddenTopicIds: [4], hiddenFeatures: ['habits'] });
  });

  it('stops working the moment the account is taken off the list', async () => {
    process.env.ASSISTANT_CLIENT_EMAILS = 'someone-else@example.com';
    const out = res();
    const next = vi.fn();
    await authMiddleware(req('GET', '/api/entries'), out, next);
    expect(next).not.toHaveBeenCalled();
    expect(out.status).toHaveBeenCalledWith(403);
  });

  it('reads the switch fresh on every request (no cache to outlive a switch-off)', async () => {
    await authMiddleware(req('GET', '/api/entries'), res(), vi.fn());
    (getSetting as any).mockResolvedValue({ key: 'aiPrivacy', value: { appEnabled: false } });
    const out = res();
    const next = vi.fn();
    await authMiddleware(req('GET', '/api/entries'), out, next);
    expect(next).not.toHaveBeenCalled();
    expect(out.status).toHaveBeenCalledWith(403);
  });

  it('waits while the journal is moving to a new key', async () => {
    (getRekey as any).mockResolvedValue({ rekeyId: 'r', oldKey: '', oldKeyIv: '', startedAt: '' });
    const r = res(); const next = vi.fn();
    await authMiddleware(req('GET', '/api/entries'), r, next);
    expect(r.status).toHaveBeenCalledWith(409);
    expect(next).not.toHaveBeenCalled();
  });

  it('refuses anything outside the allowlist with 403', async () => {
    const out = res();
    const next = vi.fn();
    await authMiddleware(req('POST', '/api/sessions/revoke-all'), out, next);
    expect(next).not.toHaveBeenCalled();
    expect(out.status).toHaveBeenCalledWith(403);
  });

  it('refuses everything once the app is switched off', async () => {
    (getSetting as any).mockResolvedValue({ key: 'aiPrivacy', value: { appEnabled: false } });
    const out = res();
    const next = vi.fn();
    await authMiddleware(req('GET', '/api/entries'), out, next);
    expect(next).not.toHaveBeenCalled();
    expect(out.status).toHaveBeenCalledWith(403);
  });

  // A session that outlived the switch-off (a sign-in that was on its way, a
  // revoke that failed) must not be there when the app is switched on again
  describe('a session that is refused', () => {
    const stale = { ...session, lastActiveAt: new Date(Date.now() - 10 * 60 * 1000) };
    const activityNoted = () => mockPrisma.session.update.mock.calls.some(([q]) => 'lastActiveAt' in q.data);
    const revoked = () => mockPrisma.session.update.mock.calls.some(([q]) => q.data.revokedReason === 'assistant_off');
    beforeEach(() => {
      mockPrisma.session.findUnique.mockResolvedValue(stale);
      mockPrisma.session.update.mockResolvedValue({});
    });

    it('is ended for good while the app is switched off, and can’t keep itself from going idle', async () => {
      (getSetting as any).mockResolvedValue({ key: 'aiPrivacy', value: { appEnabled: false } });
      const out = res();
      await authMiddleware(req('GET', '/api/entries'), out, vi.fn());
      expect(out.status).toHaveBeenCalledWith(403);
      expect(revoked()).toBe(true);
      expect(activityNoted()).toBe(false);
    });

    it('is ended for good once the account is off the list', async () => {
      process.env.ASSISTANT_CLIENT_EMAILS = '';
      await authMiddleware(req('GET', '/api/entries'), res(), vi.fn());
      expect(revoked()).toBe(true);
      expect(activityNoted()).toBe(false);
    });

    it('asking for something outside the allowlist doesn’t count as being there (but ends nothing)', async () => {
      await authMiddleware(req('GET', '/api/sessions'), res(), vi.fn());
      expect(activityNoted()).toBe(false);
      expect(revoked()).toBe(false);
    });

    it('a request that is let through counts, and so does waiting out a re-key', async () => {
      await authMiddleware(req('GET', '/api/entries'), res(), vi.fn());
      expect(activityNoted()).toBe(true);
      mockPrisma.session.update.mockClear();
      (getRekey as any).mockResolvedValue({ rekeyId: 'r', oldKey: '', oldKeyIv: '', startedAt: '' });
      await authMiddleware(req('GET', '/api/entries'), res(), vi.fn());
      expect(activityNoted()).toBe(true);
      expect(revoked()).toBe(false);
    });
  });

  it('leaves a normal session alone', async () => {
    mockPrisma.session.findUnique.mockResolvedValue({ ...session, deviceInfo: 'password' });
    const r = req('POST', '/api/sessions/revoke-all');
    const next = vi.fn();
    await authMiddleware(r, res(), next);
    expect(next).toHaveBeenCalled();
    expect(r.auth.assistant).toBeUndefined();
    expect(getSetting).not.toHaveBeenCalled();
  });
});

describe('what the AI app changed is the owner’s to look over, never its own', () => {
  const on: AiPrivacy = { appEnabled: true, hiddenTopicIds: [], hiddenFeatures: [] };
  it.each([['GET', '/api/assistant-changes'], ['POST', '/api/assistant-changes/3/restore'], ['DELETE', '/api/assistant-changes/3'], ['DELETE', '/api/assistant-changes']])(
    '%s %s is refused', (method, path) => {
      expect(assistantMay(method, path, on).ok).toBe(false);
    });
});

describe('assistantMayReadSetting', () => {
  const on: AiPrivacy = { appEnabled: true, hiddenTopicIds: [], hiddenFeatures: [] };
  it('only the few settings the app needs', () => {
    expect(assistantMayReadSetting('displayName', on)).toBe(true);
    expect(assistantMayReadSetting('themeMode', on)).toBe(false);
    // Both copies of the "Don't share with AI" choices: the app believes the sealed one, like a browser
    expect(assistantMayReadSetting('aiPrivacySealed', on)).toBe(true);
    expect(assistantMayReadSetting('aiPrivacy', on)).toBe(true);
    expect(assistantMayReadSetting('imageStorageConfig', on)).toBe(false);
  });
  it('never a setting that belongs to a feature kept from AI', () => {
    expect(assistantMayReadSetting('habitLog', on)).toBe(true);
    expect(assistantMayReadSetting('habitLog', { ...on, hiddenFeatures: ['habits'] })).toBe(false);
    expect(assistantMayReadSetting('goalCategories', { ...on, hiddenFeatures: ['vision'] })).toBe(false);
    expect(assistantMayReadSetting('goalCategories', { ...on, hiddenFeatures: ['habits'] })).toBe(true);
  });
});

describe('Every write the AI app may make is held to its rule in the route', () => {
  // The allowlist says which requests an assistant session may make. What a
  // rule leaves to its route — only habitLog, only an existing bill, only its
  // own creation — and keeping the version it overwrites, live in the route's
  // file. A new write rule without them there fails here.
  const routeFile = (path: RegExp) => {
    const name = /api\\?\/([a-z-]+)/.exec(path.source)?.[1];
    return readFileSync(new URL(`../routes/${name}.ts`, import.meta.url), 'utf8');
  };
  // (In-App AI's consent and declined requests aren't journal records: their own test below)
  const writes = ASSISTANT_RULES.filter(r => r.method !== 'GET' && !/auth|ai-chat/.test(r.path.source) && !/ids/.test(r.path.source));

  it('finds them', () => {
    expect(writes.map(r => r.method).sort()).toEqual(['DELETE', 'POST', 'POST', 'PUT', 'PUT', 'PUT', 'PUT']);
  });

  it.each(writes.map(r => [`${r.method} ${r.path.source}`, r] as const))('%s', (_name, rule) => {
    const source = routeFile(rule.path);
    expect(source).toContain('req.auth!.assistant');
    if (rule.method === 'PUT') expect(source).toContain('assistantWrite');
    // A new entry: counted, recorded for undo and, when its own data, owned. A new topic: its day's budget
    if (rule.method === 'POST' && /entries/.test(rule.path.source)) expect(source).toContain('assistantCreatePost(');
    if (rule.method === 'POST' && /topics/.test(rule.path.source)) {
      expect(source).toContain('assistantTopicAllowed(');
      expect(source).toContain('recordAssistantTopic(');
    }
    if (rule.method === 'DELETE') {
      expect(source).toContain('assistantMayDelete(');
    }
  });

  it('the AI-chat routes are the status, consent and declined requests only — and a declined request is checked as its own in the route', () => {
    const aiChat = ASSISTANT_RULES.filter(r => /ai-chat/.test(r.path.source)).map(r => `${r.method} ${r.path.source}`);
    expect(aiChat).toEqual(['GET ^\\/api\\/ai-chat$', 'POST ^\\/api\\/ai-chat\\/consent$', 'POST ^\\/api\\/ai-chat\\/refusal$']);
    const source = readFileSync(new URL('../routes/aiChat.ts', import.meta.url), 'utf8');
    expect(source).toContain("req.auth!.assistant ? 'smith' : 'chronicles'");
  });

  it('signing out is the one thing left during a re-key', () => {
    expect(isAssistantSignOut('POST', '/api/auth/logout')).toBe(true);
    expect(isAssistantSignOut('post', '/api/auth/logout/')).toBe(true);
    expect(isAssistantSignOut('GET', '/api/auth/logout')).toBe(false);
    expect(isAssistantSignOut('POST', '/api/entries')).toBe(false);
  });
});

describe('The AI privacy tables', () => {
  it('every table the statements make is on the list ensureAiPrivacyTables checks (and the other way round)', () => {
    const source = readFileSync(new URL('../db/tenantQueries.ts', import.meta.url), 'utf8');
    const body = source.slice(source.indexOf('export function aiPrivacyStatements'), source.indexOf('const aiPrivacyReady'));
    const made = [...body.matchAll(/CREATE TABLE IF NOT EXISTS \$\{s\}\.([a-z_]+)/g)].map(m => m[1]).sort();
    const listed = [...source.slice(source.indexOf('export const AI_PRIVACY_TABLES'), source.indexOf('] as const', source.indexOf('export const AI_PRIVACY_TABLES')))
      .matchAll(/'([a-z_]+)'/g)].map(m => m[1]).sort();
    expect(made.length).toBeGreaterThan(0);
    expect(listed).toEqual(made);
  });
});
