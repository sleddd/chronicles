import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// DELETE /api/topics/reset - Delete all topics (for data recovery)
export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = await pool.connect();
  try {
    // First, unset topicId on all entries to avoid foreign key issues
    await client.query(`
      UPDATE "${session.user.schemaName}"."entries"
      SET "topicId" = NULL
    `);

    // Delete all topics
    const result = await client.query(`
      DELETE FROM "${session.user.schemaName}"."topics"
      RETURNING id
    `);

    return NextResponse.json({
      message: 'All topics deleted',
      deletedCount: result.rowCount
    });
  } finally {
    client.release();
  }
}
