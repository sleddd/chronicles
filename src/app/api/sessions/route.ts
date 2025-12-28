import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

// GET /api/sessions - List all active sessions for current user
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sessions = await prisma.session.findMany({
    where: {
      accountId: session.user.id,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      deviceInfo: true,
      ipAddress: true,
      lastActiveAt: true,
      createdAt: true,
    },
    orderBy: { lastActiveAt: 'desc' },
  });

  return NextResponse.json({ sessions });
}
