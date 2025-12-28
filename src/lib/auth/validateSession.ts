import { prisma } from '@/lib/db/prisma';
import crypto from 'crypto';

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function validateSession(sessionToken: string) {
  const hashedToken = hashToken(sessionToken);

  const session = await prisma.session.findUnique({
    where: { sessionToken: hashedToken },
    include: { account: true },
  });

  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt < new Date()) return null;

  // Update last active timestamp
  await prisma.session.update({
    where: { id: session.id },
    data: { lastActiveAt: new Date() },
  });

  return session;
}
