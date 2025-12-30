import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { getPool } from '@/lib/db/schemaManager';

interface ReorderRequest {
  goalIds: string[];
  priorities: { goalId: string; encryptedData: string; iv: string }[];
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.schemaName) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const schemaName = session.user.schemaName;
  const pool = getPool();
  const client = await pool.connect();

  try {
    const body: ReorderRequest = await request.json();
    const { priorities } = body;

    if (!priorities || !Array.isArray(priorities)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    await client.query('BEGIN');

    for (const priority of priorities) {
      // Check if priority custom field exists for this goal
      const existingField = await client.query(
        `
        SELECT cf.id FROM "${schemaName}"."custom_fields" cf
        JOIN "${schemaName}"."entries" e ON cf."entryId" = e.id
        WHERE e.id = $1 AND e."customType" = 'goal'
        `,
        [priority.goalId]
      );

      // Get all custom fields for this goal to find priority field
      const customFieldsResult = await client.query(
        `SELECT id, "encryptedData", iv FROM "${schemaName}"."custom_fields" WHERE "entryId" = $1`,
        [priority.goalId]
      );

      // We need to find and update/create the priority field
      // Since we can't decrypt on the server, we'll upsert based on a known pattern
      // The client will send the full encrypted priority field

      // Delete existing priority field if any (client sends a marker in the data)
      // For simplicity, we'll use a separate table approach or add a new custom field

      // Insert/update the priority custom field
      const fieldId = `priority_${priority.goalId}`;

      await client.query(
        `
        INSERT INTO "${schemaName}"."custom_fields" (id, "entryId", "encryptedData", iv)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO UPDATE SET "encryptedData" = $3, iv = $4
        `,
        [fieldId, priority.goalId, priority.encryptedData, priority.iv]
      );
    }

    await client.query('COMMIT');

    return NextResponse.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to reorder goals:', error);
    return NextResponse.json({ error: 'Failed to reorder goals' }, { status: 500 });
  } finally {
    client.release();
  }
}
