/**
 * In-App AI's consent, pause, block and declined requests, run against a real
 * Postgres: the statements in db/aiChatQueries.ts (the unit tests in
 * aiChatEnforcement.test.ts see them through a stand-in).
 *
 * Skipped unless TEST_DATABASE_URL names a database on this machine that has
 * the auth schema (`npx prisma db push` against it once):
 *
 *   TEST_DATABASE_URL=postgresql://test@127.0.0.1:5432/chronicles_test \
 *     npx vitest run src/__tests__/db/aiChat.db.test.ts
 *
 * It makes one account of its own and deletes it afterwards (its rows go with
 * it). It refuses any host but localhost.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const url = process.env.TEST_DATABASE_URL ?? '';
const local = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1)(:\d+)?\//.test(url);

vi.hoisted(() => {
  const test = process.env.TEST_DATABASE_URL ?? '';
  if (/^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1)(:\d+)?\//.test(test)) {
    process.env.DATABASE_URL = test;
    process.env.AI_USER_ID_SECRET = 'test-ai-user-secret';
    delete process.env.SHARD_DATABASE_URLS;
  }
});

describe.skipIf(!local)('In-App AI enforcement (real Postgres)', () => {
  type Queries = typeof import('../../db/aiChatQueries.js');
  let q: Queries;
  let prisma: typeof import('../../db/prisma.js')['prisma'];
  let accountId = 0;
  const tag = Math.random().toString(16).slice(2, 10);

  /** Declined requests made `hoursAgo` (straight into the table: the route only ever adds one now). */
  const pastRefusals = (n: number, hoursAgo: number) => prisma.$executeRawUnsafe(
    `INSERT INTO public.ai_refusals (account_id, at, app) SELECT $1, NOW() - make_interval(hours => $2::int), 'chronicles' FROM generate_series(1, $3::int)`,
    accountId, hoursAgo, n,
  );
  const clear = () => prisma.$executeRawUnsafe('DELETE FROM public.ai_refusals WHERE account_id = $1', accountId)
    .then(() => prisma.$executeRawUnsafe('DELETE FROM public.ai_chat_consent WHERE account_id = $1', accountId));

  beforeAll(async () => {
    q = await import('../../db/aiChatQueries.js');
    ({ prisma } = await import('../../db/prisma.js'));
    await q.initAiChatTable();
    await q.initAiChatTable(); // twice: every statement is safe to run again at each start
    const account = await prisma.account.create({
      data: { email: `ai-${tag}@example.test`, username: `ai_${tag}`, passwordHash: 'x', tenantSchemaName: `usr_ai_${tag}` },
    });
    accountId = account.id;
  });

  afterAll(async () => {
    if (accountId) await prisma.account.delete({ where: { id: accountId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('a fresh account is ok, with the anonymous id', async () => {
    const s = await q.getAiChatStatus(accountId);
    expect(s).toMatchObject({ consentAt: null, consentVersion: null, blocked: false, enforcement: { level: 'ok', pausedUntil: null, refusals24h: 0, refusals30d: 0 } });
    expect(s.aiUserId).toMatch(/^[0-9a-f]{32}$/);
  });

  it('4 → ok, 5 → warned, 10 → paused for a day', async () => {
    await clear();
    let s = await q.getAiChatStatus(accountId);
    for (let i = 1; i <= 10; i++) {
      // No dedupe window here: each is its own message
      s = await q.recordAiRefusal(accountId, i % 2 ? 'chronicles' : 'smith', 0);
      if (i === 4) expect(s.enforcement.level).toBe('ok');
      if (i === 5) expect(s.enforcement).toMatchObject({ level: 'warned', pausedUntil: null });
    }
    expect(s.enforcement).toMatchObject({ level: 'paused', refusals24h: 10, refusals30d: 10 });
    expect(Math.abs(Date.parse(s.enforcement.pausedUntil!) - (Date.now() + 24 * 3_600_000))).toBeLessThan(60_000);
    const apps = await prisma.$queryRawUnsafe<{ app: string; n: number }[]>(
      'SELECT app, COUNT(*)::int AS n FROM public.ai_refusals WHERE account_id = $1 GROUP BY app ORDER BY app', accountId);
    expect(apps).toEqual([{ app: 'chronicles', n: 5 }, { app: 'smith', n: 5 }]);
  });

  it('20 in 30 days → blocked, consent cleared', async () => {
    await clear();
    await q.saveAiChatConsent(accountId, 1);
    await pastRefusals(19, 24 * 10); // ten days ago: none in the last day
    const s = await q.recordAiRefusal(accountId, 'chronicles');
    expect(s).toMatchObject({ blocked: true, consentAt: null, consentVersion: null, enforcement: { level: 'blocked', refusals24h: 1, refusals30d: 20 } });
    expect((await q.getAiChatStatus(accountId)).enforcement.level).toBe('blocked');
  });

  it('declined requests older than 30 days are dropped and not counted', async () => {
    await clear();
    await pastRefusals(25, 24 * 31);
    const s = await q.recordAiRefusal(accountId, 'smith');
    expect(s.enforcement).toMatchObject({ level: 'ok', refusals24h: 1, refusals30d: 1 });
    const [{ n }] = await prisma.$queryRawUnsafe<{ n: number }[]>('SELECT COUNT(*)::int AS n FROM public.ai_refusals WHERE account_id = $1', accountId);
    expect(n).toBe(1);
  });

  it('an ended pause no longer shows', async () => {
    await clear();
    await q.pauseAiChat(accountId, -1000);
    expect((await q.getAiChatStatus(accountId)).enforcement).toMatchObject({ level: 'ok', pausedUntil: null });
  });

  it('unblocking clears the block, the pause and the declined requests', async () => {
    await clear();
    await pastRefusals(12, 1);
    await q.pauseAiChat(accountId);
    await q.setAiChatBlocked(accountId, true);
    await q.unblockAiChat(accountId);
    const s = await q.getAiChatStatus(accountId);
    expect(s.blocked).toBe(false);
    expect(s.enforcement).toEqual({ level: 'ok', pausedUntil: null, refusals24h: 0, refusals30d: 0 });
    const [{ paused }] = await prisma.$queryRawUnsafe<{ paused: Date | null }[]>('SELECT paused_until AS paused FROM public.ai_chat_consent WHERE account_id = $1', accountId);
    expect(paused).toBeNull();
  });

  it('one within the dedupe window of the last isn’t counted, and none while blocked', async () => {
    await clear();
    await q.recordAiRefusal(accountId, 'chronicles');
    const s = await q.recordAiRefusal(accountId, 'smith');
    expect(s.enforcement.refusals24h).toBe(1);
    await q.setAiChatBlocked(accountId, true, 'refusals');
    await q.recordAiRefusal(accountId, 'chronicles', 0);
    const [{ n }] = await prisma.$queryRawUnsafe<{ n: number }[]>('SELECT COUNT(*)::int AS n FROM public.ai_refusals WHERE account_id = $1', accountId);
    expect(n).toBe(1);
  });

  it('keeps why an account is blocked, and forgets it on unblock', async () => {
    await clear();
    await q.setAiChatBlocked(accountId, true);
    expect(await q.getAiBlockReason(accountId)).toBe('operator');
    await q.setAiChatBlocked(accountId, true, 'refusals');
    expect(await q.getAiBlockReason(accountId)).toBe('refusals');
    await q.unblockAiChat(accountId);
    expect(await q.getAiBlockReason(accountId)).toBeNull();
  });

  it('only the two apps are accepted by the table itself', async () => {
    await expect(prisma.$executeRawUnsafe(`INSERT INTO public.ai_refusals (account_id, app) VALUES ($1, 'other')`, accountId)).rejects.toThrow();
  });
});
