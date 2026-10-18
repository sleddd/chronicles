/**
 * Legal text versions and the business details shown in the Health Data
 * Privacy Policy and Terms. Bump a version (the date it takes effect) when its
 * text changes in a way that matters: everyone is asked to agree again, for
 * just the changed item. Fill the placeholders before publishing.
 */
export const LEGAL_VERSIONS = {
  /** Terms of Service, including the risk notice and image rules */
  terms: '2026-10-18',
  /** Consumer Health Data Privacy Policy */
  health: '2026-10-18',
} as const;

export const LEGAL_DETAILS = {
  /** Not a filed entity yet — the app's name until one is */
  businessName: 'Chronicles',
  contactEmail: 'support@mydailychronicles.com',
  effectiveDate: 'October 18, 2026',
  hostingProvider: 'Render (render.com)',
  hostingPrivacy: 'https://render.com/privacy',
  databaseProvider: 'Prisma (prisma.io)',
  databasePrivacy: 'https://www.prisma.io/legal/privacy',
  /** Prisma Postgres keeps daily snapshots (on days with changes) for 7 days on Starter/Pro, 30 on Business —
   *  30 is true on every plan. Update if the plan or provider changes. */
  backupDays: '30',
  /** Every email (privacy, abuse, safety) goes to support */
  abuseEmail: 'support@mydailychronicles.com',
} as const;
