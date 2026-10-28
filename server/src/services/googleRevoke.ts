import { prisma } from '../db/prisma.js';
import { decryptToken, googleTokenAad } from './tokenCrypto.js';

const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

/**
 * Revoke Chronicles' access at Google for an account's Calendar connection.
 * Deleting the refresh token from the database alone would leave it live at
 * Google, so account deletion (in-app and the admin script) calls this first.
 * Best effort: a network failure is logged and never blocks the deletion.
 */
export async function revokeGoogleAccess(accountId: number): Promise<boolean> {
  const integration = await prisma.calendarIntegration.findUnique({
    where: { accountId },
    select: { googleRefreshToken: true },
  });
  if (!integration?.googleRefreshToken) return false;
  try {
    const token = decryptToken(integration.googleRefreshToken, googleTokenAad(accountId));
    const res = await fetch(GOOGLE_REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
    });
    return res.ok;
  } catch (err) {
    console.error('Google token revocation failed (continuing):', err instanceof Error ? err.message : err);
    return false;
  }
}
