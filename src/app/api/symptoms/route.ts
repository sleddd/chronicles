import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { Pool } from 'pg';
import { z } from 'zod';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const createSymptomSchema = z.object({
  encryptedContent: z.string(),
  iv: z.string(),
  entryDate: z.string(),
  customFields: z.array(z.object({
    encryptedData: z.string(),
    iv: z.string(),
  })),
  // Optional: link to food or medication entries
  linkedEntryIds: z.array(z.object({
    entryId: z.string(),
    relationshipType: z.enum(['food_symptom', 'medication_symptom']),
  })).optional(),
});

// GET /api/symptoms - List symptom entries with filters
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  const client = await pool.connect();
  try {
    let query = `
      SELECT e.*,
        json_agg(DISTINCT cf.*) FILTER (WHERE cf.id IS NOT NULL) as custom_fields
      FROM "${session.user.schemaName}"."entries" e
      LEFT JOIN "${session.user.schemaName}"."custom_fields" cf ON cf."entryId" = e.id
      WHERE e."customType" = 'symptom'
    `;
    const queryParams: string[] = [];
    let paramIndex = 1;

    if (date) {
      query += ` AND e."entryDate" = $${paramIndex++}`;
      queryParams.push(date);
    } else {
      if (startDate) {
        query += ` AND e."entryDate" >= $${paramIndex++}`;
        queryParams.push(startDate);
      }
      if (endDate) {
        query += ` AND e."entryDate" <= $${paramIndex++}`;
        queryParams.push(endDate);
      }
    }

    query += ` GROUP BY e.id ORDER BY e."entryDate" DESC, e."createdAt" DESC`;

    const result = await client.query(query, queryParams);

    // For each symptom, fetch linked entries (triggers)
    const symptomIds = result.rows.map(row => row.id);
    if (symptomIds.length > 0) {
      const relResult = await client.query(
        `SELECT "entryId" as "symptomId", "relatedToId" as "triggerId", "relationshipType"
         FROM "${session.user.schemaName}"."entry_relationships"
         WHERE "entryId" = ANY($1) AND "relationshipType" IN ('food_symptom', 'medication_symptom')`,
        [symptomIds]
      );

      // Create a map of symptomId -> triggers
      const symptomTriggers: Record<string, { triggerId: string; relationshipType: string }[]> = {};
      for (const rel of relResult.rows) {
        if (!symptomTriggers[rel.symptomId]) {
          symptomTriggers[rel.symptomId] = [];
        }
        symptomTriggers[rel.symptomId].push({
          triggerId: rel.triggerId,
          relationshipType: rel.relationshipType,
        });
      }

      // Add triggers to each symptom entry
      for (const symptom of result.rows) {
        symptom.triggers = symptomTriggers[symptom.id] || [];
      }
    }

    return NextResponse.json({ symptoms: result.rows });
  } finally {
    client.release();
  }
}

// POST /api/symptoms - Create new symptom entry
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validatedData = createSymptomSchema.parse(body);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const entryId = `symptom_${Date.now()}`;

      const entryResult = await client.query(
        `INSERT INTO "${session.user.schemaName}"."entries"
        (id, "topicId", "encryptedContent", iv, "searchTokens", "customType", "entryDate", "createdAt", "updatedAt")
        VALUES ($1, NULL, $2, $3, $4, 'symptom', $5, NOW(), NOW())
        RETURNING *`,
        [
          entryId,
          validatedData.encryptedContent,
          validatedData.iv,
          [],
          validatedData.entryDate,
        ]
      );

      // Insert custom fields (severity, occurredAt, duration, notes)
      for (let i = 0; i < validatedData.customFields.length; i++) {
        const cf = validatedData.customFields[i];
        await client.query(
          `INSERT INTO "${session.user.schemaName}"."custom_fields"
          (id, "entryId", "encryptedData", iv)
          VALUES ($1, $2, $3, $4)`,
          [`cf_${entryId}_${i}`, entryId, cf.encryptedData, cf.iv]
        );
      }

      // Create relationships to linked entries (food/medication triggers)
      if (validatedData.linkedEntryIds) {
        for (const link of validatedData.linkedEntryIds) {
          const relationshipId = `rel_${entryId}_${link.entryId}`;
          await client.query(
            `INSERT INTO "${session.user.schemaName}"."entry_relationships"
            (id, "entryId", "relatedToId", "relationshipType", "createdAt")
            VALUES ($1, $2, $3, $4, NOW())`,
            [relationshipId, entryId, link.entryId, link.relationshipType]
          );
        }
      }

      await client.query('COMMIT');
      return NextResponse.json({ symptom: entryResult.rows[0] }, { status: 201 });
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
    console.error('Symptoms POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
