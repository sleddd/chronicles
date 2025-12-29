import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { Pool } from 'pg';
import { z } from 'zod';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const createLogSchema = z.object({
  encryptedContent: z.string(),
  iv: z.string(),
  entryDate: z.string(),
  customFields: z.array(z.object({
    encryptedData: z.string(),
    iv: z.string(),
  })),
});

// GET /api/medications/[id]/logs - Get logs for a specific medication
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: medicationId } = await params;
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  const client = await pool.connect();
  try {
    // Get all medication_log entries linked to this medication
    let query = `
      SELECT e.*,
        json_agg(DISTINCT cf.*) FILTER (WHERE cf.id IS NOT NULL) as custom_fields
      FROM "${session.user.schemaName}"."entries" e
      LEFT JOIN "${session.user.schemaName}"."custom_fields" cf ON cf."entryId" = e.id
      WHERE e.id IN (
        SELECT "entryId" FROM "${session.user.schemaName}"."entry_relationships"
        WHERE "relatedToId" = $1 AND "relationshipType" = 'medication_log'
      )
    `;
    const queryParams: string[] = [medicationId];
    let paramIndex = 2;

    if (startDate) {
      query += ` AND e."entryDate" >= $${paramIndex++}`;
      queryParams.push(startDate);
    }

    if (endDate) {
      query += ` AND e."entryDate" <= $${paramIndex++}`;
      queryParams.push(endDate);
    }

    query += ` GROUP BY e.id ORDER BY e."entryDate" DESC, e."createdAt" DESC`;

    const result = await client.query(query, queryParams);

    return NextResponse.json({ logs: result.rows });
  } finally {
    client.release();
  }
}

// POST /api/medications/[id]/logs - Create a new medication log
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: medicationId } = await params;

  try {
    const body = await request.json();
    const validatedData = createLogSchema.parse(body);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Verify medication exists
      const medicationCheck = await client.query(
        `SELECT id FROM "${session.user.schemaName}"."entries"
         WHERE id = $1 AND "customType" = 'medication'`,
        [medicationId]
      );

      if (medicationCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Medication not found' }, { status: 404 });
      }

      const logId = `med_log_${Date.now()}`;

      // Create the medication_log entry
      const logResult = await client.query(
        `INSERT INTO "${session.user.schemaName}"."entries"
        (id, "topicId", "encryptedContent", iv, "searchTokens", "customType", "entryDate", "createdAt", "updatedAt")
        VALUES ($1, NULL, $2, $3, $4, 'medication_log', $5, NOW(), NOW())
        RETURNING *`,
        [
          logId,
          validatedData.encryptedContent,
          validatedData.iv,
          [],
          validatedData.entryDate,
        ]
      );

      // Insert custom fields (takenAt, skipped, skipReason)
      for (let i = 0; i < validatedData.customFields.length; i++) {
        const cf = validatedData.customFields[i];
        await client.query(
          `INSERT INTO "${session.user.schemaName}"."custom_fields"
          (id, "entryId", "encryptedData", iv)
          VALUES ($1, $2, $3, $4)`,
          [`cf_${logId}_${i}`, logId, cf.encryptedData, cf.iv]
        );
      }

      // Create the relationship linking log to medication
      const relationshipId = `rel_${logId}_${medicationId}`;
      await client.query(
        `INSERT INTO "${session.user.schemaName}"."entry_relationships"
        (id, "entryId", "relatedToId", "relationshipType", "createdAt")
        VALUES ($1, $2, $3, 'medication_log', NOW())`,
        [relationshipId, logId, medicationId]
      );

      await client.query('COMMIT');
      return NextResponse.json({ log: logResult.rows[0] }, { status: 201 });
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
    console.error('Medication logs POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
