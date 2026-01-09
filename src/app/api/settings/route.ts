import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { Pool } from 'pg';
import { z } from 'zod';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const updateSettingsSchema = z.object({
  foodEnabled: z.boolean().optional(),
  medicationEnabled: z.boolean().optional(),
  goalsEnabled: z.boolean().optional(),
  milestonesEnabled: z.boolean().optional(),
  exerciseEnabled: z.boolean().optional(),
  allergiesEnabled: z.boolean().optional(),
  timezone: z.string().optional(),
  headerColor: z.string().optional(),
  backgroundImage: z.string().optional(),
});

// GET /api/settings - Get user settings
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = await pool.connect();
  try {
    // Ensure table and columns exist (migration for existing users)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${session.user.schemaName}"."user_settings" (
        id TEXT PRIMARY KEY,
        "foodEnabled" BOOLEAN NOT NULL DEFAULT false,
        "medicationEnabled" BOOLEAN NOT NULL DEFAULT false,
        "goalsEnabled" BOOLEAN NOT NULL DEFAULT false,
        "milestonesEnabled" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Add columns if they don't exist (for users with old schema)
    const booleanColumns = ['foodEnabled', 'medicationEnabled', 'goalsEnabled', 'milestonesEnabled', 'exerciseEnabled', 'allergiesEnabled'];
    for (const col of booleanColumns) {
      await client.query(`
        DO $$ BEGIN
          ALTER TABLE "${session.user.schemaName}"."user_settings"
          ADD COLUMN "${col}" BOOLEAN NOT NULL DEFAULT false;
        EXCEPTION
          WHEN duplicate_column THEN NULL;
        END $$;
      `);
    }

    // Add timezone column if it doesn't exist
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE "${session.user.schemaName}"."user_settings"
        ADD COLUMN timezone TEXT NOT NULL DEFAULT 'UTC';
      EXCEPTION
        WHEN duplicate_column THEN NULL;
      END $$;
    `);

    // Add headerColor column if it doesn't exist
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE "${session.user.schemaName}"."user_settings"
        ADD COLUMN "headerColor" TEXT NOT NULL DEFAULT '#2d2c2a';
      EXCEPTION
        WHEN duplicate_column THEN NULL;
      END $$;
    `);

    // Add backgroundImage column if it doesn't exist
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE "${session.user.schemaName}"."user_settings"
        ADD COLUMN "backgroundImage" TEXT NOT NULL DEFAULT '';
      EXCEPTION
        WHEN duplicate_column THEN NULL;
      END $$;
    `);

    // Ensure settings row exists
    await client.query(`
      INSERT INTO "${session.user.schemaName}"."user_settings"
      (id, "foodEnabled", "medicationEnabled", "goalsEnabled", "milestonesEnabled", "exerciseEnabled", "allergiesEnabled", timezone, "headerColor", "backgroundImage", "createdAt", "updatedAt")
      VALUES ('settings_default', false, false, false, false, false, false, 'UTC', '#2d2c2a', '', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `);

    const result = await client.query(`
      SELECT "foodEnabled", "medicationEnabled", "goalsEnabled", "milestonesEnabled", "exerciseEnabled", "allergiesEnabled", timezone, "headerColor", "backgroundImage"
      FROM "${session.user.schemaName}"."user_settings"
      WHERE id = 'settings_default'
    `);

    if (result.rows.length === 0) {
      return NextResponse.json({
        settings: {
          foodEnabled: false,
          medicationEnabled: false,
          goalsEnabled: false,
          milestonesEnabled: false,
          exerciseEnabled: false,
          allergiesEnabled: false,
          timezone: 'UTC',
          headerColor: '#2d2c2a',
          backgroundImage: '',
        },
      });
    }

    return NextResponse.json({ settings: result.rows[0] });
  } finally {
    client.release();
  }
}

// PATCH /api/settings - Update user settings
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validatedData = updateSettingsSchema.parse(body);

    const client = await pool.connect();
    try {
      // Build dynamic update query
      const updates: string[] = [];
      const values: (boolean | string)[] = [];
      let paramIndex = 1;

      if (validatedData.foodEnabled !== undefined) {
        updates.push(`"foodEnabled" = $${paramIndex++}`);
        values.push(validatedData.foodEnabled);
      }
      if (validatedData.medicationEnabled !== undefined) {
        updates.push(`"medicationEnabled" = $${paramIndex++}`);
        values.push(validatedData.medicationEnabled);
      }
      if (validatedData.goalsEnabled !== undefined) {
        updates.push(`"goalsEnabled" = $${paramIndex++}`);
        values.push(validatedData.goalsEnabled);
      }
      if (validatedData.milestonesEnabled !== undefined) {
        updates.push(`"milestonesEnabled" = $${paramIndex++}`);
        values.push(validatedData.milestonesEnabled);
      }
      if (validatedData.exerciseEnabled !== undefined) {
        updates.push(`"exerciseEnabled" = $${paramIndex++}`);
        values.push(validatedData.exerciseEnabled);
      }
      if (validatedData.allergiesEnabled !== undefined) {
        updates.push(`"allergiesEnabled" = $${paramIndex++}`);
        values.push(validatedData.allergiesEnabled);
      }
      if (validatedData.timezone !== undefined) {
        updates.push(`timezone = $${paramIndex++}`);
        values.push(validatedData.timezone);
      }
      if (validatedData.headerColor !== undefined) {
        updates.push(`"headerColor" = $${paramIndex++}`);
        values.push(validatedData.headerColor);
      }
      if (validatedData.backgroundImage !== undefined) {
        updates.push(`"backgroundImage" = $${paramIndex++}`);
        values.push(validatedData.backgroundImage);
      }

      if (updates.length === 0) {
        return NextResponse.json({ error: 'No settings to update' }, { status: 400 });
      }

      updates.push('"updatedAt" = NOW()');

      // Ensure settings row exists first
      await client.query(`
        INSERT INTO "${session.user.schemaName}"."user_settings"
        (id, "foodEnabled", "medicationEnabled", "goalsEnabled", "milestonesEnabled", "exerciseEnabled", "allergiesEnabled", timezone, "headerColor", "backgroundImage", "createdAt", "updatedAt")
        VALUES ('settings_default', false, false, false, false, false, false, 'UTC', '#2d2c2a', '', NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
      `);

      const result = await client.query(
        `UPDATE "${session.user.schemaName}"."user_settings"
         SET ${updates.join(', ')}
         WHERE id = 'settings_default'
         RETURNING "foodEnabled", "medicationEnabled", "goalsEnabled", "milestonesEnabled", "exerciseEnabled", "allergiesEnabled", timezone, "headerColor", "backgroundImage"`,
        values
      );

      return NextResponse.json({ settings: result.rows[0] });
    } finally {
      client.release();
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error('Settings PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
