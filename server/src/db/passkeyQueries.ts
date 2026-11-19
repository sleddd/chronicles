import { prisma } from './prisma.js';

/*
 * Passkeys: one row per passkey an account has added. The server keeps the
 * public key (to check a signature) and that passkey's wrap of the master key
 * — ciphertext under a secret only the authenticator can produce, after its
 * fingerprint / face / PIN check. Neither opens anything by itself.
 * Deleting the account cascades.
 */

export const MAX_PASSKEYS = 10;

export interface StoredPasskey {
  id: number;
  accountId: number;
  credentialId: string;
  publicKey: Uint8Array;
  signCount: number;
  transports: string[];
  backedUp: boolean;
  name: string;
  wrappedMK: Uint8Array;
  wrapIv: Uint8Array;
  createdAt: Date;
  lastUsedAt: Date | null;
}

interface Row {
  id: number; account_id: number; credential_id: string; public_key: Uint8Array; sign_count: bigint | number;
  transports: string[]; backed_up: boolean; name: string; wrapped_mk: Uint8Array; wrap_iv: Uint8Array;
  created_at: Date; last_used_at: Date | null;
}

const fromRow = (r: Row): StoredPasskey => ({
  id: r.id, accountId: r.account_id, credentialId: r.credential_id, publicKey: new Uint8Array(r.public_key),
  signCount: Number(r.sign_count), transports: r.transports ?? [], backedUp: r.backed_up, name: r.name,
  wrappedMK: new Uint8Array(r.wrapped_mk), wrapIv: new Uint8Array(r.wrap_iv), createdAt: r.created_at, lastUsedAt: r.last_used_at,
});

export async function initPasskeysTable(): Promise<void> {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS public.passkeys (
      id            SERIAL PRIMARY KEY,
      account_id    INT NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
      credential_id TEXT UNIQUE NOT NULL,
      public_key    BYTEA NOT NULL,
      sign_count    BIGINT NOT NULL DEFAULT 0,
      transports    TEXT[] NOT NULL DEFAULT '{}',
      backed_up     BOOLEAN NOT NULL DEFAULT false,
      name          VARCHAR(60) NOT NULL,
      wrapped_mk    BYTEA NOT NULL,
      wrap_iv       BYTEA NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at  TIMESTAMPTZ
    )
  `;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS passkeys_account_idx ON public.passkeys (account_id)`;
}

export async function listPasskeys(accountId: number): Promise<StoredPasskey[]> {
  const rows = await prisma.$queryRaw<Row[]>`SELECT * FROM public.passkeys WHERE account_id = ${accountId} ORDER BY created_at, id`;
  return rows.map(fromRow);
}

export async function findPasskey(credentialId: string): Promise<StoredPasskey | null> {
  const rows = await prisma.$queryRaw<Row[]>`SELECT * FROM public.passkeys WHERE credential_id = ${credentialId}`;
  return rows[0] ? fromRow(rows[0]) : null;
}

/**
 * Add a passkey. False when the account is at its limit or the credential is
 * already stored — the count is checked in the same statement, so two requests
 * at once can't pass it together.
 */
export async function addPasskey(p: {
  accountId: number; credentialId: string; publicKey: Uint8Array; signCount: number;
  transports: string[]; backedUp: boolean; name: string; wrappedMK: Uint8Array; wrapIv: Uint8Array;
}): Promise<boolean> {
  const added = await prisma.$executeRaw`
    INSERT INTO public.passkeys (account_id, credential_id, public_key, sign_count, transports, backed_up, name, wrapped_mk, wrap_iv)
    SELECT ${p.accountId}, ${p.credentialId}, ${Buffer.from(p.publicKey)}, ${p.signCount}, ${p.transports}::text[], ${p.backedUp}, ${p.name}, ${Buffer.from(p.wrappedMK)}, ${Buffer.from(p.wrapIv)}
    WHERE (SELECT COUNT(*) FROM public.passkeys WHERE account_id = ${p.accountId}) < ${MAX_PASSKEYS}
    ON CONFLICT (credential_id) DO NOTHING`;
  return added === 1;
}

/** A passkey was used: its signature counter, sync state and last use. */
export async function notePasskeyUsed(id: number, signCount: number, backedUp: boolean): Promise<void> {
  await prisma.$executeRaw`UPDATE public.passkeys SET sign_count = ${signCount}, backed_up = ${backedUp}, last_used_at = NOW() WHERE id = ${id}`;
}

export async function renamePasskey(accountId: number, id: number, name: string): Promise<boolean> {
  return (await prisma.$executeRaw`UPDATE public.passkeys SET name = ${name} WHERE id = ${id} AND account_id = ${accountId}`) === 1;
}

export async function removePasskey(accountId: number, id: number): Promise<boolean> {
  return (await prisma.$executeRaw`DELETE FROM public.passkeys WHERE id = ${id} AND account_id = ${accountId}`) === 1;
}

export async function removeAllPasskeys(accountId: number): Promise<number> {
  return prisma.$executeRaw`DELETE FROM public.passkeys WHERE account_id = ${accountId}`;
}

/** One of the account's passkeys by its row id (a passkey sign-in waiting on its 2FA code). */
export async function findAccountPasskey(id: number, accountId: number): Promise<StoredPasskey | null> {
  const rows = await prisma.$queryRaw<Row[]>`SELECT * FROM public.passkeys WHERE id = ${id} AND account_id = ${accountId}`;
  return rows[0] ? fromRow(rows[0]) : null;
}

/** Still there? Checked once a passkey sign-in's session exists (it may have been removed meanwhile). */
export async function passkeyExists(id: number, accountId: number): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ n: number }[]>`SELECT 1 AS n FROM public.passkeys WHERE id = ${id} AND account_id = ${accountId}`;
  return rows.length > 0;
}

export async function countPasskeyAccounts(): Promise<number> {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(DISTINCT account_id) AS n FROM public.passkeys`;
  return Number(rows[0]?.n ?? 0);
}
