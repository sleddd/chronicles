import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// POST /api/topics/lookup - Find topic by nameToken
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { nameToken } = await request.json();
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT * FROM "${session.user.schemaName}"."topics" WHERE "nameToken" = $1`,
      [nameToken]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ topic: null });
    }

    return NextResponse.json({ topic: result.rows[0] });
  } finally {
    client.release();
  }
}
