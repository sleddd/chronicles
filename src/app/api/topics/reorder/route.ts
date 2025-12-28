import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { Pool } from 'pg';
import { z } from 'zod';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const reorderSchema = z.object({
  topicIds: z.array(z.string()),
});

// POST /api/topics/reorder - Reorder topics
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { topicIds } = reorderSchema.parse(body);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Update each topic's sortOrder based on its position in the array
      for (let i = 0; i < topicIds.length; i++) {
        await client.query(
          `UPDATE "${session.user.schemaName}"."topics" SET "sortOrder" = $1 WHERE id = $2`,
          [i, topicIds[i]]
        );
      }

      await client.query('COMMIT');

      // Return updated topics
      const result = await client.query(`
        SELECT * FROM "${session.user.schemaName}"."topics"
        ORDER BY "sortOrder" ASC, "encryptedName" ASC
      `);

      return NextResponse.json({ topics: result.rows });
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
    console.error('Topics reorder error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
