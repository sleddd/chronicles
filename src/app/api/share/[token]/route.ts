import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// GET /api/share/[token] - Get shared entry (public, no auth required)
// Returns PLAINTEXT content - shared entries are publicly viewable
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const client = await pool.connect();
  try {
    // Find the shared entry across all user schemas
    // First, get all schema names
    const schemasResult = await client.query(`
      SELECT "schemaName" FROM auth.accounts WHERE "schemaName" IS NOT NULL
    `);

    let sharedEntry = null;
    let schemaName = '';

    // Search for the share token in each user's schema
    for (const row of schemasResult.rows) {
      const schema = row.schemaName;
      try {
        const shareResult = await client.query(
          `SELECT * FROM "${schema}"."shared_entries" WHERE "shareToken" = $1`,
          [token]
        );

        if (shareResult.rows.length > 0) {
          sharedEntry = shareResult.rows[0];
          schemaName = schema;

          // Check if expired
          if (sharedEntry.expiresAt && new Date(sharedEntry.expiresAt) < new Date()) {
            return NextResponse.json(
              { error: 'This share link has expired' },
              { status: 410 }
            );
          }

          // Increment view count
          await client.query(
            `UPDATE "${schema}"."shared_entries"
             SET "viewCount" = "viewCount" + 1
             WHERE id = $1`,
            [sharedEntry.id]
          );

          break;
        }
      } catch {
        // Schema might not exist or table not found, continue
        continue;
      }
    }

    if (!sharedEntry) {
      return NextResponse.json(
        { error: 'Shared entry not found' },
        { status: 404 }
      );
    }

    // Return the PLAINTEXT content - no decryption needed
    return NextResponse.json({
      entry: {
        content: sharedEntry.plaintextContent,
        entryDate: sharedEntry.createdAt, // Use share creation date as reference
      },
      share: {
        viewCount: sharedEntry.viewCount + 1,
        expiresAt: sharedEntry.expiresAt,
        createdAt: sharedEntry.createdAt,
      },
    });
  } finally {
    client.release();
  }
}
