import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { Pool } from 'pg';
import { z } from 'zod';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const createFoodSchema = z.object({
  encryptedContent: z.string(),
  iv: z.string(),
  entryDate: z.string(),
  customFields: z.array(z.object({
    encryptedData: z.string(),
    iv: z.string(),
  })),
});

// GET /api/food - List food entries with filters
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
      WHERE e."customType" = 'food'
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

    return NextResponse.json({ food: result.rows });
  } finally {
    client.release();
  }
}

// POST /api/food - Create new food entry
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validatedData = createFoodSchema.parse(body);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const entryId = `food_${Date.now()}`;

      const entryResult = await client.query(
        `INSERT INTO "${session.user.schemaName}"."entries"
        (id, "topicId", "encryptedContent", iv, "searchTokens", "customType", "entryDate", "createdAt", "updatedAt")
        VALUES ($1, NULL, $2, $3, $4, 'food', $5, NOW(), NOW())
        RETURNING *`,
        [
          entryId,
          validatedData.encryptedContent,
          validatedData.iv,
          [],
          validatedData.entryDate,
        ]
      );

      // Insert custom fields (mealType, consumedAt, ingredients, notes)
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
      return NextResponse.json({ food: entryResult.rows[0] }, { status: 201 });
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
    console.error('Food POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
