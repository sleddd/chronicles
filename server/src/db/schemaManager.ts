import crypto from 'crypto';
import { prisma } from './prisma.js';
import { escapeSchema } from './escapeSchema.js';
import { financeTableStatements, doseRecordStatements } from './tenantQueries.js';

// =============================================================================
// Tenant Schema Manager
// =============================================================================

async function generateSchemaName(): Promise<string> {
  const randomSuffix = crypto.randomBytes(3).toString('hex');

  // Atomic increment + read via RETURNING to prevent race conditions
  const result = await prisma.$queryRaw<{ current_number: number }[]>`
    INSERT INTO schema_counter (id, current_number, updated_at)
    VALUES (1, 1, NOW())
    ON CONFLICT (id) DO UPDATE
    SET current_number = schema_counter.current_number + 1, updated_at = NOW()
    RETURNING current_number
  `;

  const currentNumber = Number(result[0]?.current_number) || 1;
  return `usr_${currentNumber}_${randomSuffix}`;
}

function generateTenantSchemaStatements(schemaName: string): string[] {
  const s = escapeSchema(schemaName);

  return [
    `CREATE SCHEMA ${s}`,

    // Migrations tracking table
    `CREATE TABLE ${s}._migrations (
      version INT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    // Settings table
    `CREATE TABLE ${s}.settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    // Taxonomies table
    // Topic name and icon live only in the encrypted payload (the browser
    // seeds the default topics, encrypted); name/icon are legacy columns
    `CREATE TABLE ${s}.taxonomies (
      id SERIAL PRIMARY KEY,
      name TEXT,
      icon TEXT,
      color VARCHAR(7),
      sort_order INTEGER DEFAULT 0,
      payload_encrypted BYTEA,
      payload_iv BYTEA
    )`,

    // Posts table (supports both plaintext and encrypted)
    `CREATE TABLE ${s}.posts (
      id SERIAL PRIMARY KEY,
      content TEXT,
      metadata JSONB DEFAULT '{}',
      content_encrypted BYTEA,
      content_iv BYTEA,
      metadata_encrypted BYTEA,
      metadata_iv BYTEA,
      is_encrypted BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    // Post-Taxonomy relationships
    `CREATE TABLE ${s}.post_taxonomies (
      post_id INTEGER REFERENCES ${s}.posts(id) ON DELETE CASCADE,
      tax_id INTEGER REFERENCES ${s}.taxonomies(id) ON DELETE CASCADE,
      PRIMARY KEY (post_id, tax_id)
    )`,

    // Medication dose records (encrypted payload per dose; only the day is readable)
    ...doseRecordStatements(s),

    // Finance records (encrypted payload per row)
    ...financeTableStatements(s),

    // Indexes
    `CREATE INDEX idx_${s}_posts_meta ON ${s}.posts USING GIN (metadata)`,
    `CREATE INDEX idx_${s}_posts_created ON ${s}.posts (created_at DESC)`,

    // Record initial schema version
    `INSERT INTO ${s}._migrations (version, name) VALUES (1, 'initial_schema')`,

  ];
}

async function createTenantSchema(schemaName: string): Promise<void> {
  const statements = generateTenantSchemaStatements(schemaName);
  for (const sql of statements) {
    await prisma.$executeRawUnsafe(sql);
  }
}

async function dropTenantSchema(schemaName: string): Promise<void> {
  const escaped = escapeSchema(schemaName);
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${escaped} CASCADE`);
}

async function tenantSchemaExists(schemaName: string): Promise<boolean> {
  const escaped = escapeSchema(schemaName);
  const result = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.schemata
      WHERE schema_name = ${escaped}
    ) as exists
  `;
  return result[0]?.exists || false;
}

// =============================================================================
// Registration
// =============================================================================

export interface EncryptionSetupParams {
  kekSalt: Uint8Array;
  encryptedMasterKey: Uint8Array;
  kekWrapIv: Uint8Array;
  recoveryWrappedMK: Uint8Array;
  recoveryWrapIv: Uint8Array;
  recoveryKeyHash: string;
  recoveryKeySalt: string;
}

export async function registerTenant(
  email: string,
  username: string,
  passwordHash: string,
  encryptionParams?: EncryptionSetupParams
) {
  const schemaName = await generateSchemaName();

  const account = await prisma.account.create({
    data: {
      email,
      username,
      passwordHash,
      tenantSchemaName: schemaName,
      ...(encryptionParams && {
        kekSalt: new Uint8Array(encryptionParams.kekSalt) as Uint8Array<ArrayBuffer>,
        encryptedMasterKey: new Uint8Array(encryptionParams.encryptedMasterKey) as Uint8Array<ArrayBuffer>,
        kekWrapIv: new Uint8Array(encryptionParams.kekWrapIv) as Uint8Array<ArrayBuffer>,
        recoveryWrappedMK: new Uint8Array(encryptionParams.recoveryWrappedMK) as Uint8Array<ArrayBuffer>,
        recoveryWrapIv: new Uint8Array(encryptionParams.recoveryWrapIv) as Uint8Array<ArrayBuffer>,
        recoveryKeyHash: encryptionParams.recoveryKeyHash,
        recoveryKeySalt: encryptionParams.recoveryKeySalt,
        encryptionEnabled: true,
      }),
    },
  });

  // DDL can't share a Prisma transaction with the account insert, so undo by
  // hand: a half-made schema would leave an account that can't be used and an
  // email that can never register again
  try {
    await createTenantSchema(schemaName);
  } catch (err) {
    await dropTenantSchema(schemaName).catch(() => {});
    await prisma.account.delete({ where: { id: account.id } }).catch(() => {});
    throw err;
  }

  return {
    account: {
      id: account.id,
      userId: account.userId,
      email: account.email,
      username: account.username,
      tenantSchemaName: account.tenantSchemaName,
      createdAt: account.createdAt,
      encryptionEnabled: account.encryptionEnabled,
    },
    schemaName,
  };
}

export async function deleteTenant(userId: string): Promise<void> {
  const account = await prisma.account.findUnique({ where: { userId } });
  if (!account) throw new Error('Account not found');
  // Drop schema and delete account in sequence — schema drop is DDL (can't be in Prisma transaction)
  // but we delete the account only if schema drop succeeds
  await dropTenantSchema(account.tenantSchemaName);
  await prisma.account.delete({ where: { userId } });
}

/** Delete an account by id: its tenant schema first, then the account row
 *  (sessions, shares and the calendar integration cascade). */
export async function deleteAccountById(accountId: number): Promise<void> {
  const account = await prisma.account.findUnique({ where: { id: accountId }, select: { tenantSchemaName: true } });
  if (!account) throw new Error('Account not found');
  await dropTenantSchema(account.tenantSchemaName);
  await prisma.account.delete({ where: { id: accountId } });
}

export async function getTenantSchema(userId: string): Promise<string | null> {
  const account = await prisma.account.findUnique({
    where: { userId },
    select: { tenantSchemaName: true },
  });
  return account?.tenantSchemaName || null;
}

export {
  escapeSchema,
  generateSchemaName,
  generateTenantSchemaStatements,
  createTenantSchema,
  dropTenantSchema,
  tenantSchemaExists,
};
