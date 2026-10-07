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
});

// 2FA / TOTP validation
export const twoFALoginSchema = z.object({
  pendingToken: z.string().min(1),
  code: z.string().min(1),
});

export const enable2FASchema = z.object({
  secret: z.string().min(1),
  code: z.string().length(6),
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

// Post validation
const metadataSchema = z.record(z.unknown()).optional().refine(
  (val) => !val || JSON.stringify(val).length <= 10000,
  { message: 'Metadata too large (max 10KB)' }
);

export const createPostSchema = z.object({
  content: z.string().optional(),
  metadata: metadataSchema,
  contentEncrypted: z.string().optional(),
  contentIv: z.string().optional(),
  metadataEncrypted: z.string().optional(),
  metadataIv: z.string().optional(),
  isEncrypted: z.boolean().optional(),
  taxonomyIds: z.array(z.number()).optional(),
  createdAt: z.string().optional(),
}).refine(
  (data) => {
    if (data.isEncrypted) {
      return data.contentEncrypted && data.contentIv && data.metadataEncrypted && data.metadataIv;
    }
    return true;
  },
  { message: 'Encrypted posts must include contentEncrypted, contentIv, metadataEncrypted, and metadataIv' }
);

export const updatePostSchema = z.object({
  content: z.string().optional(),
  metadata: metadataSchema,
  contentEncrypted: z.string().optional(),
  contentIv: z.string().optional(),
  metadataEncrypted: z.string().max(20000, 'Metadata too large').optional(),
  metadataIv: z.string().optional(),
  taxonomyIds: z.array(z.number()).optional(),
});

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
