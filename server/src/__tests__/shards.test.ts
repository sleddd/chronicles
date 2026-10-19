import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mainClient, findUnique, groupBy, createPooledClient } = vi.hoisted(() => {
  const findUnique = vi.fn();
  const groupBy = vi.fn();
  return {
    findUnique,
    groupBy,
    mainClient: { name: 'main', account: { findUnique, groupBy } },
    createPooledClient: vi.fn((url: string) => ({ name: url })),
  };
});
vi.mock('../db/prisma.js', () => ({ prisma: mainClient, createPooledClient }));

async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  return import('../db/shards.js');
}

beforeEach(() => { findUnique.mockReset(); groupBy.mockReset(); createPooledClient.mockClear(); });
afterEach(() => { delete process.env.SHARD_DATABASE_URLS; delete process.env.SHARD_CAPACITY; });

const TWO = '2=postgresql://db2/x 3=postgresql://db3/x';

describe('shards', () => {
  it('with one database, every user is on the main client and nothing is looked up', async () => {
    const shards = await load({ SHARD_DATABASE_URLS: undefined });
    expect(await shards.tenantDb('usr_1_abcdef')).toBe(mainClient);
    expect(await shards.shardForNewAccount()).toBe(1);
    expect(shards.shardIds()).toEqual([1]);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("routes a schema to its account's shard, looking it up once", async () => {
    const shards = await load({ SHARD_DATABASE_URLS: TWO });
    findUnique.mockResolvedValue({ shardId: 3 });
    const db = await shards.tenantDb('usr_9_abcdef');
    expect(db).toEqual({ name: 'postgresql://db3/x' });
    expect(await shards.tenantDb('usr_9_abcdef')).toBe(db);
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(findUnique.mock.calls[0][0].where).toEqual({ tenantSchemaName: 'usr_9_abcdef' });

    shards.forgetTenant('usr_9_abcdef');
    await shards.tenantDb('usr_9_abcdef');
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it('refuses an unknown schema rather than guessing a database', async () => {
    const shards = await load({ SHARD_DATABASE_URLS: TWO });
    findUnique.mockResolvedValue(null);
    await expect(shards.tenantDb('usr_9_abcdef')).rejects.toThrow('No account');
    await expect(shards.tenantDb('not a schema')).rejects.toThrow();
  });

  it('puts new accounts on the first shard with room, else the least full', async () => {
    const shards = await load({ SHARD_DATABASE_URLS: TWO, SHARD_CAPACITY: '100' });
    const counts = (a: number, b: number, c: number) => [
      { shardId: 1, _count: { _all: a } }, { shardId: 2, _count: { _all: b } }, { shardId: 3, _count: { _all: c } },
    ];
    groupBy.mockResolvedValueOnce(counts(40, 0, 0));
    expect(await shards.shardForNewAccount()).toBe(1);
    groupBy.mockResolvedValueOnce(counts(100, 99, 0));
    expect(await shards.shardForNewAccount()).toBe(2);
    groupBy.mockResolvedValueOnce([{ shardId: 1, _count: { _all: 100 } }, { shardId: 2, _count: { _all: 100 } }]);
    expect(await shards.shardForNewAccount()).toBe(3); // shard 3 has no accounts yet
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    groupBy.mockResolvedValueOnce(counts(150, 120, 130));
    expect(await shards.shardForNewAccount()).toBe(2);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('rejects malformed shard settings', async () => {
    await expect(load({ SHARD_DATABASE_URLS: 'postgresql://db2/x' })).rejects.toThrow('<id>=postgresql');
    await expect(load({ SHARD_DATABASE_URLS: '1=postgresql://db/x' })).rejects.toThrow('shard 1 is DATABASE_URL');
    await expect(load({ SHARD_DATABASE_URLS: '2=postgresql://a/x;2=postgresql://b/x' })).rejects.toThrow('twice');
  });

  it('refuses a shard id that is not configured', async () => {
    const shards = await load({ SHARD_DATABASE_URLS: TWO });
    expect(() => shards.shardClient(7)).toThrow('Shard 7 is not configured');
  });
});
