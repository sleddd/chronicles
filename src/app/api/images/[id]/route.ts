import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { Pool } from 'pg';
import fs from 'fs/promises';
import path from 'path';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

// GET /api/images/[id] - Get image metadata and encrypted data
// Verifies ownership: only the user who uploaded the image can access it
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const includeData = searchParams.get('data') === 'true';

  const client = await pool.connect();

  try {
    // Query from user's schema ensures ownership verification
    // Images are stored in user-specific schemas, so querying by ID in user's schema
    // automatically verifies the image belongs to this user
    const result = await client.query(
      `SELECT id, "entryId", "encryptedFilename", "filenameIv", "dataIv", "mimeType", "size", "createdAt"
       FROM "${session.user.schemaName}"."entry_images"
       WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    const image = result.rows[0];

    // If encrypted data is requested, read from filesystem
    if (includeData) {
      const filePath = path.join(UPLOADS_DIR, session.user.schemaName, `${id}.enc`);

      try {
        const encryptedData = await fs.readFile(filePath, 'utf-8');
        return NextResponse.json({
          image: { ...image, encryptedData }
        });
      } catch (fileError) {
        console.error('Error reading image file:', fileError);
        return NextResponse.json({ error: 'Image data not found' }, { status: 404 });
      }
    }

    return NextResponse.json({ image });
  } finally {
    client.release();
  }
}

// DELETE /api/images/[id] - Delete an image
// Also removes the encrypted file from filesystem
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
    // Delete from database (ownership verified by querying user's schema)
    const result = await client.query(
      `DELETE FROM "${session.user.schemaName}"."entry_images"
       WHERE id = $1
       RETURNING id`,
      [id]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    // Delete encrypted file from filesystem
    const filePath = path.join(UPLOADS_DIR, session.user.schemaName, `${id}.enc`);
    await fs.unlink(filePath).catch((err) => {
      console.error('Error deleting image file:', err);
      // Don't fail the request if file doesn't exist
    });

    return NextResponse.json({ message: 'Image deleted' });
  } finally {
    client.release();
  }
}

// PATCH /api/images/[id] - Attach image to an entry
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { entryId } = body;

  const client = await pool.connect();

  try {
    const result = await client.query(
      `UPDATE "${session.user.schemaName}"."entry_images"
       SET "entryId" = $1
       WHERE id = $2
       RETURNING *`,
      [entryId || null, id]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    return NextResponse.json({ image: result.rows[0] });
  } finally {
    client.release();
  }
}
