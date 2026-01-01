import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';

const saltRequestSchema = z.object({
  email: z.string().email('Invalid email format'),
});

// POST - Get salt and encrypted master key by email (for login)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = saltRequestSchema.parse(body);

    const account = await prisma.account.findUnique({
      where: { email },
      select: {
        salt: true,
        encryptedMasterKey: true,
      },
    });

    if (!account) {
      // Return generic error to prevent email enumeration
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Parse encrypted master key if available (format: "encryptedKey:iv")
    let encryptedMasterKey = null;
    let masterKeyIv = null;
    if (account.encryptedMasterKey) {
      const parts = account.encryptedMasterKey.split(':');
      if (parts.length === 2) {
        encryptedMasterKey = parts[0];
        masterKeyIv = parts[1];
      }
    }

    return NextResponse.json({
      salt: account.salt,
      encryptedMasterKey,
      masterKeyIv,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Salt retrieval error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}

// GET - Get salt for authenticated user (for registration key setup)
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const account = await prisma.account.findUnique({
    where: { id: session.user.id },
    select: { salt: true },
  });

  if (!account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  return NextResponse.json({ salt: account.salt });
}
