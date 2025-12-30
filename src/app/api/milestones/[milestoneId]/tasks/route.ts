import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { Pool } from 'pg';
import { z } from 'zod';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const updateTaskLinksSchema = z.object({
  taskIds: z.array(z.string()),
});

// PUT /api/milestones/[milestoneId]/tasks - Replace all task links for a milestone
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ milestoneId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { milestoneId } = await params;

  try {
    const body = await request.json();
    const { taskIds } = updateTaskLinksSchema.parse(body);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Verify the milestone exists and is a milestone type
      const milestoneCheck = await client.query(
        `SELECT id FROM "${session.user.schemaName}"."entries"
         WHERE id = $1 AND "customType" = 'milestone'`,
        [milestoneId]
      );
      if (milestoneCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Milestone not found' }, { status: 404 });
      }

      // Verify all task IDs exist and are tasks
      if (taskIds.length > 0) {
        const tasksCheck = await client.query(
          `SELECT id FROM "${session.user.schemaName}"."entries"
           WHERE id = ANY($1) AND "customType" = 'task'`,
          [taskIds]
        );
        if (tasksCheck.rows.length !== taskIds.length) {
          await client.query('ROLLBACK');
          return NextResponse.json({ error: 'One or more tasks not found' }, { status: 404 });
        }
      }

      // Delete existing task links for this milestone
      await client.query(
        `DELETE FROM "${session.user.schemaName}"."entry_relationships"
         WHERE "relatedToId" = $1 AND "relationshipType" = 'milestone_task'`,
        [milestoneId]
      );

      // Insert new relationships (task -> milestone)
      for (const taskId of taskIds) {
        const relationshipId = `rel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await client.query(
          `INSERT INTO "${session.user.schemaName}"."entry_relationships"
           (id, "entryId", "relatedToId", "relationshipType", "createdAt")
           VALUES ($1, $2, $3, 'milestone_task', NOW())`,
          [relationshipId, taskId, milestoneId]
        );
      }

      await client.query('COMMIT');

      return NextResponse.json({
        message: 'Task links updated',
        linkedTaskIds: taskIds
      });
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
    console.error('Update task links error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/milestones/[milestoneId]/tasks - Get all tasks linked to a milestone
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ milestoneId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { milestoneId } = await params;

  const client = await pool.connect();
  try {
    // Get all task IDs linked to this milestone
    const result = await client.query(
      `SELECT "entryId" as "taskId"
       FROM "${session.user.schemaName}"."entry_relationships"
       WHERE "relatedToId" = $1 AND "relationshipType" = 'milestone_task'`,
      [milestoneId]
    );

    return NextResponse.json({
      taskIds: result.rows.map(row => row.taskId)
    });
  } finally {
    client.release();
  }
}
