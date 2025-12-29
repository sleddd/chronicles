import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { Pool } from 'pg';
import { z } from 'zod';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const createMedicationSchema = z.object({
  encryptedContent: z.string(),
  iv: z.string(),
  entryDate: z.string(),
  customFields: z.array(z.object({
    encryptedData: z.string(),
    iv: z.string(),
  })),
});

// GET /api/medications - List all medications
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Note: activeOnly filtering happens client-side after decryption
  // since isActive is an encrypted custom field

  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT e.*,
        json_agg(DISTINCT cf.*) FILTER (WHERE cf.id IS NOT NULL) as custom_fields
      FROM "${session.user.schemaName}"."entries" e
      LEFT JOIN "${session.user.schemaName}"."custom_fields" cf ON cf."entryId" = e.id
      WHERE e."customType" = 'medication'
      GROUP BY e.id
      ORDER BY e."createdAt" DESC
    `);

    return NextResponse.json({ medications: result.rows });
  } finally {
    client.release();
  }
}

// POST /api/medications - Create new medication
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validatedData = createMedicationSchema.parse(body);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const entryId = `medication_${Date.now()}`;

      const entryResult = await client.query(
        `INSERT INTO "${session.user.schemaName}"."entries"
        (id, "topicId", "encryptedContent", iv, "searchTokens", "customType", "entryDate", "createdAt", "updatedAt")
        VALUES ($1, NULL, $2, $3, $4, 'medication', $5, NOW(), NOW())
        RETURNING *`,
        [
          entryId,
          validatedData.encryptedContent,
          validatedData.iv,
          [],
          validatedData.entryDate,
        ]
      );

      // Insert custom fields (dosage, frequency, scheduleTimes, etc.)
      for (let i = 0; i < validatedData.customFields.length; i++) {
        const cf = validatedData.customFields[i];
        await client.query(
          `INSERT INTO "${session.user.schemaName}"."custom_fields"
          (id, "entryId", "encryptedData", iv)
          VALUES ($1, $2, $3, $4)`,
          [`cf_${entryId}_${i}`, entryId, cf.encryptedData, cf.iv]
        );
      }

      await client.query('COMMIT');
      return NextResponse.json({ medication: entryResult.rows[0] }, { status: 201 });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error('Medications POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
