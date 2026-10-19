import { describe, it, expect, vi } from 'vitest';

vi.mock('../db/prisma.js', () => ({ prisma: {} }));
import { dumpLockAdvice } from '../db/backupCheck.js';

const defaults = { maxLocks: 64, maxConnections: 100, maxPrepared: 0 };

describe('dumpLockAdvice', () => {
  it('stays quiet while tables are well within the lock table', () => {
    expect(dumpLockAdvice({ ...defaults, tables: 6000 })).toBeNull();
    expect(dumpLockAdvice({ ...defaults, tables: 9600 })).toBeNull();
  });

  it('warns from 1.5× capacity, suggesting room for twice the tables', () => {
    const advice = dumpLockAdvice({ ...defaults, tables: 12276 });
    expect(advice).toContain('12276 tables');
    expect(advice).toContain('6400 locks');
    // 12276 × 2 / 100 = 245.5 → next multiple of 64
    expect(advice).toContain('max_locks_per_transaction to at least 256');
  });

  it('counts prepared-transaction slots in the capacity', () => {
    expect(dumpLockAdvice({ ...defaults, maxPrepared: 100, tables: 12276 })).toBeNull();
  });
});
