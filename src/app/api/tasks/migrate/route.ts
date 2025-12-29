import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { Pool } from 'pg';
import { z } from 'zod';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const migrateTasksSchema = z.object({
  taskIds: z.array(z.string()).min(1),
  newDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// POST /api/tasks/migrate - Migrate incomplete tasks to a new date
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validatedData = migrateTasksSchema.parse(body);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let migratedCount = 0;

      for (const taskId of validatedData.taskIds) {
        const result = await client.query(
          `UPDATE "${session.user.schemaName}"."entries"
          SET "entryDate" = $1, "updatedAt" = NOW()
          WHERE id = $2 AND "customType" = 'task'
          RETURNING id`,
          [validatedData.newDate, taskId]
        );

        if (result.rowCount && result.rowCount > 0) {
          migratedCount++;
        }
      }

      await client.query('COMMIT');

      return NextResponse.json({ success: true, migratedCount });
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
    console.error('Task migration error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
