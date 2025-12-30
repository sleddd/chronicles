import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { Pool } from 'pg';
import { z } from 'zod';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const updateMilestoneLinksSchema = z.object({
  milestoneIds: z.array(z.string()),
});

// PUT /api/tasks/[taskId]/milestones - Replace all milestone links for a task
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { taskId } = await params;

  try {
    const body = await request.json();
    const { milestoneIds } = updateMilestoneLinksSchema.parse(body);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Verify the task exists and is a task type
      const taskCheck = await client.query(
        `SELECT id FROM "${session.user.schemaName}"."entries"
         WHERE id = $1 AND "customType" = 'task'`,
        [taskId]
      );
      if (taskCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }

      // Verify all milestone IDs exist and are milestones
      if (milestoneIds.length > 0) {
        const milestonesCheck = await client.query(
          `SELECT id FROM "${session.user.schemaName}"."entries"
           WHERE id = ANY($1) AND "customType" = 'milestone'`,
          [milestoneIds]
        );
        if (milestonesCheck.rows.length !== milestoneIds.length) {
          await client.query('ROLLBACK');
          return NextResponse.json({ error: 'One or more milestones not found' }, { status: 404 });
        }
      }

      // Delete existing milestone links for this task
      await client.query(
        `DELETE FROM "${session.user.schemaName}"."entry_relationships"
         WHERE "entryId" = $1 AND "relationshipType" = 'milestone_task'`,
        [taskId]
      );

      // Insert new relationships (task -> milestone)
      for (const milestoneId of milestoneIds) {
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
        message: 'Milestone links updated',
        linkedMilestoneIds: milestoneIds
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
    console.error('Update milestone links error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/tasks/[taskId]/milestones - Get all milestones linked to a task
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { taskId } = await params;

  const client = await pool.connect();
  try {
    // Get all milestone IDs linked to this task
    const result = await client.query(
      `SELECT "relatedToId" as "milestoneId"
       FROM "${session.user.schemaName}"."entry_relationships"
       WHERE "entryId" = $1 AND "relationshipType" = 'milestone_task'`,
      [taskId]
    );

    return NextResponse.json({
      milestoneIds: result.rows.map(row => row.milestoneId)
    });
  } finally {
    client.release();
  }
}
