import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/prisma.js', () => ({
  prisma: {
    $queryRaw: vi.fn(),
    $executeRawUnsafe: vi.fn(),
    account: {
      create: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from '../db/prisma.js';
import {
  registerTenant,
  deleteAccountById,
  generateSchemaName,
  generateTenantSchemaStatements,
  dropTenantSchema,
  tenantSchemaExists,
} from '../db/schemaManager.js';

const SCHEMA_NAME = /^usr_\d+_[a-f0-9]{6}$/;
const executed = () => (prisma.$executeRawUnsafe as any).mock.calls.map((c: unknown[]) => c[0] as string);

const encryptionParams = {
  kekSalt: new Uint8Array([1, 2]),
  encryptedMasterKey: new Uint8Array([3]),
  kekWrapIv: new Uint8Array([4]),
  recoveryWrappedMK: new Uint8Array([5]),
  recoveryWrapIv: new Uint8Array([6]),
  recoveryKeyHash: 'v2$abc',
  recoveryKeySalt: 'salt',
};

describe('schemaManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.$queryRaw as any).mockResolvedValue([{ current_number: 7 }]);
    (prisma.$executeRawUnsafe as any).mockResolvedValue(0);
    (prisma.account.delete as any).mockResolvedValue({});
    (prisma.account.create as any).mockImplementation(async ({ data }: any) => ({ id: 11, userId: 'u', createdAt: new Date(), ...data }));
  });

  describe('generateSchemaName', () => {
    it('uses the atomic counter plus a random suffix, never user data', async () => {
      const a = await generateSchemaName();
      const b = await generateSchemaName();
      expect(a).toMatch(/^usr_7_[a-f0-9]{6}$/);
      expect(b).toMatch(/^usr_7_[a-f0-9]{6}$/);
      expect(a).not.toBe(b);
    });

    it('falls back to 1 when the counter returns nothing', async () => {
      (prisma.$queryRaw as any).mockResolvedValue([]);
      expect(await generateSchemaName()).toMatch(/^usr_1_/);
    });
  });

  describe('generateTenantSchemaStatements', () => {
    it('creates every table inside the tenant schema', () => {
      const sql = generateTenantSchemaStatements('usr_3_abcdef').join('\n');
      expect(sql).toContain('CREATE SCHEMA usr_3_abcdef');
      for (const table of ['_migrations', 'settings', 'taxonomies', 'posts', 'post_taxonomies']) {
        expect(sql).toContain(`CREATE TABLE usr_3_abcdef.${table}`);
      }
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS usr_3_abcdef.medication_dose_records');
      // No plaintext dose log or default topic names for new accounts (the browser seeds topics, encrypted)
      expect(sql).not.toContain('medication_dose_logs');
      expect(sql).not.toContain('INSERT INTO usr_3_abcdef.taxonomies');
      expect(sql).toContain('usr_3_abcdef.finance_');
    });

    it('refuses a schema name that could inject SQL', () => {
      expect(() => generateTenantSchemaStatements('usr_1_abcdef; DROP SCHEMA public')).toThrow();
      expect(() => generateTenantSchemaStatements('public')).toThrow();
    });
  });

  describe('registerTenant', () => {
    it('creates the account with its encryption params, then its schema', async () => {
      const { account, schemaName } = await registerTenant('a@b.co', 'alex', 'auth1$hash', encryptionParams);

      expect(schemaName).toMatch(SCHEMA_NAME);
      expect(account).toMatchObject({ id: 11, email: 'a@b.co', username: 'alex', tenantSchemaName: schemaName, encryptionEnabled: true });
      expect(prisma.account.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ passwordHash: 'auth1$hash', recoveryKeyHash: 'v2$abc', tenantSchemaName: schemaName }),
      });
      expect(executed()[0]).toBe(`CREATE SCHEMA ${schemaName}`);
    });

    it('does not leak the password hash in its result', async () => {
      const { account } = await registerTenant('a@b.co', 'alex', 'auth1$hash', encryptionParams);
      expect(account).not.toHaveProperty('passwordHash');
      expect(account).not.toHaveProperty('recoveryKeyHash');
    });

    it('removes the half-made schema and the account when schema creation fails', async () => {
      (prisma.$executeRawUnsafe as any).mockImplementation(async (sql: string) => {
        if (sql.includes('.posts (')) throw new Error('db hiccup');
        return 0;
      });

      await expect(registerTenant('a@b.co', 'alex', 'auth1$hash', encryptionParams)).rejects.toThrow('db hiccup');

      const schemaName = (prisma.account.create as any).mock.calls[0][0].data.tenantSchemaName;
      expect(executed()).toContain(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
      expect(prisma.account.delete).toHaveBeenCalledWith({ where: { id: 11 } });
    });

    it('reports the original error even if the cleanup fails too', async () => {
      (prisma.$executeRawUnsafe as any).mockImplementation(async (sql: string) => {
        if (sql.startsWith('CREATE SCHEMA')) throw new Error('first failure');
        throw new Error('cleanup failure');
      });
      (prisma.account.delete as any).mockRejectedValue(new Error('delete failure'));

      await expect(registerTenant('a@b.co', 'alex', 'auth1$hash')).rejects.toThrow('first failure');
    });
  });

  describe('deleteAccountById', () => {
    it('drops the schema before deleting the account row', async () => {
      (prisma.account.findUnique as any).mockResolvedValue({ tenantSchemaName: 'usr_4_abcdef' });
      const order: string[] = [];
      (prisma.$executeRawUnsafe as any).mockImplementation(async (sql: string) => { order.push(sql); return 0; });
      (prisma.account.delete as any).mockImplementation(async () => { order.push('delete account'); });

      await deleteAccountById(4);

      expect(order).toEqual(['DROP SCHEMA IF EXISTS usr_4_abcdef CASCADE', 'delete account']);
      expect(prisma.account.delete).toHaveBeenCalledWith({ where: { id: 4 } });
    });

    it('keeps the account when dropping the schema fails', async () => {
      (prisma.account.findUnique as any).mockResolvedValue({ tenantSchemaName: 'usr_4_abcdef' });
      (prisma.$executeRawUnsafe as any).mockRejectedValue(new Error('locked'));

      await expect(deleteAccountById(4)).rejects.toThrow('locked');
      expect(prisma.account.delete).not.toHaveBeenCalled();
    });

    it('throws for an unknown account', async () => {
      (prisma.account.findUnique as any).mockResolvedValue(null);
      await expect(deleteAccountById(99)).rejects.toThrow('Account not found');
      expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
    });

    it('never drops a schema whose stored name is malformed', async () => {
      (prisma.account.findUnique as any).mockResolvedValue({ tenantSchemaName: 'public' });
      await expect(deleteAccountById(4)).rejects.toThrow();
      expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
    });
  });

  describe('dropTenantSchema / tenantSchemaExists', () => {
    it('refuses to drop anything but a tenant schema', async () => {
      await expect(dropTenantSchema('public')).rejects.toThrow();
      await expect(dropTenantSchema('usr_1_abcdef')).resolves.toBeUndefined();
      expect(executed()).toEqual(['DROP SCHEMA IF EXISTS usr_1_abcdef CASCADE']);
    });

    it('reports whether the schema exists', async () => {
      (prisma.$queryRaw as any).mockResolvedValue([{ exists: true }]);
      expect(await tenantSchemaExists('usr_1_abcdef')).toBe(true);
      (prisma.$queryRaw as any).mockResolvedValue([]);
      expect(await tenantSchemaExists('usr_1_abcdef')).toBe(false);
    });
  });
});
