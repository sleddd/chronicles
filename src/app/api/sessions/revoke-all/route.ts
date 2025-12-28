import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

// POST /api/sessions/revoke-all - Revoke all sessions except current
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await prisma.session.updateMany({
    where: {
      accountId: session.user.id,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
      revokedReason: 'user_revoked_all',
    },
  });

  return NextResponse.json({
    success: true,
    revokedCount: result.count,
    message: `${result.count} session(s) revoked`,
  });
}
