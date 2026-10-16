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

export const registerSchema = z.object({
  email: emailSchema,
  username: usernameSchema,
  password: passwordSchema,
  encryptedMasterKey: z.string().min(1),
  kekSalt: z.string().min(1),
  kekWrapIv: z.string().min(1),
  recoveryWrappedMK: z.string().min(1),
  recoveryWrapIv: z.string().min(1),
  recoveryKeyHash: z.string().min(1),
  recoveryKeySalt: z.string().min(1),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
  newEncryptedMasterKey: z.string().min(1),
  newKekSalt: z.string().min(1),
  newKekWrapIv: z.string().min(1),
});

export const recoverSchema = z.object({
  email: emailSchema,
  recoveryKey: z.string().min(1, 'Recovery key is required'),
  newPassword: passwordSchema,
  newEncryptedMasterKey: z.string().min(1),
  newKekSalt: z.string().min(1),
  newKekWrapIv: z.string().min(1),
  newRecoveryWrappedMK: z.string().min(1),
  newRecoveryWrapIv: z.string().min(1),
  newRecoveryKeyHash: z.string().min(1),
  newRecoveryKeySalt: z.string().min(1),
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
  currentPassword: z.string().min(1, 'Current password is required'),
});

export const disable2FASchema = z.object({
  password: z.string().min(1),
});

// Account changes that could lock the owner out require the current password,
// so a session left signed in on an unattended device isn't enough
export const changeEmailSchema = z.object({
  newEmail: z.string().min(1, 'Email is required').max(254),
  currentPassword: z.string().min(1, 'Current password is required'),
});

export const saveRecoveryKeySchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  recoveryWrappedMK: z.string().min(1).max(1024),
  recoveryWrapIv: z.string().min(1).max(64),
  recoveryKeyHash: z.string().regex(/^[a-f0-9]{64}$/, 'Invalid recovery key hash'),
  recoveryKeySalt: z.string().regex(/^[a-f0-9]{32}$/, 'Invalid recovery key salt'),
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
  icon: z.string().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color').optional(),
});

export const updateTaxonomySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  icon: z.string().optional(),
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
