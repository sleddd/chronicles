import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

// POST /api/sessions/[id]/revoke - Revoke a specific session
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  // Verify the session belongs to this user
  const targetSession = await prisma.session.findFirst({
    where: {
      id,
      accountId: session.user.id,
    },
  });

  if (!targetSession) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  await prisma.session.update({
    where: { id },
    data: {
      revokedAt: new Date(),
      revokedReason: 'user_revoked',
    },
  });

  return NextResponse.json({ success: true, message: 'Session revoked' });
}
