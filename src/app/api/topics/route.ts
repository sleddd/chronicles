import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { Pool } from 'pg';
import { z } from 'zod';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const createTopicSchema = z.object({
  encryptedName: z.string(),
  iv: z.string(),
  nameToken: z.string(),
  color: z.string().default('#6366f1'),
  icon: z.string().optional(),
});

// GET /api/topics - List all topics
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = await pool.connect();
  try {
    // Add sortOrder column if it doesn't exist (migration for existing users)
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE "${session.user.schemaName}"."topics"
        ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
      EXCEPTION
        WHEN duplicate_column THEN NULL;
      END $$;
    `);

    const result = await client.query(`
      SELECT * FROM "${session.user.schemaName}"."topics"
      ORDER BY "sortOrder" ASC, "encryptedName" ASC
    `);

    return NextResponse.json({ topics: result.rows });
  } finally {
    client.release();
  }
}

// POST /api/topics - Create new topic
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validatedData = createTopicSchema.parse(body);

    const client = await pool.connect();
    try {
      const topicId = `topic_${Date.now()}`;

      // Get the next sortOrder value
      const maxOrderResult = await client.query(
        `SELECT COALESCE(MAX("sortOrder"), -1) + 1 as next_order FROM "${session.user.schemaName}"."topics"`
      );
      const nextOrder = maxOrderResult.rows[0].next_order;

      const result = await client.query(
        `INSERT INTO "${session.user.schemaName}"."topics"
        (id, "encryptedName", iv, "nameToken", color, icon, "sortOrder")
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [
          topicId,
          validatedData.encryptedName,
          validatedData.iv,
          validatedData.nameToken,
          validatedData.color,
          validatedData.icon || null,
          nextOrder,
        ]
      );

      return NextResponse.json({ topic: result.rows[0] }, { status: 201 });
    } finally {
      client.release();
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error('Topics POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
