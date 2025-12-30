import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { getPool } from '@/lib/db/schemaManager';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

const reencryptSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(12)
    .regex(/[A-Z]/)
    .regex(/[a-z]/)
    .regex(/[0-9]/),
  // Re-encrypted data from client
  entries: z.array(z.object({
    id: z.string(),
    encryptedContent: z.string(),
    iv: z.string(),
  })),
  topics: z.array(z.object({
    id: z.string(),
    encryptedName: z.string(),
    iv: z.string(),
  })),
  customFields: z.array(z.object({
    id: z.string(),
    encryptedData: z.string(),
    iv: z.string(),
  })),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validatedData = reencryptSchema.parse(body);

    // Verify current password
    const account = await prisma.account.findUnique({
      where: { id: session.user.id },
    });

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const isValidPassword = await bcrypt.compare(
      validatedData.currentPassword,
      account.passwordHash
    );

    if (!isValidPassword) {
      return NextResponse.json(
        { error: 'Current password is incorrect' },
        { status: 401 }
      );
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(validatedData.newPassword, 10);

    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Update all entries with re-encrypted content
      for (const entry of validatedData.entries) {
        await client.query(
          `UPDATE "${session.user.schemaName}"."entries"
           SET "encryptedContent" = $1, iv = $2, "updatedAt" = NOW()
           WHERE id = $3`,
          [entry.encryptedContent, entry.iv, entry.id]
        );
      }

      // Update all topics with re-encrypted names
      for (const topic of validatedData.topics) {
        await client.query(
          `UPDATE "${session.user.schemaName}"."topics"
           SET "encryptedName" = $1, iv = $2
           WHERE id = $3`,
          [topic.encryptedName, topic.iv, topic.id]
        );
      }

      // Update all custom fields with re-encrypted data
      for (const cf of validatedData.customFields) {
        await client.query(
          `UPDATE "${session.user.schemaName}"."custom_fields"
           SET "encryptedData" = $1, iv = $2
           WHERE id = $3`,
          [cf.encryptedData, cf.iv, cf.id]
        );
      }

      // Update account password
      await prisma.account.update({
        where: { id: session.user.id },
        data: { passwordHash: newPasswordHash },
      });

      // Revoke all other sessions
      await prisma.session.updateMany({
        where: {
          accountId: session.user.id,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
          revokedReason: 'password_change',
        },
      });

      await client.query('COMMIT');

      return NextResponse.json({
        success: true,
        message: 'Password changed and all data re-encrypted.',
        entriesUpdated: validatedData.entries.length,
        topicsUpdated: validatedData.topics.length,
        customFieldsUpdated: validatedData.customFields.length,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Re-encryption error:', error);
    return NextResponse.json(
      { error: 'Failed to re-encrypt data', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// GET endpoint to fetch all encrypted data for re-encryption
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const pool = getPool();
    const client = await pool.connect();

    try {
      // Fetch all entries
      const entriesResult = await client.query(
        `SELECT id, "encryptedContent", iv FROM "${session.user.schemaName}"."entries"`
      );

      // Fetch all topics
      const topicsResult = await client.query(
        `SELECT id, "encryptedName", iv FROM "${session.user.schemaName}"."topics"`
      );

      // Fetch all custom fields
      const customFieldsResult = await client.query(
        `SELECT id, "encryptedData", iv FROM "${session.user.schemaName}"."custom_fields"`
      );

      return NextResponse.json({
        entries: entriesResult.rows,
        topics: topicsResult.rows,
        customFields: customFieldsResult.rows,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Fetch encrypted data error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch data', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
