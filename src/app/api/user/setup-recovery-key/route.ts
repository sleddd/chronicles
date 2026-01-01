import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';

const setupRecoveryKeySchema = z.object({
  encryptedMasterKeyWithRecovery: z.string(),
  recoveryKeyIv: z.string(),
  recoveryKeySalt: z.string(),
});

// POST /api/user/setup-recovery-key - Add recovery key to existing master key account
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validatedData = setupRecoveryKeySchema.parse(body);

    // Verify user has an encrypted master key but no recovery key
    const account = await prisma.account.findUnique({
      where: { id: session.user.id },
      select: {
        encryptedMasterKey: true,
        encryptedMasterKeyWithRecovery: true,
      },
    });

    if (!account?.encryptedMasterKey) {
      return NextResponse.json(
        { error: 'Account does not have master key encryption set up' },
        { status: 400 }
      );
    }

    if (account.encryptedMasterKeyWithRecovery) {
      return NextResponse.json(
        { error: 'Recovery key already exists' },
        { status: 400 }
      );
    }

    // Add the recovery key
    await prisma.account.update({
      where: { id: session.user.id },
      data: {
        encryptedMasterKeyWithRecovery: `${validatedData.encryptedMasterKeyWithRecovery}:${validatedData.recoveryKeyIv}`,
        recoveryKeySalt: validatedData.recoveryKeySalt,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 });
    }
    console.error('Setup recovery key error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
