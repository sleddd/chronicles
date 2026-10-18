import { prisma } from './prisma.js';

/* The account's consent record (Health Data Compliance Pack, part 7): when it
   agreed, the 18+ confirmation, which Terms and Health policy versions, health
   data consent (or when it was withdrawn), and how to send a breach notice.
   No health data, so it stays readable. A postal address is kept only when the
   person chose mailed notices, and only for that. */

export interface ConsentRecord {
  agreedAt: string;
  ageConfirmed: boolean;
  termsVersion: string;
  healthVersion: string;
  healthConsentWithdrawnAt: string | null;
  breachNotice: 'email' | 'mail';
  postalAddress: string | null;
}

export async function initConsentTable(): Promise<void> {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS public.account_consent (
      account_id                   INT PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,
      agreed_at                    TIMESTAMPTZ NOT NULL,
      age_confirmed                BOOLEAN NOT NULL,
      terms_version                TEXT NOT NULL,
      health_version               TEXT NOT NULL,
      health_consent_withdrawn_at  TIMESTAMPTZ,
      breach_notice                TEXT NOT NULL CHECK (breach_notice IN ('email', 'mail')),
      postal_address               TEXT
    )
  `;
}

type Row = {
  agreed_at: Date; age_confirmed: boolean; terms_version: string; health_version: string;
  health_consent_withdrawn_at: Date | null; breach_notice: 'email' | 'mail'; postal_address: string | null;
};

export async function getConsent(accountId: number): Promise<ConsentRecord | null> {
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT agreed_at, age_confirmed, terms_version, health_version, health_consent_withdrawn_at, breach_notice, postal_address
    FROM public.account_consent WHERE account_id = ${accountId}
  `;
  const r = rows[0];
  if (!r) return null;
  return {
    agreedAt: r.agreed_at.toISOString(),
    ageConfirmed: r.age_confirmed,
    termsVersion: r.terms_version,
    healthVersion: r.health_version,
    healthConsentWithdrawnAt: r.health_consent_withdrawn_at ? r.health_consent_withdrawn_at.toISOString() : null,
    breachNotice: r.breach_notice,
    postalAddress: r.postal_address,
  };
}

export async function saveConsent(accountId: number, c: {
  termsVersion: string; healthVersion: string; breachNotice: 'email' | 'mail'; postalAddress: string | null;
}): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO public.account_consent
      (account_id, agreed_at, age_confirmed, terms_version, health_version, health_consent_withdrawn_at, breach_notice, postal_address)
    VALUES (${accountId}, NOW(), TRUE, ${c.termsVersion}, ${c.healthVersion}, NULL, ${c.breachNotice}, ${c.postalAddress})
    ON CONFLICT (account_id) DO UPDATE SET
      agreed_at = NOW(), age_confirmed = TRUE, terms_version = ${c.termsVersion}, health_version = ${c.healthVersion},
      health_consent_withdrawn_at = NULL, breach_notice = ${c.breachNotice}, postal_address = ${c.postalAddress}
  `;
}

export async function saveBreachNotice(accountId: number, breachNotice: 'email' | 'mail', postalAddress: string | null): Promise<number> {
  return prisma.$executeRaw`
    UPDATE public.account_consent SET breach_notice = ${breachNotice}, postal_address = ${postalAddress}
    WHERE account_id = ${accountId}
  `;
}
