import { z } from 'zod';

// Auth validation
export const emailSchema = z.string().max(254, 'Invalid email address').email('Invalid email address');
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
// KEK salts are exactly 16 random bytes (24 base64 chars); the client refuses
// any other length at unlock, so the server never stores one it couldn't use
const kekSaltSchema = z.string().regex(/^[A-Za-z0-9+/]{22}==$/, 'Invalid key salt');

export const registerSchema = z.object({
  email: emailSchema,
  username: usernameSchema,
  authSecret: authSecretSchema,
  encryptedMasterKey: wrappedKeySchema,
  kekSalt: kekSaltSchema,
  kekWrapIv: saltOrIvSchema,
  recoveryWrappedMK: wrappedKeySchema,
  recoveryWrapIv: saltOrIvSchema,
  recoveryKeyHash: recoveryProofSchema,
  recoveryKeySalt: recoverySaltSchema,
  // The beta invite code from the sign-up link (needed for an approved email)
  inviteCode: z.string().max(64).optional(),
});

// Strict: the password itself is never part of a sign-in, so a body carrying
// anything beyond these two fields (e.g. an old client's legacyPassword) is refused
export const loginSchema = z.object({
  email: emailSchema,
  authSecret: authSecretSchema,
}).strict();

export const changePasswordSchema = z.object({
  currentAuthSecret: authSecretSchema,
  newAuthSecret: authSecretSchema,
  newEncryptedMasterKey: wrappedKeySchema,
  newKekSalt: kekSaltSchema,
  newKekWrapIv: saltOrIvSchema,
  // Authenticator or backup code — required when the account has 2FA on
  code: z.string().min(1).max(64).optional(),
});

export const recoverSchema = z.object({
  email: emailSchema,
  recoveryProof: recoveryProofSchema,
  newAuthSecret: authSecretSchema,
  newEncryptedMasterKey: wrappedKeySchema,
  newKekSalt: kekSaltSchema,
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

// Account changes that could lock the owner out require the current password
// (and, with 2FA on, an authenticator or backup code),
// so a session left signed in on an unattended device isn't enough
export const changeEmailSchema = z.object({
  newEmail: z.string().min(1, 'Email is required').max(254),
  currentAuthSecret: authSecretSchema,
  // The sign-in secret is salted with the email, so it changes with it
  newAuthSecret: authSecretSchema,
  code: z.string().min(1).max(64).optional(),
});

export const saveRecoveryKeySchema = z.object({
  currentAuthSecret: authSecretSchema,
  recoveryWrappedMK: wrappedKeySchema,
  recoveryWrapIv: saltOrIvSchema,
  recoveryKeyHash: recoveryProofSchema,
  recoveryKeySalt: recoverySaltSchema,
  code: z.string().min(1).max(64).optional(),
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

// An entry's ciphertext is bound to its id, so a new entry is created under
// an id reserved first (POST /api/entries/ids)
const ENTRY_ID = z.number().int().positive();

// `format: 3` = encrypted bound to the entry id. An older client (pair-bound
// v2 ciphertext) is refused rather than saving an entry that would stop
// opening once the account is past the move to v3
const FORMAT_V3 = z.literal(3, { errorMap: () => ({ message: 'Update Chronicles to save entries' }) });

export const createPostSchema = z.object({
  id: ENTRY_ID,
  format: FORMAT_V3,
  contentEncrypted: ENCRYPTED_FIELD,
  contentIv: IV_FIELD,
  metadataEncrypted: METADATA_FIELD,
  metadataIv: IV_FIELD,
  isEncrypted: z.literal(true, { errorMap: () => ({ message: 'Entries must be encrypted' }) }),
  taxonomyIds: z.array(z.number()).optional(),
  createdAt: z.string().datetime({ offset: true }).optional(),
});

// Imports create many entries at once: up to 100 a request, so a big import
// doesn't run into the per-account request limit
export const createPostsBatchSchema = z.object({
  entries: z.array(createPostSchema).min(1).max(100),
});

export const reservePostIdsSchema = z.object({
  count: z.number().int().min(1).max(50).default(1),
});

// The one-time move of older entries to the id-bound format: up to 100 at a time
export const resealPostsSchema = z.object({
  entries: z.array(z.object({
    id: ENTRY_ID,
    format: FORMAT_V3,
    // The entry's updated_at as loaded: if it was edited since, the edit
    // (already id-bound) wins and this re-seal is skipped
    updatedAt: z.string().datetime({ offset: true }),
    contentEncrypted: ENCRYPTED_FIELD,
    contentIv: IV_FIELD,
    metadataEncrypted: METADATA_FIELD,
    metadataIv: IV_FIELD,
  })).min(1).max(100),
});

// Content and metadata are encrypted as a bound pair (each one's AAD names the
// other's IV), so an update replaces all four fields together or none of them
export const updatePostSchema = z.object({
  format: FORMAT_V3.optional(),
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
).refine(
  (d) => d.contentEncrypted === undefined || d.format === 3,
  { message: 'Update Chronicles to save entries', path: ['format'] }
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
// `format: 2` = the payload is bound to the topic's id. A topic is created
// under an id reserved first (POST /api/topics/ids)
const TOPIC_FORMAT_V2 = z.literal(2, { errorMap: () => ({ message: 'Update Chronicles to save topics' }) });

export const createTaxonomySchema = z.object({
  id: z.number().int().positive(),
  format: TOPIC_FORMAT_V2,
  payload: z.string().min(1).max(20_000),
  iv: IV_FIELD,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color').optional(),
}).strict();

export const updateTaxonomySchema = z.object({
  format: TOPIC_FORMAT_V2.optional(),
  payload: z.string().min(1).max(20_000).optional(),
  iv: IV_FIELD.optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
}).strict()
  .refine(d => (d.payload === undefined) === (d.iv === undefined), { message: 'payload and iv go together' })
  .refine(d => d.payload === undefined || d.format === 2, { message: 'Update Chronicles to save topics', path: ['format'] });

/** A request still sending a plaintext topic name or icon (an out-of-date app). */
export function isPlaintextTopicWrite(body: unknown): boolean {
  return !!body && typeof body === 'object' && ('name' in body || 'icon' in body);
}

// Encrypted dose records: { date } readable, everything else in the payload
export const doseRecordIdSchema = z.string().uuid('Invalid dose id');
// `format: 2` = sealed bound to the record's id and its day, so the server
// can't move a dose to another day; an older client is told to update
export const putDoseRecordSchema = z.object({
  format: z.literal(2, { errorMap: () => ({ message: 'Update Chronicles to save doses' }) }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  payload: z.string().min(1).max(10_000),
  iv: IV_FIELD,
}).strict();

// The one-time move of older dose records to the day-bound seal
export const resealDoseRecordsSchema = z.object({
  records: z.array(z.object({
    id: z.string().uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    payload: z.string().min(1).max(10_000),
    iv: IV_FIELD,
  })).min(1).max(200),
});

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
export const settingKeySchema = z.string().min(1).max(100);
export const upsertSettingSchema = z.object({
  key: settingKeySchema,
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

// Landing page: beta applications (public, no account); past the last seat they wait on the waitlist.
// `website` is a honeypot — people never see it, so anything in it is a bot.
export const BETA_TRACK_OPTIONS = ['journal', 'health', 'planning', 'calendar', 'kitchen', 'finance', 'everything'] as const;
export const BETA_DEVICE_OPTIONS = ['ios', 'android', 'desktop', 'mixed'] as const;

export const betaApplicationSchema = z.object({
  // No control characters or bidi overrides: names are printed in a terminal (npm run beta)
  // eslint-disable-next-line no-control-regex
  name: z.string().trim().min(1, 'Add your name').max(100).regex(/^[^\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]*$/, 'Use letters, numbers and punctuation only'),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(254),
  trackFirst: z.enum(BETA_TRACK_OPTIONS),
  device: z.enum(BETA_DEVICE_OPTIONS),
  ageConfirmed: z.literal(true, { errorMap: () => ({ message: 'You must be 18 or older to join' }) }),
  riskAccepted: z.literal(true, { errorMap: () => ({ message: 'Tick the box to show you understand the beta' }) }),
  website: z.string().max(200).optional(),
}).strict();
