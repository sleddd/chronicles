import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';

const setupKeysSchema = z.object({
  encryptedMasterKey: z.string(),
  masterKeyIv: z.string(),
  encryptedMasterKeyWithRecovery: z.string(),
  recoveryKeyIv: z.string(),
  recoveryKeySalt: z.string(),
});

// POST /api/user/setup-keys - Store wrapped master keys after registration
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validatedData = setupKeysSchema.parse(body);

    // Update the account with the wrapped keys
    await prisma.account.update({
      where: { id: session.user.id },
      data: {
        encryptedMasterKey: `${validatedData.encryptedMasterKey}:${validatedData.masterKeyIv}`,
        encryptedMasterKeyWithRecovery: `${validatedData.encryptedMasterKeyWithRecovery}:${validatedData.recoveryKeyIv}`,
        recoveryKeySalt: validatedData.recoveryKeySalt,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 });
    }
    console.error('Setup keys error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/user/setup-keys - Check if keys are set up
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const account = await prisma.account.findUnique({
    where: { id: session.user.id },
    select: {
      encryptedMasterKey: true,
      encryptedMasterKeyWithRecovery: true,
    },
  });

  return NextResponse.json({
    hasEncryptedMasterKey: !!account?.encryptedMasterKey,
    hasRecoveryKey: !!account?.encryptedMasterKeyWithRecovery,
  });
}
