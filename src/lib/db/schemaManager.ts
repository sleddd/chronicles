import { Pool, PoolClient } from 'pg';
import crypto from 'crypto';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Generate unique schema name: chronicles_<random_6_char>_<auto_increment>
 */
async function generateSchemaName(client: PoolClient): Promise<string> {
  const randomPrefix = crypto.randomBytes(3).toString('hex'); // 6 chars

  // Ensure schema_counter has an entry
  await client.query(`
    INSERT INTO auth.schema_counter (id, "currentNumber", "updatedAt")
    VALUES (1, 0, NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  // Atomic counter increment
  const result = await client.query(`
    UPDATE auth.schema_counter
    SET "currentNumber" = "currentNumber" + 1, "updatedAt" = NOW()
    WHERE id = 1
    RETURNING "currentNumber"
  `);

  const counter = result.rows[0]?.currentNumber || 1;
  return `chronicles_${randomPrefix}_${counter}`;
}

/**
 * Create a new PostgreSQL schema for a user
 * Creates all tables per ARCHITECTURE.md specification
 */
export async function createUserSchema(): Promise<string> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const schemaName = await generateSchemaName(client);

    // Create schema
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

    // Create topics table (encrypted names with SSE tokens)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."topics" (
        id TEXT PRIMARY KEY,
        "encryptedName" TEXT NOT NULL,
        iv TEXT NOT NULL,
        "nameToken" TEXT UNIQUE NOT NULL,
        color TEXT NOT NULL DEFAULT '#6366f1',
        icon TEXT,
        "sortOrder" INTEGER NOT NULL DEFAULT 0
      )
    `);

    // Create entries table (core content with customType for WordPress-style flexibility)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."entries" (
        id TEXT PRIMARY KEY,
        "topicId" TEXT REFERENCES "${schemaName}"."topics"(id),
        "encryptedContent" TEXT NOT NULL,
        iv TEXT NOT NULL,
        "searchTokens" TEXT[] DEFAULT '{}',
        "customType" TEXT,
        "entryDate" DATE NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Create custom_fields table (WordPress-style metadata for type-specific data)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."custom_fields" (
        id TEXT PRIMARY KEY,
        "entryId" TEXT NOT NULL REFERENCES "${schemaName}"."entries"(id) ON DELETE CASCADE,
        "encryptedData" TEXT NOT NULL,
        iv TEXT NOT NULL
      )
    `);

    // Create entry_relationships table (for linking entries, e.g., goal → milestones)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."entry_relationships" (
        id TEXT PRIMARY KEY,
        "entryId" TEXT NOT NULL REFERENCES "${schemaName}"."entries"(id) ON DELETE CASCADE,
        "relatedToId" TEXT NOT NULL REFERENCES "${schemaName}"."entries"(id) ON DELETE CASCADE,
        "relationshipType" TEXT NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Create user_settings table (feature toggles for optional topics)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."user_settings" (
        id TEXT PRIMARY KEY,
        "foodEnabled" BOOLEAN NOT NULL DEFAULT false,
        "medicationEnabled" BOOLEAN NOT NULL DEFAULT false,
        "goalsEnabled" BOOLEAN NOT NULL DEFAULT false,
        "milestonesEnabled" BOOLEAN NOT NULL DEFAULT false,
        timezone TEXT NOT NULL DEFAULT 'UTC',
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Create shared_entries table (for sharing entries via link)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."shared_entries" (
        id TEXT PRIMARY KEY,
        "entryId" TEXT NOT NULL REFERENCES "${schemaName}"."entries"(id) ON DELETE CASCADE,
        "shareToken" TEXT UNIQUE NOT NULL,
        "expiresAt" TIMESTAMP,
        "viewCount" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Add indexes for performance (per ARCHITECTURE.md)
    // Entries indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_entries_date
      ON "${schemaName}"."entries"("entryDate")
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_entries_topic
      ON "${schemaName}"."entries"("topicId")
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_entries_custom_type
      ON "${schemaName}"."entries"("customType")
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_entries_date_type
      ON "${schemaName}"."entries"("entryDate", "customType")
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_entries_search_tokens
      ON "${schemaName}"."entries" USING GIN("searchTokens")
    `);

    // Custom fields index
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_custom_fields_entry
      ON "${schemaName}"."custom_fields"("entryId")
    `);

    // Shared entries indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_shared_token
      ON "${schemaName}"."shared_entries"("shareToken")
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_shared_expires
      ON "${schemaName}"."shared_entries"("expiresAt")
    `);

    await client.query('COMMIT');
    return schemaName;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Encrypted topic data structure for seeding
 */
export interface EncryptedTopic {
  id: string;
  encryptedName: string;
  iv: string;
  nameToken: string;
  color: string;
  icon: string | null;
}

/**
 * Seed default topics for a new user
 * Topic names must be encrypted client-side before calling this
 */
export async function seedDefaultTopics(
  schemaName: string,
  encryptedTopics: EncryptedTopic[]
): Promise<void> {
  const client = await pool.connect();

  try {
    for (const topic of encryptedTopics) {
      await client.query(
        `
        INSERT INTO "${schemaName}"."topics" (id, "encryptedName", iv, "nameToken", color, icon)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT ("nameToken") DO NOTHING
      `,
        [topic.id, topic.encryptedName, topic.iv, topic.nameToken, topic.color, topic.icon]
      );
    }

    // Create default user settings
    await client.query(`
      INSERT INTO "${schemaName}"."user_settings" (id, "foodEnabled", "medicationEnabled", "goalsEnabled", "milestonesEnabled", "createdAt", "updatedAt")
      VALUES ('settings_default', false, false, false, false, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `);
  } finally {
    client.release();
  }
}

/**
 * Delete a user schema (for account deletion)
 */
export async function deleteUserSchema(schemaName: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  } finally {
    client.release();
  }
}

/**
 * Check if a schema exists
 */
export async function schemaExists(schemaName: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name = $1
    `,
      [schemaName]
    );
    return result.rows.length > 0;
  } finally {
    client.release();
  }
}

/**
 * Get pool for direct queries (useful for testing)
 */
export function getPool(): Pool {
  return pool;
}
