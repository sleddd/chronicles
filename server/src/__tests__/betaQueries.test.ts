import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

const { queryRaw, executeRaw } = vi.hoisted(() => ({ queryRaw: vi.fn(), executeRaw: vi.fn() }));
vi.mock('../db/prisma.js', () => ({ prisma: { $queryRaw: queryRaw, $executeRaw: executeRaw } }));

import { printable, approve, isApproved, INVITE_CODE_PATTERN } from '../db/betaQueries.js';

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
// Tagged-template calls: [strings, ...values]
const values = (call: unknown[]) => call.slice(1);

describe('beta invite codes', () => {
  beforeEach(() => { queryRaw.mockReset(); executeRaw.mockReset(); });

  it('approve issues a fresh 128-bit code and stores only its hash', async () => {
    executeRaw.mockResolvedValue(1);
    const a = await approve(' Ann@Example.com ');
    const b = await approve('ann@example.com');
    expect(a.how).toBe('approved');
    expect(a.inviteCode).toMatch(INVITE_CODE_PATTERN);
    expect(a.inviteCode).not.toBe(b.inviteCode);
    const stored = values(executeRaw.mock.calls[0]);
    expect(stored).toEqual([sha256(a.inviteCode), 'ann@example.com']);
    expect(stored).not.toContain(a.inviteCode);
  });

  it('adds someone who never applied as an invite', async () => {
    executeRaw.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    const r = await approve('new@example.com');
    expect(r.how).toBe('invited');
    expect(values(executeRaw.mock.calls[1])).toEqual(['new@example.com', sha256(r.inviteCode)]);
  });

  it('isApproved needs the matching code — an approved email alone is not enough', async () => {
    const code = 'A'.repeat(22);
    queryRaw.mockResolvedValue([{ invite_hash: sha256(code) }]);
    expect(await isApproved('ann@example.com', code)).toBe(true);
    expect(await isApproved('ann@example.com', 'B'.repeat(22))).toBe(false);
    expect(await isApproved('ann@example.com', undefined)).toBe(false);
  });

  it('refuses an approval with no code issued, and a malformed code without asking the database', async () => {
    queryRaw.mockResolvedValue([{ invite_hash: null }]);
    expect(await isApproved('ann@example.com', 'A'.repeat(22))).toBe(false);
    queryRaw.mockClear();
    expect(await isApproved('ann@example.com', 'short')).toBe(false);
    expect(queryRaw).not.toHaveBeenCalled();
  });
});

describe('printable (npm run beta output)', () => {
  it('removes terminal escapes, C0/C1 controls and bidi overrides', () => {
    expect(printable('Ann\u001b[2J\u001b]0;pwned\u0007 Lee')).toBe('Ann[2J]0;pwned Lee');
    expect(printable('a\r\nb\tc\u007f\u0085\u009bd')).toBe('abcd');
    expect(printable('evil\u202egnp.exe\u2066x\u2069')).toBe('evilgnp.exex');
  });

  it('keeps ordinary names, accents and emoji', () => {
    expect(printable('José Ñúñez-O’Brien 🌱')).toBe('José Ñúñez-O’Brien 🌱');
  });
});
