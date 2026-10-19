import { z } from 'zod';

// Auth validation
export const emailSchema = z.string().email('Invalid email address');
export const usernameSchema = z.string().min(3, 'Username must be at least 3 characters').max(30);
export const passwordSchema = z.string()
  .min(12, 'Password must be at least 12 characters')
  .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Must contain at least one number')
  .regex(/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/, 'Must contain at least one special character');

// The server never receives the password or the recovery key — only secrets
// derived from them (`deriveAuthSecret` / `deriveRecoveryProof` in
// shared/src/crypto/authSecret.ts). Password rules are therefore checked on
// the client with passwordSchema; the server can only check the shape.
export const authSecretSchema = z.string().regex(/^[a-f0-9]{64}$/, 'Invalid credentials');
const recoveryProofSchema = z.string().regex(/^[a-f0-9]{64}$/, 'Invalid recovery key hash');
const recoverySaltSchema = z.string().regex(/^[a-f0-9]{32}$/, 'Invalid recovery key salt');
// Base64 key material: a wrapped 32-byte key is ~64 chars, salts and IVs ~24
const wrappedKeySchema = z.string().min(1).max(1024);
const saltOrIvSchema = z.string().min(1).max(64);

export const registerSchema = z.object({
  email: emailSchema,
  username: usernameSchema,
  authSecret: authSecretSchema,
  encryptedMasterKey: wrappedKeySchema,
  kekSalt: saltOrIvSchema,
  kekWrapIv: saltOrIvSchema,
  recoveryWrappedMK: wrappedKeySchema,
  recoveryWrapIv: saltOrIvSchema,
  recoveryKeyHash: recoveryProofSchema,
  recoveryKeySalt: recoverySaltSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  authSecret: authSecretSchema,
  // Sent once, only when the server answers `legacyAuth`: accounts created
  // before derived secrets still hold a hash of the password itself
  legacyPassword: z.string().min(1).max(1024).optional(),
});

export const changePasswordSchema = z.object({
  currentAuthSecret: authSecretSchema,
  newAuthSecret: authSecretSchema,
  newEncryptedMasterKey: wrappedKeySchema,
  newKekSalt: saltOrIvSchema,
  newKekWrapIv: saltOrIvSchema,
});

export const recoverSchema = z.object({
  email: emailSchema,
  recoveryProof: recoveryProofSchema,
  newAuthSecret: authSecretSchema,
  newEncryptedMasterKey: wrappedKeySchema,
  newKekSalt: saltOrIvSchema,
  newKekWrapIv: saltOrIvSchema,
  newRecoveryWrappedMK: wrappedKeySchema,
  newRecoveryWrapIv: saltOrIvSchema,
  newRecoveryKeyHash: recoveryProofSchema,
  newRecoveryKeySalt: recoverySaltSchema,
  // Authenticator or backup code — required when the account has 2FA on, so a
  // recovery key alone can't bypass two-factor
  code: z.string().min(1).max(64).optional(),
});

// 2FA / TOTP validation
export const twoFALoginSchema = z.object({
  pendingToken: z.string().min(1).max(128),
  code: z.string().min(1).max(64),
});

// Turning 2FA on replaces the authenticator secret and backup codes, so it
// needs the current password — a stolen session alone must not be able to
// swap in an attacker's authenticator and lock the owner out
export const enable2FASchema = z.object({
  secret: z.string().regex(/^[A-Z2-7]{16,128}=*$/, 'Invalid secret'),
  code: z.string().length(6),
  currentAuthSecret: authSecretSchema,
});

// Turning 2FA off needs the password AND a current authenticator/backup code,
// so a stolen session plus a phished password isn't enough to strip it
export const disable2FASchema = z.object({
  authSecret: authSecretSchema,
  code: z.string().min(1).max(64),
});

// Deleting the account is permanent: password, plus a 2FA code when 2FA is on
export const deleteAccountSchema = z.object({
  authSecret: authSecretSchema,
  code: z.string().min(1).max(64).optional(),
});

// Account changes that could lock the owner out require the current password,
// so a session left signed in on an unattended device isn't enough
export const changeEmailSchema = z.object({
  newEmail: z.string().min(1, 'Email is required').max(254),
  currentAuthSecret: authSecretSchema,
  // The sign-in secret is salted with the email, so it changes with it
  newAuthSecret: authSecretSchema,
});

export const saveRecoveryKeySchema = z.object({
  currentAuthSecret: authSecretSchema,
  recoveryWrappedMK: wrappedKeySchema,
  recoveryWrapIv: saltOrIvSchema,
  recoveryKeyHash: recoveryProofSchema,
  recoveryKeySalt: recoverySaltSchema,
});

// Shares validation — shared content is stored as plaintext by design; the
// user opts into that risk when creating a public link
/** Shares never carry images: photos, drawings (SVG) or any embedded media.
 *  Checked by the server (createShareSchema) and stripped first by the client. */
const SHARE_MEDIA = /<\s*(img|svg|picture|source|video|audio|iframe|object|embed|canvas|image)\b|data-type\s*=\s*["']?drawing|data:(image|video|audio)\/|url\(\s*["']?\s*(data|blob|https?):/i;

export function shareContentHasMedia(content: string): boolean {
  return SHARE_MEDIA.test(content);
}

export const createShareSchema = z.object({
  content: z.string().min(1, 'content is required').max(100_000, 'Content too large')
    .refine(c => !shareContentHasMedia(c), 'Shared entries cannot include images or drawings'),
  entryId: z.number().int().positive(),
  expiresAt: z.string().datetime().nullable().optional(),
});

// Entries are always end-to-end encrypted: the server never accepts plaintext
// content or metadata (the client also refuses to display plaintext posts).
const ENCRYPTED_FIELD = z.string().min(1).max(2_000_000);
const IV_FIELD = z.string().min(1).max(64);
// One cap for metadata on create and update — when they differed, an entry
// could be created that no later edit was allowed to save
const METADATA_FIELD = z.string().min(1).max(200_000, 'Metadata too large');

export const createPostSchema = z.object({
  contentEncrypted: ENCRYPTED_FIELD,
  contentIv: IV_FIELD,
  metadataEncrypted: METADATA_FIELD,
  metadataIv: IV_FIELD,
  isEncrypted: z.literal(true, { errorMap: () => ({ message: 'Entries must be encrypted' }) }),
  taxonomyIds: z.array(z.number()).optional(),
  createdAt: z.string().optional(),
});

// Content and metadata are encrypted as a bound pair (each one's AAD names the
// other's IV), so an update replaces all four fields together or none of them
export const updatePostSchema = z.object({
  contentEncrypted: ENCRYPTED_FIELD.optional(),
  contentIv: IV_FIELD.optional(),
  metadataEncrypted: METADATA_FIELD.optional(),
  metadataIv: IV_FIELD.optional(),
  taxonomyIds: z.array(z.number()).optional(),
}).refine(
  (d) => {
    const n = [d.contentEncrypted, d.contentIv, d.metadataEncrypted, d.metadataIv].filter(v => v !== undefined).length;
    return n === 0 || n === 4;
  },
  { message: 'Encrypted updates must include contentEncrypted, contentIv, metadataEncrypted, and metadataIv' }
);

// Finance records: one encrypted JSON payload per row, keyed by a client UUID
// (the UUID is bound into the payload's AAD)
export const FINANCE_KINDS = ['paydays', 'bills', 'budget', 'expenses', 'goals', 'savings'] as const;
export type FinanceKind = typeof FINANCE_KINDS[number];

export const financeRecordIdSchema = z.string().uuid('Invalid record id');

export const putFinanceRecordSchema = z.object({
  payload: z.string().min(1).max(350_000, 'Record too large'),
  iv: IV_FIELD,
});

// Topics: the name and icon are encrypted in the browser ({ name, icon } as one
// payload); only the colour stays readable. Plaintext names are refused.
export const createTaxonomySchema = z.object({
  payload: z.string().min(1).max(20_000),
  iv: IV_FIELD,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color').optional(),
}).strict();

export const updateTaxonomySchema = z.object({
  payload: z.string().min(1).max(20_000).optional(),
  iv: IV_FIELD.optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
}).strict().refine(d => (d.payload === undefined) === (d.iv === undefined), { message: 'payload and iv go together' });

/** A request still sending a plaintext topic name or icon (an out-of-date app). */
export function isPlaintextTopicWrite(body: unknown): boolean {
  return !!body && typeof body === 'object' && ('name' in body || 'icon' in body);
}

// Encrypted dose records: { date } readable, everything else in the payload
export const doseRecordIdSchema = z.string().uuid('Invalid dose id');
export const putDoseRecordSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  payload: z.string().min(1).max(10_000),
  iv: IV_FIELD,
}).strict();

// Entry images — client-side validation of the user's R2 credentials before
// they are encrypted with the master key and stored as a setting. The server
// never sees or validates these.
export const imageStorageConfigSchema = z.object({
  r2AccountId: z.string().regex(/^[0-9a-f]{32}$/, 'Account ID must be 32 hex characters'),
  r2Bucket: z.string()
    .min(3, 'Bucket name too short').max(63, 'Bucket name too long')
    .regex(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/, 'Invalid bucket name'),
  r2AccessKeyId: z.string().min(1, 'Access key ID is required').max(128),
  r2SecretAccessKey: z.string().min(1, 'Secret access key is required').max(128),
});

// Settings validation
export const upsertSettingSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.unknown(),
}).refine(
  (data) => JSON.stringify(data.value).length <= 65536,
  { message: 'Setting value too large (max 64KB)', path: ['value'] }
);

// AI chat safety — the crisis card's risk ratings and kinds (screening runs in
// the browser; the server only counts that a card was shown)
export const RISK_RATINGS = ['concern', 'elevated', 'urgent'] as const;
export const RISK_KINDS = ['suicide', 'self_harm', 'eating_disorder'] as const;
export type CrisisRating = typeof RISK_RATINGS[number];
export type RiskKind = typeof RISK_KINDS[number];

export const crisisCardEventSchema = z.object({
  rating: z.enum(RISK_RATINGS),
  kind: z.enum(RISK_KINDS).nullable(),
}).strict();

export const aiChatConsentSchema = z.object({
  version: z.number().int().min(1).max(1000),
  ageConfirmed: z.literal(true),
}).strict();

// Sign-up / re-consent card: three separate affirmative boxes, plus how to
// get a breach notice (email, or a mailed letter to a postal address)
export const accountConsentSchema = z.object({
  ageConfirmed: z.literal(true),
  termsAccepted: z.literal(true),
  healthConsent: z.literal(true),
  termsVersion: z.string().min(1).max(20),
  healthVersion: z.string().min(1).max(20),
  breachNotice: z.enum(['email', 'mail']),
  postalAddress: z.string().trim().max(500).optional(),
}).strict().refine(
  d => d.breachNotice === 'email' || (d.postalAddress ?? '').length >= 8,
  { message: 'Add a postal address for mailed notices', path: ['postalAddress'] },
);

export const breachNoticeSchema = z.object({
  breachNotice: z.enum(['email', 'mail']),
  postalAddress: z.string().trim().max(500).optional(),
}).strict().refine(
  d => d.breachNotice === 'email' || (d.postalAddress ?? '').length >= 8,
  { message: 'Add a postal address for mailed notices', path: ['postalAddress'] },
);
