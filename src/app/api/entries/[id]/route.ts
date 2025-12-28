import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// GET /api/entries/[id] - Get single entry
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT e.*, json_agg(cf.*) FILTER (WHERE cf.id IS NOT NULL) as custom_fields
      FROM "${session.user.schemaName}"."entries" e
      LEFT JOIN "${session.user.schemaName}"."custom_fields" cf ON cf."entryId" = e.id
      WHERE e.id = $1
      GROUP BY e.id
    `, [id]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    return NextResponse.json({ entry: result.rows[0] });
  } finally {
    client.release();
  }
}

// PUT /api/entries/[id] - Update entry
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Build dynamic update query - topicId can be explicitly set to null
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (body.encryptedContent !== undefined) {
      updates.push(`"encryptedContent" = $${paramIndex++}`);
      values.push(body.encryptedContent);
    }
    if (body.iv !== undefined) {
      updates.push(`iv = $${paramIndex++}`);
      values.push(body.iv);
    }
    if (body.searchTokens !== undefined) {
      updates.push(`"searchTokens" = $${paramIndex++}`);
      values.push(body.searchTokens);
    }
    if ('topicId' in body) {
      updates.push(`"topicId" = $${paramIndex++}`);
      values.push(body.topicId);
    }

    updates.push(`"updatedAt" = NOW()`);
    values.push(id);

    const entryResult = await client.query(
      `UPDATE "${session.user.schemaName}"."entries"
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *`,
      values
    );

    if (entryResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    if (body.customFields) {
      await client.query(
        `DELETE FROM "${session.user.schemaName}"."custom_fields" WHERE "entryId" = $1`,
        [id]
      );

      for (let i = 0; i < body.customFields.length; i++) {
        const cf = body.customFields[i];
        await client.query(
          `INSERT INTO "${session.user.schemaName}"."custom_fields"
          (id, "entryId", "encryptedData", iv)
          VALUES ($1, $2, $3, $4)`,
          [`cf_${id}_${i}`, id, cf.encryptedData, cf.iv]
        );
      }
    }

    await client.query('COMMIT');
    return NextResponse.json({ entry: entryResult.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Entry PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  } finally {
    client.release();
  }
}

// DELETE /api/entries/[id] - Delete entry
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const client = await pool.connect();

  try {
    const result = await client.query(
      `DELETE FROM "${session.user.schemaName}"."entries" WHERE id = $1 RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Entry deleted successfully' });
  } finally {
    client.release();
  }
}
