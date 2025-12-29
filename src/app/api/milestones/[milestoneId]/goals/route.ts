import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { Pool } from 'pg';
import { z } from 'zod';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const updateGoalLinksSchema = z.object({
  goalIds: z.array(z.string()),
});

// PUT /api/milestones/[milestoneId]/goals - Replace all goal links for a milestone
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
    const { goalIds } = updateGoalLinksSchema.parse(body);

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

      // Verify all goal IDs exist and are goals
      if (goalIds.length > 0) {
        const goalsCheck = await client.query(
          `SELECT id FROM "${session.user.schemaName}"."entries"
           WHERE id = ANY($1) AND "customType" = 'goal'`,
          [goalIds]
        );
        if (goalsCheck.rows.length !== goalIds.length) {
          await client.query('ROLLBACK');
          return NextResponse.json({ error: 'One or more goals not found' }, { status: 404 });
        }
      }

      // Delete existing goal links for this milestone
      await client.query(
        `DELETE FROM "${session.user.schemaName}"."entry_relationships"
         WHERE "entryId" = $1 AND "relationshipType" = 'goal_milestone'`,
        [milestoneId]
      );

      // Insert new relationships
      for (const goalId of goalIds) {
        const relationshipId = `rel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await client.query(
          `INSERT INTO "${session.user.schemaName}"."entry_relationships"
           (id, "entryId", "relatedToId", "relationshipType", "createdAt")
           VALUES ($1, $2, $3, 'goal_milestone', NOW())`,
          [relationshipId, milestoneId, goalId]
        );
      }

      await client.query('COMMIT');

      return NextResponse.json({
        message: 'Goal links updated',
        linkedGoalIds: goalIds
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
    console.error('Update goal links error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/milestones/[milestoneId]/goals - Get all goals linked to a milestone
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
    // Get all goal IDs linked to this milestone
    const result = await client.query(
      `SELECT "relatedToId" as "goalId"
       FROM "${session.user.schemaName}"."entry_relationships"
       WHERE "entryId" = $1 AND "relationshipType" = 'goal_milestone'`,
      [milestoneId]
    );

    return NextResponse.json({
      goalIds: result.rows.map(row => row.goalId)
    });
  } finally {
    client.release();
  }
}
