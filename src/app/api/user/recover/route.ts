import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rateLimit';

const recoverSchema = z.object({
  email: z.string().email('Invalid email format'),
  newPassword: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  // These are the re-wrapped master key with the new password
  encryptedMasterKey: z.string(),
  masterKeyIv: z.string(),
});

// POST /api/user/recover - Reset password using recovery key
// The client uses the recovery key to unwrap the master key, then re-wraps it with the new password
export async function POST(request: NextRequest) {
  // Rate limiting by IP
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const rateLimit = checkRateLimit(`recover:${ip}`, RATE_LIMITS.register);

  if (!rateLimit.success) {
    return NextResponse.json(
      { error: 'Too many recovery attempts. Please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': Math.ceil((rateLimit.resetAt - Date.now()) / 1000).toString(),
        },
      }
    );
  }

  try {
    const body = await request.json();
    const validatedData = recoverSchema.parse(body);

    // Find the user
    const account = await prisma.account.findUnique({
      where: { email: validatedData.email },
      select: {
        id: true,
        salt: true,
        encryptedMasterKeyWithRecovery: true,
        recoveryKeySalt: true,
      },
    });

    if (!account) {
      // Don't reveal whether the email exists
      return NextResponse.json(
        { error: 'Recovery failed. Please check your email and recovery key.' },
        { status: 400 }
      );
    }

    // Verify recovery key was set up
    if (!account.encryptedMasterKeyWithRecovery || !account.recoveryKeySalt) {
      return NextResponse.json(
        { error: 'Recovery key was not set up for this account.' },
        { status: 400 }
      );
    }

    // Hash the new password
    const passwordHash = await bcrypt.hash(validatedData.newPassword, 10);

    // Update the account with new password hash and re-wrapped master key
    await prisma.account.update({
      where: { id: account.id },
      data: {
        passwordHash,
        encryptedMasterKey: `${validatedData.encryptedMasterKey}:${validatedData.masterKeyIv}`,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Password has been reset successfully.',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Recovery error:', error);
    return NextResponse.json(
      { error: 'An error occurred during recovery' },
      { status: 500 }
    );
  }
}

// GET /api/user/recover - Get recovery data (salt and wrapped key) for client-side decryption
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email');

  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  // Rate limiting
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const rateLimit = checkRateLimit(`recover-get:${ip}`, RATE_LIMITS.register);

  if (!rateLimit.success) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': Math.ceil((rateLimit.resetAt - Date.now()) / 1000).toString(),
        },
      }
    );
  }

  try {
    const account = await prisma.account.findUnique({
      where: { email },
      select: {
        salt: true,
        encryptedMasterKeyWithRecovery: true,
        recoveryKeySalt: true,
      },
    });

    if (!account || !account.encryptedMasterKeyWithRecovery || !account.recoveryKeySalt) {
      // Don't reveal whether the email exists or has recovery set up
      return NextResponse.json(
        { error: 'Recovery not available for this account.' },
        { status: 400 }
      );
    }

    // Parse the stored format: "encryptedKey:iv"
    const [encryptedKey, iv] = account.encryptedMasterKeyWithRecovery.split(':');

    return NextResponse.json({
      salt: account.salt, // For re-wrapping with new password
      recoveryKeySalt: account.recoveryKeySalt, // For deriving key from recovery key
      encryptedMasterKey: encryptedKey,
      masterKeyIv: iv,
    });
  } catch (error) {
    console.error('Recovery data fetch error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
