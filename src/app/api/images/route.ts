import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { Pool } from 'pg';
import { z } from 'zod';
import { migrateEntryImagesTable } from '@/lib/db/schemaManager';
import fs from 'fs/promises';
import path from 'path';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB max
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

// Cache migrated schemas to avoid running migration on every request
const migratedSchemas = new Set<string>();

async function ensureMigration(schemaName: string) {
  if (migratedSchemas.has(schemaName)) return;
  try {
    await migrateEntryImagesTable(schemaName);
    migratedSchemas.add(schemaName);
  } catch (error) {
    console.error('Migration error (non-fatal):', error);
  }
}

const uploadImageSchema = z.object({
  encryptedFilename: z.string(),
  filenameIv: z.string(),
  encryptedData: z.string(),
  dataIv: z.string(),
  mimeType: z.string().refine(
    (type) => ALLOWED_MIME_TYPES.includes(type),
    { message: 'Only JPG, PNG, WebP, and GIF images are allowed' }
  ),
  size: z.number().max(MAX_FILE_SIZE),
  entryId: z.string().optional(),
});

// Ensure user's upload directory exists
async function ensureUserDir(schemaName: string): Promise<string> {
  const userDir = path.join(UPLOADS_DIR, schemaName);
  await fs.mkdir(userDir, { recursive: true });
  return userDir;
}

// GET /api/images - Get image metadata for an entry or all unattached images
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const entryId = searchParams.get('entryId');

  // Ensure the entry_images table exists (migration for existing schemas)
  await ensureMigration(session.user.schemaName);

  const client = await pool.connect();
  try {
    let result;
    if (entryId) {
      result = await client.query(
        `SELECT id, "entryId", "encryptedFilename", "filenameIv", "dataIv", "mimeType", "size", "createdAt"
         FROM "${session.user.schemaName}"."entry_images"
         WHERE "entryId" = $1
         ORDER BY "createdAt" DESC`,
        [entryId]
      );
    } else {
      // Get unattached images (for image gallery)
      result = await client.query(
        `SELECT id, "entryId", "encryptedFilename", "filenameIv", "dataIv", "mimeType", "size", "createdAt"
         FROM "${session.user.schemaName}"."entry_images"
         WHERE "entryId" IS NULL
         ORDER BY "createdAt" DESC
         LIMIT 50`
      );
    }

    return NextResponse.json({ images: result.rows });
  } finally {
    client.release();
  }
}

// POST /api/images - Upload a new image
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validatedData = uploadImageSchema.parse(body);

    // Check file size (encrypted data will be ~33% larger due to base64)
    const estimatedSize = (validatedData.encryptedData.length * 3) / 4;
    if (estimatedSize > MAX_FILE_SIZE * 1.5) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 5MB.' },
        { status: 400 }
      );
    }

    // Ensure the entry_images table exists (migration for existing schemas)
    await ensureMigration(session.user.schemaName);

    // Ensure user's upload directory exists
    const userDir = await ensureUserDir(session.user.schemaName);

    const imageId = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const filePath = path.join(userDir, `${imageId}.enc`);

    // Write encrypted data to filesystem
    await fs.writeFile(filePath, validatedData.encryptedData, 'utf-8');

    const client = await pool.connect();
    try {
      // Store metadata in database (but NOT the encrypted data)
      const result = await client.query(
        `INSERT INTO "${session.user.schemaName}"."entry_images"
         (id, "entryId", "encryptedFilename", "filenameIv", "dataIv", "mimeType", "size", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         RETURNING id, "entryId", "mimeType", "size", "createdAt"`,
        [
          imageId,
          validatedData.entryId || null,
          validatedData.encryptedFilename,
          validatedData.filenameIv,
          validatedData.dataIv,
          validatedData.mimeType,
          validatedData.size,
        ]
      );

      return NextResponse.json({ image: result.rows[0] }, { status: 201 });
    } catch (dbError) {
      // Clean up file if database insert fails
      await fs.unlink(filePath).catch(() => {});
      throw dbError;
    } finally {
      client.release();
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error('Image upload error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `Upload failed: ${errorMessage}` }, { status: 500 });
  }
}
