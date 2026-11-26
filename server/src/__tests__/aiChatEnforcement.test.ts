import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { aiEnforcementLevel, aiRefusalAction } from '@chronicles/shared';

// The declined-request ladder (5 warns, 10 in a day pauses for a day, 20 in 30
// days turns In-App AI off) and turning it back on. The SQL runs against a
// small stand-in for ai_chat_consent and ai_refusals here (by statement); the
// real statements run against Postgres in db/aiChat.db.test.ts.

const db = vi.hoisted(() => ({
  consent: null as null | { consentAt: Date | null; consentVersion: number | null; blocked: boolean; pausedUntil: Date | null; reason: string | null },
  refusals: [] as { at: Date; app: string }[],
}));

const mockPrisma = vi.hoisted(() => {
  const sqlOf = (strings: TemplateStringsArray) => strings.join('?').replace(/\s+/g, ' ');
  const row = () => (db.consent ??= { consentAt: null, consentVersion: null, blocked: false, pausedUntil: null, reason: null });
  const exec = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = sqlOf(strings);
    const now = new Date();
    if (sql.includes('INSERT INTO public.ai_refusals')) {
      // Not while blocked, nor within the dedupe window of the last one
      if (db.consent?.blocked) return 0;
      const windowMs = (values[4] as number) * 1000;
      if (db.refusals.some(r => r.at.getTime() > now.getTime() - windowMs)) return 0;
      db.refusals.push({ at: now, app: values[1] as string });
      return 1;
    }
    if (sql.includes('DELETE FROM public.ai_refusals') && sql.includes('at <=')) {
      db.refusals = db.refusals.filter(r => r.at.getTime() > now.getTime() - 30 * 86_400_000); return 1;
    }
    if (sql.includes('DELETE FROM public.ai_refusals')) { db.refusals = []; return 1; }
    if (sql.includes('(account_id, consent_at, consent_version)')) {
      Object.assign(row(), { consentAt: now, consentVersion: values[1] as number }); return 1;
    }
    if (sql.includes('(account_id, paused_until)')) {
      row().pausedUntil = new Date(now.getTime() + (values[1] as number) * 1000); return 1;
    }
    if (sql.includes('blocked = FALSE, paused_until = NULL')) { Object.assign(row(), { blocked: false, pausedUntil: null, reason: null }); return 1; }
    if (sql.includes('(account_id, blocked, blocked_reason)')) {
      const blocked = values[1] as boolean;
      Object.assign(row(), blocked ? { blocked, reason: values[2] as string, consentAt: null, consentVersion: null } : { blocked, reason: null });
      return 1;
    }
    throw new Error(`Unexpected statement: ${sql}`);
  };
  const query = async (strings: TemplateStringsArray) => {
    if (sqlOf(strings).includes('SELECT blocked, blocked_reason')) {
      return db.consent ? [{ blocked: db.consent.blocked, blocked_reason: db.consent.reason }] : [];
    }
    if (!sqlOf(strings).includes('FROM (SELECT 1) AS one')) throw new Error('Unexpected query');
    const now = Date.now();
    const c = db.consent;
    return [{
      consent_at: c?.consentAt ?? null, consent_version: c?.consentVersion ?? null, blocked: c?.blocked ?? null,
      paused_until: c?.pausedUntil ?? null,
      refusals_24h: db.refusals.filter(r => r.at.getTime() > now - 86_400_000).length,
      refusals_30d: db.refusals.filter(r => r.at.getTime() > now - 30 * 86_400_000).length,
      now: new Date(now),
    }];
  };
  return {
    $executeRaw: vi.fn(exec),
    $queryRaw: vi.fn(query),
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
});
vi.mock('../db/prisma.js', () => ({ prisma: mockPrisma }));

import { getAiBlockReason, getAiChatStatus, recordAiRefusal, saveAiChatConsent, setAiChatBlocked, unblockAiChat } from '../db/aiChatQueries.js';

const HOUR = 3_600_000;
const ACCOUNT = 7;

async function refuse(times: number, app: 'chronicles' | 'smith' = 'chronicles') {
  let status = await getAiChatStatus(ACCOUNT);
  for (let i = 0; i < times; i++) {
    status = await recordAiRefusal(ACCOUNT, app);
    // Past the dedupe window: each of these is a separate message
    vi.advanceTimersByTime(16_000);
  }
  return status;
}

beforeEach(() => {
  process.env.AI_USER_ID_SECRET = 'test-ai-user-secret';
  db.consent = null;
  db.refusals = [];
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-25T12:00:00Z'));
});
afterEach(() => { vi.useRealTimers(); delete process.env.AI_USER_ID_SECRET; });

describe('the level for a set of counts', () => {
  const now = new Date('2026-11-25T12:00:00Z');
  it('blocked, then paused while the pause is ahead, then warned from 5 in a day', () => {
    expect(aiEnforcementLevel({ blocked: false, pausedUntil: null, refusals24h: 4 }, now)).toBe('ok');
    expect(aiEnforcementLevel({ blocked: false, pausedUntil: null, refusals24h: 5 }, now)).toBe('warned');
    expect(aiEnforcementLevel({ blocked: false, pausedUntil: new Date(now.getTime() + 1000), refusals24h: 10 }, now)).toBe('paused');
    expect(aiEnforcementLevel({ blocked: false, pausedUntil: new Date(now.getTime() - 1000), refusals24h: 10 }, now)).toBe('warned');
    expect(aiEnforcementLevel({ blocked: true, pausedUntil: new Date(now.getTime() + 1000), refusals24h: 0 }, now)).toBe('blocked');
  });
  it('one more declined request pauses at 10 in a day and blocks at 20 in 30 days', () => {
    expect(aiRefusalAction({ refusals24h: 9, refusals30d: 19 })).toBe('none');
    expect(aiRefusalAction({ refusals24h: 10, refusals30d: 10 })).toBe('pause');
    expect(aiRefusalAction({ refusals24h: 1, refusals30d: 20 })).toBe('block');
  });
});

describe('recordAiRefusal', () => {
  it('starts at ok, with the anonymous id', async () => {
    const s = await getAiChatStatus(ACCOUNT);
    expect(s.enforcement).toEqual({ level: 'ok', pausedUntil: null, refusals24h: 0, refusals30d: 0 });
    expect(s.aiUserId).toMatch(/^[0-9a-f]{32}$/);
  });

  it('4 declined requests: still ok', async () => {
    const s = await refuse(4);
    expect(s.enforcement).toMatchObject({ level: 'ok', pausedUntil: null, refusals24h: 4 });
  });

  it('5 in a day: warned, nothing paused', async () => {
    const s = await refuse(5);
    expect(s.enforcement).toMatchObject({ level: 'warned', pausedUntil: null, refusals24h: 5, refusals30d: 5 });
    expect(db.consent?.pausedUntil ?? null).toBeNull();
  });

  it('10 in a day: paused for about a day, counted across both apps', async () => {
    await refuse(6, 'chronicles');
    const s = await refuse(4, 'smith');
    expect(s.enforcement.level).toBe('paused');
    expect(s.enforcement.refusals24h).toBe(10);
    const until = Date.parse(s.enforcement.pausedUntil!);
    expect(Math.abs(until - (Date.now() + 24 * HOUR))).toBeLessThan(20_000);
    expect(s.blocked).toBe(false);
  });

  it('the pause runs out after a day (the count still warns until it falls off)', async () => {
    await refuse(10);
    vi.advanceTimersByTime(24 * HOUR + 1000);
    const s = await getAiChatStatus(ACCOUNT);
    expect(s.enforcement.level).not.toBe('paused');
    expect(s.enforcement.pausedUntil).toBeNull();
  });

  it('consent can still be given while paused', async () => {
    await refuse(10);
    await saveAiChatConsent(ACCOUNT, 1);
    const s = await getAiChatStatus(ACCOUNT);
    expect(s.consentAt).not.toBeNull();
    expect(s.enforcement.level).toBe('paused');
  });

  it('20 in 30 days (never 10 in one day): blocked, and consent cleared', async () => {
    await saveAiChatConsent(ACCOUNT, 1);
    let s = await getAiChatStatus(ACCOUNT);
    for (let day = 0; day < 4; day++) {
      s = await refuse(5);
      vi.advanceTimersByTime(25 * HOUR);
    }
    expect(s.enforcement).toMatchObject({ level: 'blocked', refusals30d: 20 });
    expect(s.blocked).toBe(true);
    expect(s.consentAt).toBeNull();
    expect(s.consentVersion).toBeNull();
  });

  it('declined requests older than 30 days no longer count (and are dropped)', async () => {
    await refuse(5);
    vi.advanceTimersByTime(31 * 24 * HOUR);
    const s = await refuse(1);
    expect(s.enforcement).toMatchObject({ level: 'ok', refusals24h: 1, refusals30d: 1 });
    expect(db.refusals).toHaveLength(1);
  });

  it('never stores what was asked: only the account, the time and the app', async () => {
    await refuse(1, 'smith');
    const insert = mockPrisma.$executeRaw.mock.calls.find(c => (c[0] as unknown as string[]).join('?').includes('INSERT INTO public.ai_refusals'))!;
    // The account, the app, and the dedupe window: nothing else
    expect(insert.slice(1)).toEqual([ACCOUNT, 'smith', ACCOUNT, ACCOUNT, 15]);
  });

  it('several declined requests from one message count once', async () => {
    await recordAiRefusal(ACCOUNT, 'chronicles');
    await recordAiRefusal(ACCOUNT, 'chronicles');
    vi.advanceTimersByTime(5000);
    const s = await recordAiRefusal(ACCOUNT, 'smith');
    expect(s.enforcement.refusals24h).toBe(1);
    vi.advanceTimersByTime(11_000);
    expect((await recordAiRefusal(ACCOUNT, 'chronicles')).enforcement.refusals24h).toBe(2);
  });

  it('a report during a pause doesn’t push its end out', async () => {
    const paused = await refuse(10);
    vi.advanceTimersByTime(HOUR);
    const again = await recordAiRefusal(ACCOUNT, 'smith');
    expect(again.enforcement.level).toBe('paused');
    expect(again.enforcement.pausedUntil).toBe(paused.enforcement.pausedUntil);
  });

  it('nothing more is stored once the account is blocked', async () => {
    await refuse(20);
    expect((await getAiChatStatus(ACCOUNT)).blocked).toBe(true);
    const before = db.refusals.length;
    await refuse(5);
    expect(db.refusals).toHaveLength(before);
  });
});

describe('why an account is blocked', () => {
  it('the ladder says refusals, a block by hand says operator, and unblocking forgets it', async () => {
    expect(await getAiBlockReason(ACCOUNT)).toBeNull();
    await refuse(20);
    expect(await getAiBlockReason(ACCOUNT)).toBe('refusals');
    await unblockAiChat(ACCOUNT);
    expect(await getAiBlockReason(ACCOUNT)).toBeNull();
    await setAiChatBlocked(ACCOUNT, true);
    expect(await getAiBlockReason(ACCOUNT)).toBe('operator');
  });

  it('a block from before the reason was kept counts as made by hand', async () => {
    db.consent = { consentAt: null, consentVersion: null, blocked: true, pausedUntil: null, reason: null };
    expect(await getAiBlockReason(ACCOUNT)).toBe('operator');
  });
});

describe('unblockAiChat (npm run ai:block -- <email> --unblock)', () => {
  it('clears the block and the pause, and forgets the declined requests', async () => {
    await refuse(10);
    await refuse(10);
    expect((await getAiChatStatus(ACCOUNT)).blocked).toBe(true);
    db.consent!.pausedUntil = new Date(Date.now() + 10 * HOUR);
    await unblockAiChat(ACCOUNT);
    const s = await getAiChatStatus(ACCOUNT);
    expect(s.blocked).toBe(false);
    expect(s.enforcement).toEqual({ level: 'ok', pausedUntil: null, refusals24h: 0, refusals30d: 0 });
    expect(db.refusals).toEqual([]);
    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });
});
