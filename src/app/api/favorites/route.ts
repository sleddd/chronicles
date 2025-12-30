import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { Pool } from 'pg';
import { migrateFavoritesTable } from '@/lib/db/schemaManager';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// GET /api/favorites - Get all favorite entries
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Ensure the favorites table exists (migration for existing schemas)
  await migrateFavoritesTable(session.user.schemaName);

  const client = await pool.connect();
  try {
    // Get favorites with entry data
    const result = await client.query(
      `SELECT
        f.id as "favoriteId",
        f."createdAt" as "favoritedAt",
        e.*
       FROM "${session.user.schemaName}"."favorites" f
       JOIN "${session.user.schemaName}"."entries" e ON f."entryId" = e.id
       ORDER BY f."createdAt" DESC`
    );

    // Get custom fields for each entry
    const entriesWithFields = await Promise.all(
      result.rows.map(async (entry) => {
        const fields = await client.query(
          `SELECT * FROM "${session.user.schemaName}"."custom_fields" WHERE "entryId" = $1`,
          [entry.id]
        );
        return {
          ...entry,
          custom_fields: fields.rows,
        };
      })
    );

    return NextResponse.json({ favorites: entriesWithFields });
  } finally {
    client.release();
  }
}

// POST /api/favorites - Add entry to favorites
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { entryId } = await request.json();

    if (!entryId) {
      return NextResponse.json({ error: 'entryId is required' }, { status: 400 });
    }

    const client = await pool.connect();
    try {
      // Check if entry exists
      const entryCheck = await client.query(
        `SELECT id FROM "${session.user.schemaName}"."entries" WHERE id = $1`,
        [entryId]
      );

      if (entryCheck.rows.length === 0) {
        return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
      }

      // Check if already favorited
      const existingFavorite = await client.query(
        `SELECT id FROM "${session.user.schemaName}"."favorites" WHERE "entryId" = $1`,
        [entryId]
      );

      if (existingFavorite.rows.length > 0) {
        return NextResponse.json(
          { message: 'Already favorited', favoriteId: existingFavorite.rows[0].id },
          { status: 200 }
        );
      }

      // Create favorite
      const favoriteId = `fav_${Date.now()}`;
      const result = await client.query(
        `INSERT INTO "${session.user.schemaName}"."favorites"
         (id, "entryId", "createdAt")
         VALUES ($1, $2, NOW())
         RETURNING *`,
        [favoriteId, entryId]
      );

      return NextResponse.json({ favorite: result.rows[0] }, { status: 201 });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Favorite POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/favorites - Remove entry from favorites
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const entryId = searchParams.get('entryId');

  if (!entryId) {
    return NextResponse.json({ error: 'entryId is required' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      `DELETE FROM "${session.user.schemaName}"."favorites"
       WHERE "entryId" = $1
       RETURNING id`,
      [entryId]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Favorite not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Removed from favorites' });
  } finally {
    client.release();
  }
}
