import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { Pool } from 'pg';
import { z } from 'zod';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const linkMilestoneSchema = z.object({
  milestoneId: z.string(),
});

// POST /api/goals/[goalId]/milestones - Link a milestone to a goal
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ goalId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { goalId } = await params;

  try {
    const body = await request.json();
    const { milestoneId } = linkMilestoneSchema.parse(body);

    const client = await pool.connect();
    try {
      // Verify the goal exists and is a goal type
      const goalCheck = await client.query(
        `SELECT id FROM "${session.user.schemaName}"."entries"
         WHERE id = $1 AND "customType" = 'goal'`,
        [goalId]
      );
      if (goalCheck.rows.length === 0) {
        return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
      }

      // Verify the milestone exists and is a milestone type
      const milestoneCheck = await client.query(
        `SELECT id FROM "${session.user.schemaName}"."entries"
         WHERE id = $1 AND "customType" = 'milestone'`,
        [milestoneId]
      );
      if (milestoneCheck.rows.length === 0) {
        return NextResponse.json({ error: 'Milestone not found' }, { status: 404 });
      }

      // Check if relationship already exists
      const existingCheck = await client.query(
        `SELECT id FROM "${session.user.schemaName}"."entry_relationships"
         WHERE "entryId" = $1 AND "relatedToId" = $2 AND "relationshipType" = 'goal_milestone'`,
        [milestoneId, goalId]
      );
      if (existingCheck.rows.length > 0) {
        return NextResponse.json({ error: 'Relationship already exists' }, { status: 409 });
      }

      // Create the relationship (milestone -> goal)
      const relationshipId = `rel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await client.query(
        `INSERT INTO "${session.user.schemaName}"."entry_relationships"
         (id, "entryId", "relatedToId", "relationshipType", "createdAt")
         VALUES ($1, $2, $3, 'goal_milestone', NOW())`,
        [relationshipId, milestoneId, goalId]
      );

      return NextResponse.json({
        message: 'Milestone linked to goal',
        relationshipId
      }, { status: 201 });
    } finally {
      client.release();
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error('Link milestone error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/goals/[goalId]/milestones?milestoneId=xxx - Unlink a milestone from a goal
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ goalId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { goalId } = await params;
  const { searchParams } = new URL(request.url);
  const milestoneId = searchParams.get('milestoneId');

  if (!milestoneId) {
    return NextResponse.json({ error: 'milestoneId query parameter required' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      `DELETE FROM "${session.user.schemaName}"."entry_relationships"
       WHERE "entryId" = $1 AND "relatedToId" = $2 AND "relationshipType" = 'goal_milestone'
       RETURNING id`,
      [milestoneId, goalId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Relationship not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Milestone unlinked from goal' });
  } finally {
    client.release();
  }
}
