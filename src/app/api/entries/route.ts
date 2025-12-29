import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { Pool } from 'pg';
import { z } from 'zod';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const createEntrySchema = z.object({
  topicId: z.string().nullable().optional(),
  encryptedContent: z.string(),
  iv: z.string(),
  searchTokens: z.array(z.string()).optional(),
  customType: z.string().nullable().optional(),
  entryDate: z.string(),
  customFields: z.array(z.object({
    encryptedData: z.string(),
    iv: z.string(),
  })).optional(),
});

// GET /api/entries - List entries with filters
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const topicId = searchParams.get('topicId');
  const date = searchParams.get('date');
  const customType = searchParams.get('customType');
  const searchToken = searchParams.get('searchToken');

  const client = await pool.connect();
  try {
    // Base query with custom fields
    let query = `
      SELECT e.*,
        json_agg(DISTINCT cf.*) FILTER (WHERE cf.id IS NOT NULL) as custom_fields
      FROM "${session.user.schemaName}"."entries" e
      LEFT JOIN "${session.user.schemaName}"."custom_fields" cf ON cf."entryId" = e.id
      WHERE 1=1
    `;
    const params: string[] = [];
    let paramIndex = 1;

    if (topicId) {
      query += ` AND e."topicId" = $${paramIndex++}`;
      params.push(topicId);
    }

    if (date) {
      query += ` AND e."entryDate" = $${paramIndex++}`;
      params.push(date);
    }

    if (customType) {
      query += ` AND e."customType" = $${paramIndex++}`;
      params.push(customType);
    }

    if (searchToken) {
      query += ` AND $${paramIndex++} = ANY(e."searchTokens")`;
      params.push(searchToken);
    }

    query += ` GROUP BY e.id ORDER BY e."entryDate" DESC, e."createdAt" DESC`;

    const result = await client.query(query, params);

    // For goals and milestones, fetch relationships
    if (customType === 'goal' || customType === 'milestone') {
      const entryIds = result.rows.map(row => row.id);

      if (entryIds.length > 0) {
        if (customType === 'goal') {
          // For goals, get linked milestone IDs
          const relResult = await client.query(
            `SELECT "relatedToId" as "goalId", "entryId" as "milestoneId"
             FROM "${session.user.schemaName}"."entry_relationships"
             WHERE "relatedToId" = ANY($1) AND "relationshipType" = 'goal_milestone'`,
            [entryIds]
          );

          // Create a map of goalId -> milestoneIds
          const goalMilestones: Record<string, string[]> = {};
          for (const rel of relResult.rows) {
            if (!goalMilestones[rel.goalId]) {
              goalMilestones[rel.goalId] = [];
            }
            goalMilestones[rel.goalId].push(rel.milestoneId);
          }

          // Add milestoneIds to each goal entry
          for (const entry of result.rows) {
            entry.milestoneIds = goalMilestones[entry.id] || [];
          }
        } else if (customType === 'milestone') {
          // For milestones, get linked goal IDs
          const relResult = await client.query(
            `SELECT "entryId" as "milestoneId", "relatedToId" as "goalId"
             FROM "${session.user.schemaName}"."entry_relationships"
             WHERE "entryId" = ANY($1) AND "relationshipType" = 'goal_milestone'`,
            [entryIds]
          );

          // Create a map of milestoneId -> goalIds
          const milestoneGoals: Record<string, string[]> = {};
          for (const rel of relResult.rows) {
            if (!milestoneGoals[rel.milestoneId]) {
              milestoneGoals[rel.milestoneId] = [];
            }
            milestoneGoals[rel.milestoneId].push(rel.goalId);
          }

          // Add goalIds to each milestone entry
          for (const entry of result.rows) {
            entry.goalIds = milestoneGoals[entry.id] || [];
          }
        }
      }
    }

    return NextResponse.json({ entries: result.rows });
  } finally {
    client.release();
  }
}

// POST /api/entries - Create new entry
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validatedData = createEntrySchema.parse(body);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const entryId = `entry_${Date.now()}`;

      const entryResult = await client.query(
        `INSERT INTO "${session.user.schemaName}"."entries"
        (id, "topicId", "encryptedContent", iv, "searchTokens", "customType", "entryDate", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        RETURNING *`,
        [
          entryId,
          validatedData.topicId || null,
          validatedData.encryptedContent,
          validatedData.iv,
          validatedData.searchTokens || [],
          validatedData.customType || null,
          validatedData.entryDate,
        ]
      );

      if (validatedData.customFields) {
        for (let i = 0; i < validatedData.customFields.length; i++) {
          const cf = validatedData.customFields[i];
          await client.query(
            `INSERT INTO "${session.user.schemaName}"."custom_fields"
            (id, "entryId", "encryptedData", iv)
            VALUES ($1, $2, $3, $4)`,
            [`cf_${entryId}_${i}`, entryId, cf.encryptedData, cf.iv]
          );
        }
      }

      await client.query('COMMIT');
      return NextResponse.json({ entry: entryResult.rows[0] }, { status: 201 });
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
    console.error('Entries POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
