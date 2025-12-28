import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// GET /api/topics/[id] - Get single topic
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
    const result = await client.query(
      `SELECT * FROM "${session.user.schemaName}"."topics" WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
    }

    return NextResponse.json({ topic: result.rows[0] });
  } finally {
    client.release();
  }
}

// PUT /api/topics/[id] - Update topic
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
    // Note: icon can be set to null explicitly, so we check if 'icon' key exists
    const hasIconField = 'icon' in body;

    const result = await client.query(
      `UPDATE "${session.user.schemaName}"."topics"
      SET "encryptedName" = COALESCE($1, "encryptedName"),
          iv = COALESCE($2, iv),
          "nameToken" = COALESCE($3, "nameToken"),
          color = COALESCE($4, color),
          icon = ${hasIconField ? '$5' : 'icon'}
      WHERE id = $6
      RETURNING *`,
      [
        body.encryptedName,
        body.iv,
        body.nameToken,
        body.color,
        hasIconField ? body.icon : null,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
    }

    return NextResponse.json({ topic: result.rows[0] });
  } finally {
    client.release();
  }
}

// DELETE /api/topics/[id] - Delete topic
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
    await client.query('BEGIN');

    // Remove topic from entries (set topicId to null) - entries are preserved
    await client.query(
      `UPDATE "${session.user.schemaName}"."entries" SET "topicId" = NULL WHERE "topicId" = $1`,
      [id]
    );

    // Delete the topic
    const result = await client.query(
      `DELETE FROM "${session.user.schemaName}"."topics" WHERE id = $1 RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
    }

    await client.query('COMMIT');
    return NextResponse.json({ message: 'Topic deleted successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to delete topic:', error);
    return NextResponse.json({ error: 'Failed to delete topic' }, { status: 500 });
  } finally {
    client.release();
  }
}
