import { prisma } from './prisma.js';
import crypto from 'crypto';

// =============================================================================
// Shares Table (public schema)
//
// Shared content is stored as PLAINTEXT by design — creating a public link is
// an explicit opt-out of zero-knowledge for that entry; the user assumes the
// risk. Shares are tied to the entry they were created from (entry_id is the
// id within the owner's tenant schema) so the UI can list links per entry.
// =============================================================================

export interface Share {
  id: number;
  token: string;
  accountId: number;
  entryId: number | null;
  content: string | null;
  createdAt: Date;
  expiresAt: Date | null;
  isActive: boolean;
}

/** Ensure the shares table exists in the public schema */
export async function initSharesTable(): Promise<void> {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS public.shares (
      id             SERIAL PRIMARY KEY,
      token          VARCHAR(64) UNIQUE NOT NULL,
      account_id     INT NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
      entry_id       INT,
      content        TEXT,
      created_at     TIMESTAMPTZ DEFAULT NOW(),
      expires_at     TIMESTAMPTZ,
      is_active      BOOLEAN DEFAULT TRUE
    )
  `;
  // Migrate tables created by the old encrypted-share schema
  await prisma.$executeRaw`ALTER TABLE public.shares ADD COLUMN IF NOT EXISTS entry_id INT`;
  await prisma.$executeRaw`ALTER TABLE public.shares ADD COLUMN IF NOT EXISTS content TEXT`;
  await prisma.$executeRaw`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'shares' AND column_name = 'content_encrypted') THEN
        ALTER TABLE public.shares ALTER COLUMN content_encrypted DROP NOT NULL;
        ALTER TABLE public.shares ALTER COLUMN content_iv DROP NOT NULL;
      END IF;
    END $$
  `;
}

/** Create a new share record, returns the token */
export async function createShare(data: {
  accountId: number;
  entryId: number;
  content: string;
  expiresAt?: Date | null;
}): Promise<Share> {
  const token = crypto.randomBytes(24).toString('base64url');

  const rows = await prisma.$queryRaw<Share[]>`
    INSERT INTO public.shares
      (token, account_id, entry_id, content, expires_at)
    VALUES
      (${token}, ${data.accountId}, ${data.entryId}, ${data.content}, ${data.expiresAt ?? null})
    RETURNING
      id, token, account_id AS "accountId",
      entry_id AS "entryId",
      content,
      created_at AS "createdAt",
      expires_at AS "expiresAt",
      is_active AS "isActive"
  `;

  return rows[0];
}

/** Fetch a share by token (public — no auth required) */
export async function getShareByToken(token: string): Promise<Share | null> {
  const rows = await prisma.$queryRaw<Share[]>`
    SELECT
      id, token, account_id AS "accountId",
      entry_id AS "entryId",
      content,
      created_at AS "createdAt",
      expires_at AS "expiresAt",
      is_active AS "isActive"
    FROM public.shares
    WHERE token = ${token}
      AND is_active = TRUE
      AND (expires_at IS NULL OR expires_at > NOW())
  `;
  return rows[0] ?? null;
}

/**
 * Revoke a share — only the owner can do this. The row (and its plaintext)
 * is deleted, not just switched off.
 */
export async function revokeShare(token: string, accountId: number): Promise<boolean> {
  const result = await prisma.$executeRaw`
    DELETE FROM public.shares
    WHERE token = ${token} AND account_id = ${accountId}
  `;
  return (result as unknown as number) > 0;
}

/** Delete every share made from an entry — its plaintext must not outlive the entry. */
export async function deleteSharesForEntry(accountId: number, entryId: number): Promise<number> {
  const result = await prisma.$executeRaw`
    DELETE FROM public.shares WHERE account_id = ${accountId} AND entry_id = ${entryId}
  `;
  return result as unknown as number;
}

/**
 * Delete shares that can no longer be viewed: expired ones, and rows left
 * switched off by the old soft revoke. Run at startup and periodically.
 */
export async function purgeDeadShares(): Promise<number> {
  const result = await prisma.$executeRaw`
    DELETE FROM public.shares
    WHERE is_active = FALSE OR (expires_at IS NOT NULL AND expires_at <= NOW())
  `;
  return result as unknown as number;
}

/** List all active shares for an account (content omitted — list metadata only) */
export async function getSharesByAccount(accountId: number): Promise<Share[]> {
  return prisma.$queryRaw<Share[]>`
    SELECT
      id, token, account_id AS "accountId",
      entry_id AS "entryId",
      NULL AS content,
      created_at AS "createdAt",
      expires_at AS "expiresAt",
      is_active AS "isActive"
    FROM public.shares
    WHERE account_id = ${accountId} AND is_active = TRUE
    ORDER BY created_at DESC
  `;
}
