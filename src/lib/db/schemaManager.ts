import { Pool as NeonPool, PoolClient as NeonPoolClient, neonConfig } from '@neondatabase/serverless';
import { Pool as PgPool, PoolClient as PgPoolClient } from 'pg';
import crypto from 'crypto';
import ws from 'ws';

function getConnectionString(): string {
  // For raw SQL queries, we need the direct database connection (not Accelerate proxy)
  // DATABASE_URL = direct Neon connection
  // PRISMA_DATABASE_URL = Accelerate proxy (can't use for raw SQL)
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL not found. Raw SQL queries require a direct database connection.');
  }

  // If we somehow got an Accelerate URL, we can't use it for raw queries
  if (connectionString.includes('prisma://') || connectionString.includes('prisma-data.net')) {
    throw new Error('DATABASE_URL must be a direct PostgreSQL connection, not an Accelerate proxy URL.');
  }

  return connectionString;
}

function isNeonDatabase(): boolean {
  const connectionString = getConnectionString();
  return connectionString.includes('neon.tech') || connectionString.includes('neon.database');
}

// Use appropriate pool based on database type
type PoolClient = NeonPoolClient | PgPoolClient;

function createPool(): NeonPool | PgPool {
  const connectionString = getConnectionString();

  if (isNeonDatabase()) {
    // Configure Neon for serverless with WebSocket support
    neonConfig.webSocketConstructor = ws;
    neonConfig.poolQueryViaFetch = true;
    return new NeonPool({ connectionString });
  }

  // Standard pg Pool for local PostgreSQL
  return new PgPool({ connectionString });
}

const pool = createPool();

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
    // NOTE: plaintextContent stores DECRYPTED content - shared entries are PUBLIC
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."shared_entries" (
        id TEXT PRIMARY KEY,
        "entryId" TEXT NOT NULL REFERENCES "${schemaName}"."entries"(id) ON DELETE CASCADE,
        "shareToken" TEXT UNIQUE NOT NULL,
        "plaintextContent" TEXT NOT NULL,
        "expiresAt" TIMESTAMP,
        "viewCount" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Create calendar_events table (for calendar integration)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."calendar_events" (
        id TEXT PRIMARY KEY,
        "encryptedTitle" TEXT NOT NULL,
        "titleIv" TEXT NOT NULL,
        "encryptedDescription" TEXT,
        "descriptionIv" TEXT,
        "startDate" DATE NOT NULL,
        "startTime" TIME,
        "endDate" DATE,
        "endTime" TIME,
        "isAllDay" BOOLEAN NOT NULL DEFAULT false,
        "recurrenceRule" TEXT,
        "color" TEXT NOT NULL DEFAULT '#6366f1',
        "linkedEntryId" TEXT REFERENCES "${schemaName}"."entries"(id) ON DELETE SET NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Create medication_dose_logs table (for tracking taken medications)
    // takenAt is stored as a formatted local time string (e.g., "7:45 PM")
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."medication_dose_logs" (
        id TEXT PRIMARY KEY,
        "medicationId" TEXT NOT NULL REFERENCES "${schemaName}"."entries"(id) ON DELETE CASCADE,
        "scheduledTime" TIME NOT NULL,
        "takenAt" TEXT,
        "date" DATE NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'pending',
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Create favorites table (for favorite entries)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."favorites" (
        id TEXT PRIMARY KEY,
        "entryId" TEXT NOT NULL REFERENCES "${schemaName}"."entries"(id) ON DELETE CASCADE,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE("entryId")
      )
    `);

    // Create entry_images table (for image uploads)
    // Note: encryptedData is stored on filesystem, not in database
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."entry_images" (
        id TEXT PRIMARY KEY,
        "entryId" TEXT REFERENCES "${schemaName}"."entries"(id) ON DELETE CASCADE,
        "encryptedFilename" TEXT NOT NULL,
        "filenameIv" TEXT NOT NULL,
        "dataIv" TEXT NOT NULL,
        "mimeType" TEXT NOT NULL,
        "size" INTEGER NOT NULL,
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

    // Calendar events indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_calendar_start_date
      ON "${schemaName}"."calendar_events"("startDate")
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_calendar_date_range
      ON "${schemaName}"."calendar_events"("startDate", "endDate")
    `);

    // Medication dose logs indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dose_logs_date
      ON "${schemaName}"."medication_dose_logs"("date")
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dose_logs_medication
      ON "${schemaName}"."medication_dose_logs"("medicationId", "date")
    `);

    // Favorites indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_favorites_entry
      ON "${schemaName}"."favorites"("entryId")
    `);

    // Entry images indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_entry_images_entry
      ON "${schemaName}"."entry_images"("entryId")
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
 * Migrate shared_entries table to add plaintextContent column
 * This is needed for existing users who created schemas before this column was added
 */
export async function migrateSharedEntriesTable(schemaName: string): Promise<void> {
  const client = await pool.connect();
  try {
    // Check if column exists
    const columnCheck = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = 'shared_entries'
        AND column_name = 'plaintextContent'
    `, [schemaName]);

    if (columnCheck.rows.length === 0) {
      // Add the column - existing shares will have NULL until updated
      await client.query(`
        ALTER TABLE "${schemaName}"."shared_entries"
        ADD COLUMN IF NOT EXISTS "plaintextContent" TEXT
      `);
    }
  } finally {
    client.release();
  }
}

/**
 * Migrate entry_images table (create if not exists, or drop encryptedData column if exists)
 * This is needed for existing users who created schemas before this table was added
 * Note: encryptedData is now stored on filesystem, not in database
 */
export async function migrateEntryImagesTable(schemaName: string): Promise<void> {
  const client = await pool.connect();
  try {
    // Check if table exists
    const tableCheck = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = $1
        AND table_name = 'entry_images'
    `, [schemaName]);

    if (tableCheck.rows.length === 0) {
      // Create the table (encryptedData stored on filesystem, not in DB)
      await client.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}"."entry_images" (
          id TEXT PRIMARY KEY,
          "entryId" TEXT REFERENCES "${schemaName}"."entries"(id) ON DELETE CASCADE,
          "encryptedFilename" TEXT NOT NULL,
          "filenameIv" TEXT NOT NULL,
          "dataIv" TEXT NOT NULL,
          "mimeType" TEXT NOT NULL,
          "size" INTEGER NOT NULL,
          "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);

      // Create index
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_entry_images_entry
        ON "${schemaName}"."entry_images"("entryId")
      `);
    } else {
      // Table exists - check if it has the old encryptedData column and drop it
      try {
        const columnCheck = await client.query(`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = $1
            AND table_name = 'entry_images'
            AND column_name = 'encryptedData'
        `, [schemaName]);

        if (columnCheck.rows.length > 0) {
          // Drop the encryptedData column (data is now stored on filesystem)
          await client.query(`
            ALTER TABLE "${schemaName}"."entry_images"
            DROP COLUMN IF EXISTS "encryptedData"
          `);
        }
      } catch (alterError) {
        // Ignore errors when dropping column - table might be in use
        console.error('Error dropping encryptedData column:', alterError);
      }
    }
  } finally {
    client.release();
  }
}

/**
 * Migrate favorites table (create if not exists)
 * This is needed for existing users who created schemas before this table was added
 */
export async function migrateFavoritesTable(schemaName: string): Promise<void> {
  const client = await pool.connect();
  try {
    // Check if table exists
    const tableCheck = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = $1
        AND table_name = 'favorites'
    `, [schemaName]);

    if (tableCheck.rows.length === 0) {
      // Create the table
      await client.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}"."favorites" (
          id TEXT PRIMARY KEY,
          "entryId" TEXT NOT NULL REFERENCES "${schemaName}"."entries"(id) ON DELETE CASCADE,
          "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
          UNIQUE("entryId")
        )
      `);

      // Create index
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_favorites_entry
        ON "${schemaName}"."favorites"("entryId")
      `);
    }
  } finally {
    client.release();
  }
}

/**
 * Migrate medication_dose_logs table (create if not exists, or alter takenAt column type)
 * This is needed for existing users who created schemas before this table was added
 * takenAt is stored as a formatted local time string (e.g., "7:45 PM")
 */
export async function migrateMedicationDoseLogsTable(schemaName: string): Promise<void> {
  const client = await pool.connect();
  try {
    // Check if table exists
    const tableCheck = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = $1
        AND table_name = 'medication_dose_logs'
    `, [schemaName]);

    if (tableCheck.rows.length === 0) {
      // Create the table with takenAt as TEXT
      await client.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}"."medication_dose_logs" (
          id TEXT PRIMARY KEY,
          "medicationId" TEXT NOT NULL REFERENCES "${schemaName}"."entries"(id) ON DELETE CASCADE,
          "scheduledTime" TIME NOT NULL,
          "takenAt" TEXT,
          "date" DATE NOT NULL,
          "status" TEXT NOT NULL DEFAULT 'pending',
          "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);

      // Create indexes
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_dose_logs_date
        ON "${schemaName}"."medication_dose_logs"("date")
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_dose_logs_medication
        ON "${schemaName}"."medication_dose_logs"("medicationId", "date")
      `);
    } else {
      // Table exists - check if takenAt needs to be altered from TIMESTAMP to TEXT
      const columnCheck = await client.query(`
        SELECT data_type
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = 'medication_dose_logs'
          AND column_name = 'takenAt'
      `, [schemaName]);

      if (columnCheck.rows.length > 0 && columnCheck.rows[0].data_type !== 'text') {
        // Alter column type from TIMESTAMP to TEXT
        await client.query(`
          ALTER TABLE "${schemaName}"."medication_dose_logs"
          ALTER COLUMN "takenAt" TYPE TEXT
        `);
      }
    }
  } finally {
    client.release();
  }
}

/**
 * Migrate calendar_events table (create if not exists)
 * This is needed for existing users who created schemas before this table was added
 */
export async function migrateCalendarEventsTable(schemaName: string): Promise<void> {
  const client = await pool.connect();
  try {
    // Check if table exists
    const tableCheck = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = $1
        AND table_name = 'calendar_events'
    `, [schemaName]);

    if (tableCheck.rows.length === 0) {
      // Create the table
      await client.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}"."calendar_events" (
          id TEXT PRIMARY KEY,
          "encryptedTitle" TEXT NOT NULL,
          "titleIv" TEXT NOT NULL,
          "encryptedDescription" TEXT,
          "descriptionIv" TEXT,
          "startDate" DATE NOT NULL,
          "startTime" TIME,
          "endDate" DATE,
          "endTime" TIME,
          "isAllDay" BOOLEAN NOT NULL DEFAULT false,
          "recurrenceRule" TEXT,
          "color" TEXT NOT NULL DEFAULT '#6366f1',
          "linkedEntryId" TEXT REFERENCES "${schemaName}"."entries"(id) ON DELETE SET NULL,
          "encryptedLocation" TEXT,
          "locationIv" TEXT,
          "encryptedAddress" TEXT,
          "addressIv" TEXT,
          "encryptedPhone" TEXT,
          "phoneIv" TEXT,
          "encryptedNotes" TEXT,
          "notesIv" TEXT,
          "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);

      // Create indexes
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_calendar_start_date
        ON "${schemaName}"."calendar_events"("startDate")
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_calendar_date_range
        ON "${schemaName}"."calendar_events"("startDate", "endDate")
      `);
    } else {
      // Table exists, check for and add new columns if missing
      const columnCheck = await client.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = 'calendar_events'
          AND column_name = 'encryptedLocation'
      `, [schemaName]);

      if (columnCheck.rows.length === 0) {
        // Add the new columns for location, address, phone, notes
        await client.query(`
          ALTER TABLE "${schemaName}"."calendar_events"
          ADD COLUMN IF NOT EXISTS "encryptedLocation" TEXT,
          ADD COLUMN IF NOT EXISTS "locationIv" TEXT,
          ADD COLUMN IF NOT EXISTS "encryptedAddress" TEXT,
          ADD COLUMN IF NOT EXISTS "addressIv" TEXT,
          ADD COLUMN IF NOT EXISTS "encryptedPhone" TEXT,
          ADD COLUMN IF NOT EXISTS "phoneIv" TEXT,
          ADD COLUMN IF NOT EXISTS "encryptedNotes" TEXT,
          ADD COLUMN IF NOT EXISTS "notesIv" TEXT
        `);
      }
    }
  } finally {
    client.release();
  }
}

/**
 * Get pool for direct queries (useful for testing)
 */
export function getPool(): NeonPool | PgPool {
  return pool;
}
