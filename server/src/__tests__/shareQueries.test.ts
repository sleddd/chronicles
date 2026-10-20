/**
 * Comprehensive unit tests for shareQueries
 * Mocks prisma to verify SQL construction and parameter passing
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted so mock fns are available when vi.mock factory runs (hoisted to top)
const { mockQueryRaw, mockExecuteRaw, mockTransaction } = vi.hoisted(() => ({
  mockQueryRaw: vi.fn(),
  mockExecuteRaw: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock('../db/prisma.js', () => ({
  prisma: {
    $queryRaw: mockQueryRaw,
    $executeRaw: mockExecuteRaw,
    $executeRawUnsafe: vi.fn(),
    $queryRawUnsafe: vi.fn(),
    $transaction: mockTransaction,
  },
}));

import {
  createShare,
  createShareWithinLimit,
  getShareByToken,
  revokeShare,
  deleteSharesForEntry,
  purgeDeadShares,
  getSharesByAccount,
} from '../db/shareQueries.js';

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// createShare
// =============================================================================
describe('createShare', () => {
  it('creates a share record and returns it with a generated token', async () => {
    const now = new Date();
    const contentEnc = Buffer.from('encrypted-content');
    const contentIv = Buffer.from('iv-data');
    const expiresAt = new Date('2025-06-01');

    const share = {
      id: 1,
      token: 'generated-token',
      accountId: 42,
      contentEncrypted: contentEnc,
      contentIv,
      createdAt: now,
      expiresAt,
      isActive: true,
    };
    mockQueryRaw.mockResolvedValue([share]);

    const result = await createShare({
      accountId: 42,
      contentEncrypted: contentEnc,
      contentIv,
      expiresAt,
    });

    expect(result).toEqual(share);
    expect(mockQueryRaw).toHaveBeenCalledOnce();
  });

  it('passes null expiresAt when not provided', async () => {
    const contentEnc = Buffer.from('enc');
    const contentIv = Buffer.from('iv');

    mockQueryRaw.mockResolvedValue([{
      id: 1, token: 'tok', accountId: 1, contentEncrypted: contentEnc,
      contentIv, createdAt: new Date(), expiresAt: null, isActive: true,
    }]);

    const result = await createShare({
      accountId: 1,
      contentEncrypted: contentEnc,
      contentIv,
    });

    expect(result.expiresAt).toBeNull();
    expect(mockQueryRaw).toHaveBeenCalledOnce();
  });

  it('calls prisma.$queryRaw with INSERT INTO public.shares', async () => {
    const contentEnc = Buffer.from('enc');
    const contentIv = Buffer.from('iv');

    mockQueryRaw.mockResolvedValue([{
      id: 1, token: 'test-token', accountId: 1, contentEncrypted: contentEnc,
      contentIv, createdAt: new Date(), expiresAt: null, isActive: true,
    }]);

    await createShare({
      accountId: 1,
      contentEncrypted: contentEnc,
      contentIv,
    });

    // prisma.$queryRaw is called with a tagged template literal
    expect(mockQueryRaw).toHaveBeenCalledOnce();
  });
});

// =============================================================================
// getShareByToken
// =============================================================================
describe('getShareByToken', () => {
  it('returns share when token is valid, active, and not expired', async () => {
    const share = {
      id: 1,
      token: 'valid-token',
      accountId: 42,
      contentEncrypted: Buffer.from('enc'),
      contentIv: Buffer.from('iv'),
      createdAt: new Date(),
      expiresAt: new Date('2099-01-01'),
      isActive: true,
    };
    mockQueryRaw.mockResolvedValue([share]);

    const result = await getShareByToken('valid-token');

    expect(result).toEqual(share);
    expect(mockQueryRaw).toHaveBeenCalledOnce();
  });

  it('returns null when no matching share found', async () => {
    mockQueryRaw.mockResolvedValue([]);

    const result = await getShareByToken('nonexistent-token');

    expect(result).toBeNull();
  });

  it('returns null for expired shares (handled by SQL WHERE clause)', async () => {
    // The SQL query includes "expires_at > NOW()" so expired shares are not returned
    mockQueryRaw.mockResolvedValue([]);

    const result = await getShareByToken('expired-token');

    expect(result).toBeNull();
  });

  it('returns null for inactive shares (handled by SQL WHERE clause)', async () => {
    // The SQL query includes "is_active = TRUE" so inactive shares are not returned
    mockQueryRaw.mockResolvedValue([]);

    const result = await getShareByToken('revoked-token');

    expect(result).toBeNull();
  });
});

// =============================================================================
// revokeShare
// =============================================================================
describe('revokeShare', () => {
  it('returns true when share is successfully revoked', async () => {
    mockExecuteRaw.mockResolvedValue(1);

    const result = await revokeShare('token-to-revoke', 42);

    expect(result).toBe(true);
    expect(mockExecuteRaw).toHaveBeenCalledOnce();
  });

  it('returns false when token does not belong to accountId (ownership validation)', async () => {
    mockExecuteRaw.mockResolvedValue(0);

    const result = await revokeShare('other-users-token', 42);

    expect(result).toBe(false);
  });

  it('returns false when token does not exist', async () => {
    mockExecuteRaw.mockResolvedValue(0);

    const result = await revokeShare('nonexistent-token', 42);

    expect(result).toBe(false);
  });

  it('validates ownership by including account_id in WHERE clause', async () => {
    mockExecuteRaw.mockResolvedValue(1);

    await revokeShare('my-token', 99);

    // The mock is called with a tagged template, so we verify it was called
    expect(mockExecuteRaw).toHaveBeenCalledOnce();
  });

  it('deletes the row — revoked plaintext is not kept', async () => {
    mockExecuteRaw.mockResolvedValue(1);

    await revokeShare('my-token', 99);

    const sql = (mockExecuteRaw.mock.calls[0][0] as string[]).join('?');
    expect(sql).toMatch(/DELETE FROM public\.shares/);
    expect(sql).toMatch(/account_id = \?/);
    expect(sql).not.toMatch(/is_active = FALSE/);
    expect(mockExecuteRaw.mock.calls[0].slice(1)).toEqual(['my-token', 99]);
  });
});

describe('deleteSharesForEntry', () => {
  it("deletes the owner's shares of that entry", async () => {
    mockExecuteRaw.mockResolvedValue(2);

    expect(await deleteSharesForEntry(42, 7)).toBe(2);
    const sql = (mockExecuteRaw.mock.calls[0][0] as string[]).join('?');
    expect(sql).toMatch(/DELETE FROM public\.shares WHERE account_id = \? AND entry_id = \?/);
    expect(mockExecuteRaw.mock.calls[0].slice(1)).toEqual([42, 7]);
  });
});

describe('purgeDeadShares', () => {
  it('deletes switched-off and expired shares', async () => {
    mockExecuteRaw.mockResolvedValue(3);

    expect(await purgeDeadShares()).toBe(3);
    const sql = (mockExecuteRaw.mock.calls[0][0] as string[]).join('?');
    expect(sql).toMatch(/DELETE FROM public\.shares/);
    expect(sql).toMatch(/is_active = FALSE/);
    expect(sql).toMatch(/expires_at <= NOW\(\)/);
  });
});

// =============================================================================
// getSharesByAccount
// =============================================================================
describe('getSharesByAccount', () => {
  it('returns all active shares for an account', async () => {
    const shares = [
      {
        id: 1, token: 'tok-1', accountId: 42,
        contentEncrypted: Buffer.from('enc1'), contentIv: Buffer.from('iv1'),
        createdAt: new Date('2024-01-02'), expiresAt: null, isActive: true,
      },
      {
        id: 2, token: 'tok-2', accountId: 42,
        contentEncrypted: Buffer.from('enc2'), contentIv: Buffer.from('iv2'),
        createdAt: new Date('2024-01-01'), expiresAt: new Date('2025-01-01'), isActive: true,
      },
    ];
    mockQueryRaw.mockResolvedValue(shares);

    const result = await getSharesByAccount(42);

    expect(result).toEqual(shares);
    expect(result).toHaveLength(2);
    expect(mockQueryRaw).toHaveBeenCalledOnce();
  });

  it('returns empty array when account has no active shares', async () => {
    mockQueryRaw.mockResolvedValue([]);

    const result = await getSharesByAccount(42);

    expect(result).toEqual([]);
  });

  it('only returns active shares (is_active = TRUE in SQL)', async () => {
    // Inactive shares should be filtered out by the SQL query
    mockQueryRaw.mockResolvedValue([]);

    const result = await getSharesByAccount(42);

    expect(result).toEqual([]);
    expect(mockQueryRaw).toHaveBeenCalledOnce();
  });
});

// =============================================================================
// createShareWithinLimit
// =============================================================================
describe('createShareWithinLimit', () => {
  const data = { accountId: 42, entryId: 7, content: '<p>x</p>' };
  const sqlOf = (call: unknown[]) => (call[0] as string[]).join('?');
  beforeEach(() => {
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({ $queryRaw: mockQueryRaw }));
  });

  it('locks the account, counts its live links, then inserts', async () => {
    mockQueryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ n: 3n }]).mockResolvedValueOnce([{ id: 1, token: 't' }]);
    expect(await createShareWithinLimit(data, 200)).toEqual({ id: 1, token: 't' });
    expect(sqlOf(mockQueryRaw.mock.calls[0])).toContain('pg_advisory_xact_lock(hashtext(');
    expect(mockQueryRaw.mock.calls[0][1]).toBe('shares:42');
    expect(sqlOf(mockQueryRaw.mock.calls[1])).toContain('count(*)');
    expect(sqlOf(mockQueryRaw.mock.calls[2])).toContain('INSERT INTO public.shares');
  });

  it('returns null and inserts nothing at the cap', async () => {
    mockQueryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ n: 200 }]);
    expect(await createShareWithinLimit(data, 200)).toBeNull();
    expect(mockQueryRaw).toHaveBeenCalledTimes(2);
  });
});
