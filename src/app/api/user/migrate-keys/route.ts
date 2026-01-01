import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { prisma, createUserPool } from '@/lib/db/prisma';
import { z } from 'zod';

const migrateKeysSchema = z.object({
  // Re-encrypted data
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
  // New master key wrapped with password
  encryptedMasterKey: z.string(),
  masterKeyIv: z.string(),
  // New master key wrapped with recovery key
  encryptedMasterKeyWithRecovery: z.string(),
  recoveryKeyIv: z.string(),
  recoveryKeySalt: z.string(),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const pool = createUserPool();
  const client = await pool.connect();

  try {
    const body = await request.json();
    const data = migrateKeysSchema.parse(body);
    const schemaName = session.user.schemaName;

    // Start transaction
    await client.query('BEGIN');

    // Update all entries with new encryption
    for (const entry of data.entries) {
      await client.query(
        `UPDATE "${schemaName}"."entries"
         SET "encryptedContent" = $1, "iv" = $2, "updatedAt" = NOW()
         WHERE id = $3`,
        [entry.encryptedContent, entry.iv, entry.id]
      );
    }

    // Update all topics with new encryption
    for (const topic of data.topics) {
      await client.query(
        `UPDATE "${schemaName}"."topics"
         SET "encryptedName" = $1, "iv" = $2
         WHERE id = $3`,
        [topic.encryptedName, topic.iv, topic.id]
      );
    }

    // Update all custom fields with new encryption
    for (const cf of data.customFields) {
      await client.query(
        `UPDATE "${schemaName}"."custom_fields"
         SET "encryptedData" = $1, "iv" = $2
         WHERE id = $3`,
        [cf.encryptedData, cf.iv, cf.id]
      );
    }

    // Update account with new master key and recovery key
    await prisma.account.update({
      where: { id: session.user.id },
      data: {
        encryptedMasterKey: `${data.encryptedMasterKey}:${data.masterKeyIv}`,
        encryptedMasterKeyWithRecovery: `${data.encryptedMasterKeyWithRecovery}:${data.recoveryKeyIv}`,
        recoveryKeySalt: data.recoveryKeySalt,
      },
    });

    // Commit transaction
    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      entriesUpdated: data.entries.length,
      topicsUpdated: data.topics.length,
      customFieldsUpdated: data.customFields.length,
    });
  } catch (error) {
    await client.query('ROLLBACK');

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 });
    }

    console.error('Migration error:', error);
    return NextResponse.json({ error: 'Migration failed' }, { status: 500 });
  } finally {
    client.release();
  }
}
