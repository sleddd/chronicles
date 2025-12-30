import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { Pool } from 'pg';
import { z } from 'zod';
import crypto from 'crypto';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rateLimit';
import { migrateSharedEntriesTable } from '@/lib/db/schemaManager';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const createShareSchema = z.object({
  expiresInDays: z.number().min(1).max(30).optional().default(7),
  plaintextContent: z.string().min(1), // Required: decrypted content from client
});

// POST /api/entries/[id]/share - Create share link for an entry
// WARNING: This stores the entry as PLAINTEXT - it will be publicly viewable
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate limit share creation
  const rateLimit = checkRateLimit(`share:${session.user.id}`, RATE_LIMITS.share);
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: 'Too many share requests. Please try again later.' },
      { status: 429 }
    );
  }

  const { id: entryId } = await params;

  try {
    const body = await request.json();
    const { expiresInDays, plaintextContent } = createShareSchema.parse(body);

    // Ensure the plaintextContent column exists (migration for existing schemas)
    await migrateSharedEntriesTable(session.user.schemaName);

    const client = await pool.connect();
    try {
      // Verify entry exists and belongs to user
      const entryCheck = await client.query(
        `SELECT id FROM "${session.user.schemaName}"."entries" WHERE id = $1`,
        [entryId]
      );

      if (entryCheck.rows.length === 0) {
        return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
      }

      // Check if share already exists - if so, update the plaintext content
      const existingShare = await client.query(
        `SELECT * FROM "${session.user.schemaName}"."shared_entries"
         WHERE "entryId" = $1 AND ("expiresAt" IS NULL OR "expiresAt" > NOW())`,
        [entryId]
      );

      if (existingShare.rows.length > 0) {
        // Update existing share with new plaintext content
        const share = existingShare.rows[0];
        await client.query(
          `UPDATE "${session.user.schemaName}"."shared_entries"
           SET "plaintextContent" = $1
           WHERE id = $2`,
          [plaintextContent, share.id]
        );

        const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL || ''}/share/${share.shareToken}`;
        return NextResponse.json({
          share: { ...share, plaintextContent },
          shareUrl,
          message: 'Existing share link updated',
        });
      }

      // Generate new share token
      const shareToken = crypto.randomBytes(32).toString('hex');
      const shareId = `share_${Date.now()}`;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);

      const result = await client.query(
        `INSERT INTO "${session.user.schemaName}"."shared_entries"
         (id, "entryId", "shareToken", "plaintextContent", "expiresAt", "viewCount", "createdAt")
         VALUES ($1, $2, $3, $4, $5, 0, NOW())
         RETURNING *`,
        [shareId, entryId, shareToken, plaintextContent, expiresAt]
      );

      const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL || ''}/share/${shareToken}`;

      return NextResponse.json({
        share: result.rows[0],
        shareUrl,
      }, { status: 201 });
    } finally {
      client.release();
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error('Share POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/entries/[id]/share - Get share status for an entry
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: entryId } = await params;
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT id, "entryId", "shareToken", "expiresAt", "viewCount", "createdAt"
       FROM "${session.user.schemaName}"."shared_entries"
       WHERE "entryId" = $1
       ORDER BY "createdAt" DESC`,
      [entryId]
    );

    const activeShare = result.rows.find(
      (s) => !s.expiresAt || new Date(s.expiresAt) > new Date()
    );

    return NextResponse.json({
      shares: result.rows,
      activeShare: activeShare || null,
      shareUrl: activeShare
        ? `${process.env.NEXT_PUBLIC_APP_URL || ''}/share/${activeShare.shareToken}`
        : null,
    });
  } finally {
    client.release();
  }
}

// DELETE /api/entries/[id]/share - Revoke share link
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: entryId } = await params;
  const client = await pool.connect();

  try {
    // Delete all shares for this entry
    const result = await client.query(
      `DELETE FROM "${session.user.schemaName}"."shared_entries"
       WHERE "entryId" = $1
       RETURNING id`,
      [entryId]
    );

    return NextResponse.json({
      message: 'Share links revoked',
      deletedCount: result.rowCount,
    });
  } finally {
    client.release();
  }
}
