import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password required'),
  newPassword: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .regex(/[A-Z]/, 'Must contain uppercase letter')
    .regex(/[a-z]/, 'Must contain lowercase letter')
    .regex(/[0-9]/, 'Must contain number'),
  newEncryptedMasterKey: z.string().min(1, 'Encrypted master key required'),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = changePasswordSchema.parse(body);

    // Fetch current account
    const account = await prisma.account.findUnique({
      where: { id: session.user.id },
    });

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Verify current password
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

    // Update account with new password and re-encrypted master key
    await prisma.account.update({
      where: { id: session.user.id },
      data: {
        passwordHash: newPasswordHash,
        encryptedMasterKey: validatedData.newEncryptedMasterKey,
      },
    });

    // SECURITY: Revoke ALL other sessions (immediate logout everywhere)
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

    return NextResponse.json({
      success: true,
      message: 'Password changed. All other sessions have been logged out.',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Password change error:', error);
    return NextResponse.json(
      { error: 'Failed to change password' },
      { status: 500 }
    );
  }
}
