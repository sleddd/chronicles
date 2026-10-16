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
export const createShareSchema = z.object({
  content: z.string().min(1, 'content is required').max(100_000, 'Content too large'),
  entryId: z.number().int().positive(),
  expiresAt: z.string().datetime().nullable().optional(),
});

// Entries are always end-to-end encrypted: the server never accepts plaintext
// content or metadata (the client also refuses to display plaintext posts).
const ENCRYPTED_FIELD = z.string().min(1).max(2_000_000);
const IV_FIELD = z.string().min(1).max(64);

export const createPostSchema = z.object({
  contentEncrypted: ENCRYPTED_FIELD,
  contentIv: IV_FIELD,
  metadataEncrypted: ENCRYPTED_FIELD,
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
  metadataEncrypted: z.string().min(1).max(20000, 'Metadata too large').optional(),
  metadataIv: IV_FIELD.optional(),
  taxonomyIds: z.array(z.number()).optional(),
}).refine(
  (d) => {
    const n = [d.contentEncrypted, d.contentIv, d.metadataEncrypted, d.metadataIv].filter(v => v !== undefined).length;
    return n === 0 || n === 4;
  },
  { message: 'Encrypted updates must include contentEncrypted, contentIv, metadataEncrypted, and metadataIv' }
);

// Taxonomy validation
export const createTaxonomySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  icon: z.string().max(64).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color').optional(),
});

export const updateTaxonomySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  icon: z.string().max(64).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
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
export const upsertSettingSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.unknown(),
}).refine(
  (data) => JSON.stringify(data.value).length <= 65536,
  { message: 'Setting value too large (max 64KB)', path: ['value'] }
);
