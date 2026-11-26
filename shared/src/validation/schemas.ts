import { allowedMediaLink } from './mediaLinks.js';
import { z } from 'zod';

// Auth validation
export const emailSchema = z.string().max(254, 'Invalid email address').email('Invalid email address');
// No control characters: a zero byte can't be stored as text (it failed the
// insert as a 500), and the others have no place in a name
export const usernameSchema = z.string().min(3, 'Username must be at least 3 characters').max(30)
  // eslint-disable-next-line no-control-regex
  .regex(/^[^\u0000-\u001f\u007f]*$/, 'Invalid username');
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
// Key material in exactly the shape the client writes: a wrapped 32-byte key
// is 48 bytes (key + GCM tag, 64 base64 characters) and its IV 12 bytes (16).
// Anything else is a wrap no password could ever open — stored at sign-up it
// made an account that can't be opened, and at a password change or recovery
// it would have replaced the only way into the journal
const wrappedKeySchema = z.string().regex(/^[A-Za-z0-9+/]{64}$/, 'Invalid key wrap');
const saltOrIvSchema = z.string().regex(/^[A-Za-z0-9+/]{16}$/, 'Invalid IV');
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
  // The Chronicles AI app (Mac and iPad) signing in: it gets an assistant
  // session, held to a short allowlist on the server (server/src/services/assistant.ts)
  client: z.literal('smith').optional(),
}).strict();

// The sensitive actions are confirmed one of two ways: the current password
// (as its derived secret, plus an authenticator or backup code when 2FA is on)
// or a single-use token from a passkey touch (POST /api/auth/confirm/verify),
// which stands in for both. Exactly one of the two.
export const CONFIRM_ACTIONS = ['change-password', 'recovery-key', 'passkey-add', 'passkey-remove', '2fa-enable', '2fa-disable', 'delete-account'] as const;
export type ConfirmAction = typeof CONFIRM_ACTIONS[number];
const confirmTokenSchema = z.string().regex(/^[a-f0-9]{64}$/, 'Invalid confirmation');
const codeSchema = z.string().min(1).max(64);
const oneConfirmation = (secretKey: 'currentAuthSecret' | 'authSecret') =>
  [(v: Record<string, unknown>) => (v[secretKey] === undefined) !== (v.confirmToken === undefined), { message: 'Enter your account password' }] as const;

export const changePasswordSchema = z.object({
  currentAuthSecret: authSecretSchema.optional(),
  confirmToken: confirmTokenSchema.optional(),
  newAuthSecret: authSecretSchema,
  newEncryptedMasterKey: wrappedKeySchema,
  newKekSalt: kekSaltSchema,
  newKekWrapIv: saltOrIvSchema,
  // Authenticator or backup code — required with the password when the account has 2FA on
  code: codeSchema.optional(),
  // Re-encrypt the journal under a new master key. The new key's wraps replace
  // the old key's (password above, recovery here), and the OLD key is kept,
  // sealed under the new one, until every record has been re-encrypted
  // (POST /api/auth/rekey/finish). It is the 32-byte key encrypted (48 bytes,
  // the wrap's shape), bound to `rekeyId`
  rekey: z.object({
    rekeyId: z.string().regex(/^[a-f0-9]{32}$/, 'Invalid re-key id'),
    oldKey: wrappedKeySchema,
    oldKeyIv: saltOrIvSchema,
    recoveryWrappedMK: wrappedKeySchema,
    recoveryWrapIv: saltOrIvSchema,
    recoveryKeyHash: recoveryProofSchema,
    recoveryKeySalt: recoverySaltSchema,
  }).strict().optional(),
}).refine(...oneConfirmation('currentAuthSecret'));

/** The re-key every record has been moved to: the old key goes. `runner` is the browser holding the job */
export const rekeyFinishSchema = z.object({
  rekeyId: z.string().regex(/^[a-f0-9]{32}$/, 'Invalid re-key id'),
  runner: z.string().regex(/^[a-f0-9]{32}$/, 'Invalid runner id'),
}).strict();

/** A browser taking (or keeping) the re-encryption job: `runner` is a random id it made for itself */
export const rekeyClaimSchema = z.object({
  rekeyId: z.string().regex(/^[a-f0-9]{32}$/, 'Invalid re-key id'),
  runner: z.string().regex(/^[a-f0-9]{32}$/, 'Invalid runner id'),
}).strict();

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
  // …or the token /recovery-wrap answered with once it had checked that code
  // (a code works once, and it was spent there)
  recoveryToken: confirmTokenSchema.optional(),
  // Also remove every passkey (a lost device is a common reason to recover)
  removePasskeys: z.boolean().optional(),
});

// The recovery key's wrap of the master key is handed out only for a checked
// proof of that key (and, with 2FA on, a code) — never for an email alone
export const recoveryWrapSchema = z.object({
  email: emailSchema,
  recoveryProof: recoveryProofSchema,
  code: z.string().min(1).max(64).optional(),
});

// 2FA / TOTP validation
export const twoFALoginSchema = z.object({
  pendingToken: z.string().min(1).max(128),
  code: z.string().min(1).max(64),
  // "Don't ask for a code on this browser for 30 days" — honoured only after
  // an authenticator code, never a backup code
  trustBrowser: z.boolean().optional(),
  // The Chronicles AI app finishing its sign-in (see loginSchema)
  client: z.literal('smith').optional(),
});

// Turning 2FA on replaces the authenticator secret and backup codes, so it
// needs the current password — a stolen session alone must not be able to
// swap in an attacker's authenticator and lock the owner out
export const enable2FASchema = z.object({
  secret: z.string().regex(/^[A-Z2-7]{16,128}=*$/, 'Invalid secret'),
  code: z.string().length(6),
  currentAuthSecret: authSecretSchema.optional(),
  confirmToken: confirmTokenSchema.optional(),
}).refine(...oneConfirmation('currentAuthSecret'));

// Turning 2FA off needs the password AND a current authenticator/backup code,
// so a stolen session plus a phished password isn't enough to strip it
export const disable2FASchema = z.object({
  authSecret: authSecretSchema.optional(),
  code: codeSchema.optional(),
  confirmToken: confirmTokenSchema.optional(),
}).refine(...oneConfirmation('authSecret'))
  .refine(v => v.confirmToken !== undefined || v.code !== undefined, { message: 'A code is required' });

// Deleting the account is permanent: password, plus a 2FA code when 2FA is on
export const deleteAccountSchema = z.object({
  authSecret: authSecretSchema.optional(),
  code: codeSchema.optional(),
  confirmToken: confirmTokenSchema.optional(),
}).refine(...oneConfirmation('authSecret'));

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
  currentAuthSecret: authSecretSchema.optional(),
  confirmToken: confirmTokenSchema.optional(),
  recoveryWrappedMK: wrappedKeySchema,
  recoveryWrapIv: saltOrIvSchema,
  recoveryKeyHash: recoveryProofSchema,
  recoveryKeySalt: recoverySaltSchema,
  code: codeSchema.optional(),
}).refine(...oneConfirmation('currentAuthSecret'));

// The password wrap, for a tab that holds the key but not the wrap (it signed
// in with a passkey, or took the key from another tab): password-confirmed
// It is what opens the journal, so it is confirmed like the action it is for:
// the password and, with 2FA on, a code. The answer carries a single-use token
// for that action, so the action itself doesn't ask for the (one-use) code again
export const keyWrapSchema = z.object({
  currentAuthSecret: authSecretSchema,
  code: codeSchema.optional(),
  action: z.enum(CONFIRM_ACTIONS),
}).strict();

// ---------------------------------------------------------------------------
// Passkeys (WebAuthn). The browser's answers are checked in full by the
// server's verifier; these only bound their shape and size. A passkey's PRF
// output is the secret that opens its wrap of the master key, so the client
// never sends `clientExtensionResults` and the server drops any that arrive.
// ---------------------------------------------------------------------------
const b64url = (max: number) => z.string().min(1).max(max).regex(/^[A-Za-z0-9_-]+$/, 'Invalid passkey data');
const dropExtensions = () => z.unknown().optional().transform(() => ({}));

export const passkeyAssertionSchema = z.object({
  id: b64url(1024),
  rawId: b64url(1024),
  type: z.literal('public-key'),
  response: z.object({
    clientDataJSON: b64url(8192),
    authenticatorData: b64url(8192),
    signature: b64url(2048),
    userHandle: b64url(256).nullish().transform(v => v ?? undefined),
  }),
  authenticatorAttachment: z.enum(['platform', 'cross-platform']).nullish().transform(v => v ?? undefined),
  clientExtensionResults: dropExtensions(),
});

export const passkeyAttestationSchema = z.object({
  id: b64url(1024),
  rawId: b64url(1024),
  type: z.literal('public-key'),
  response: z.object({
    clientDataJSON: b64url(8192),
    attestationObject: b64url(65536),
    transports: z.array(z.string().max(32)).max(8).optional(),
  }),
  authenticatorAttachment: z.enum(['platform', 'cross-platform']).nullish().transform(v => v ?? undefined),
  clientExtensionResults: dropExtensions(),
});

/** A name the owner gives a passkey ("MacBook", "Phone"): one line, no control characters */
export const passkeyNameSchema = z.string().trim().min(1, 'Give it a name').max(60)
  // eslint-disable-next-line no-control-regex
  .regex(/^[^\u0000-\u001f\u007f]*$/, 'Invalid name');

// A wrapped 32-byte key is 48 bytes (key + GCM tag): 64 base64 characters
const passkeyWrapSchema = z.string().regex(/^[A-Za-z0-9+/]{64}$/, 'Invalid key wrap');

export const passkeyRegisterSchema = z.object({
  response: passkeyAttestationSchema,
  wrappedMK: passkeyWrapSchema,
  wrapIv: z.string().regex(/^[A-Za-z0-9+/]{16}$/, 'Invalid IV'),
  name: passkeyNameSchema,
  currentAuthSecret: authSecretSchema.optional(),
  confirmToken: confirmTokenSchema.optional(),
  code: codeSchema.optional(),
}).refine(...oneConfirmation('currentAuthSecret'));

export const passkeyRenameSchema = z.object({ name: passkeyNameSchema }).strict();

export const passkeyRemoveSchema = z.object({
  currentAuthSecret: authSecretSchema.optional(),
  confirmToken: confirmTokenSchema.optional(),
  code: codeSchema.optional(),
}).refine(...oneConfirmation('currentAuthSecret'));

export const passkeyLoginSchema = z.object({ response: passkeyAssertionSchema }).strict();

export const confirmOptionsSchema = z.object({ action: z.enum(CONFIRM_ACTIONS) }).strict();
export const confirmVerifySchema = z.object({
  action: z.enum(CONFIRM_ACTIONS),
  response: passkeyAssertionSchema,
  // With 2FA on, a passkey stands in for the password only: the authenticator
  // or backup code is still required, checked with the touch
  code: codeSchema.optional(),
}).strict();

// Shares validation — shared content is stored as plaintext by design; the
// user opts into that risk when creating a public link
/** Shares never carry images: photos, drawings (SVG) or any embedded media.
 *  Checked by the server (createShareSchema) and stripped first by the client. */
// Every quantifier here is followed by a different class, so the match is
// linear: an earlier `url\(\s*["']?\s*` backtracked quadratically, and a
// share of "url(" + spaces stalled the server for seconds
const SHARE_MEDIA = /<\s*(img|svg|picture|source|video|audio|iframe|object|embed|canvas|image|input)\b|data-type\s*=\s*["']?drawing|data:(image|video|audio)\/|url\(\s*(["']\s*)?(data|blob|https?):|image-set\(/i;

export const SHARE_CONTENT_MAX = 100_000;

export function shareContentHasMedia(content: string): boolean {
  return SHARE_MEDIA.test(content);
}

export const createShareSchema = z.object({
  content: z.string().min(1, 'content is required').max(SHARE_CONTENT_MAX, 'Content too large')
    .refine(c => !c.includes('\u0000'), 'Invalid content')
    // zod still runs a refine after .max fails, so the length is checked
    // here too: the media scan never sees more than the cap
    .refine(c => c.length <= SHARE_CONTENT_MAX && !shareContentHasMedia(c), 'Shared entries cannot include images or drawings'),
  entryId: z.number().int().positive().max(2_147_483_647),
  expiresAt: z.string().datetime().nullable().optional(),
});

// Public shelf — the media items a user bookmarks for one public page, stored
// as plaintext by the user's choice (like a share link). Only what the page
// shows is accepted: zod's default strip drops notes, progress, genre, the
// entry id or anything else a client sends. Covers are JPEG data URLs only
// (never SVG), one at most `PUBLIC_SHELF_COVER_MAX` chars; the list is served
// `PUBLIC_SHELF_PAGE_SIZE` items a page.
export const PUBLIC_SHELF_ITEMS_MAX = 1000;  // a sanity bound for the array — the per-account storage cap is the real limit
export const PUBLIC_SHELF_PAGE_SIZE = 24;
export const PUBLIC_SHELF_TITLE_MAX = 200;
export const PUBLIC_SHELF_COVER_MAX = 120_000;
export const PUBLIC_SHELF_TITLE_DEFAULT = 'My shelf';
// Linear: one base64 class, then up to two '=' of padding
const PUBLIC_SHELF_COVER = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;

export const PUBLIC_SHELF_LINK_MAX = 500;
/** http(s), a host with a dot, no spaces or control characters */
const PUBLIC_SHELF_LINK = /^https?:\/\/[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(:\d+)?([/?#][^\s\x00-\x1f\x7f]*)?$/i;

/** Shown text holds no control characters (Postgres refuses a NUL in JSONB) */
const SHELF_TEXT = /^[^\u0000-\u001f\u007f]*$/;

export const publicShelfItemSchema = z.object({
  title: z.string().trim().min(1, 'An item needs a title').max(200).regex(SHELF_TEXT, 'Invalid title'),
  creator: z.string().trim().max(200).regex(SHELF_TEXT, 'Invalid creator').default(''),
  year: z.string().trim().max(12).regex(SHELF_TEXT, 'Invalid year').default(''),
  type: z.enum(['book', 'movie', 'tv', 'music']),
  rating: z.number().min(0).max(5).refine(r => Number.isInteger(r * 2), 'Rating must be in halves'),
  /** The Shelf status (Reading / Want to / Finished / Paused / Didn’t finish), not the feature */
  shelf: z.enum(['current', 'want', 'done', 'paused', 'dnf', '']),
  cover: z.string().max(PUBLIC_SHELF_COVER_MAX, 'Cover too large').regex(PUBLIC_SHELF_COVER, 'Cover must be a JPEG').optional(),
  /** A page about it on one of the major media sites (Goodreads, IMDb, Spotify… — `MEDIA_LINK_SITES`); the card opens it in a new tab */
  link: z.string().max(PUBLIC_SHELF_LINK_MAX, 'Link too long').regex(PUBLIC_SHELF_LINK, 'Link must be a web address')
    .refine(v => allowedMediaLink(v) === v, 'Links can only go to the major media sites').optional(),
});

export const putPublicShelfSchema = z.object({
  title: z.string().trim().min(1, 'A title is required').max(PUBLIC_SHELF_TITLE_MAX).regex(SHELF_TEXT, 'Invalid title'),
  items: z.array(publicShelfItemSchema).max(PUBLIC_SHELF_ITEMS_MAX, 'Too many items'),
});

export type PublicShelfItem = z.infer<typeof publicShelfItemSchema>;
export type PutPublicShelf = z.infer<typeof putPublicShelfSchema>;

// Entries are always end-to-end encrypted: the server never accepts plaintext
// content or metadata (the client also refuses to display plaintext posts).
// Strict base64 (the encoding the client writes). A ciphertext holds at least
// its 16-byte GCM tag; an IV is exactly 12 bytes. Without these, a value like
// "@" decoded to 0 bytes and slipped past the storage caps as free rows
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const ciphertext = (max: number, message?: string) => z.string().min(24).max(max, message)
  .regex(BASE64, 'Invalid ciphertext');
export const IV_FIELD = z.string().regex(/^[A-Za-z0-9+/]{16}$/, 'Invalid IV');
const ENCRYPTED_FIELD = ciphertext(2_000_000);
// One cap for metadata on create and update — when they differed, an entry
// could be created that no later edit was allowed to save
const METADATA_FIELD = ciphertext(200_000, 'Metadata too large');

// An entry's ciphertext is bound to its id, so a new entry is created under
// an id reserved first (POST /api/entries/ids)
const ENTRY_ID = z.number().int().positive().max(2_147_483_647);

// `format: 3` = encrypted bound to the entry id. An older client (pair-bound
// v2 ciphertext) is refused rather than saving an entry that would stop
// opening once the account is past the move to v3
const FORMAT_V3 = z.literal(3, { message: 'Update Chronicles to save entries' });

export const createPostSchema = z.object({
  id: ENTRY_ID,
  format: FORMAT_V3,
  contentEncrypted: ENCRYPTED_FIELD,
  contentIv: IV_FIELD,
  metadataEncrypted: METADATA_FIELD,
  metadataIv: IV_FIELD,
  isEncrypted: z.literal(true, { message: 'Entries must be encrypted' }),
  taxonomyIds: z.array(z.number()).max(50).optional(),
  createdAt: z.string().datetime({ offset: true }).optional(),
  // The Chronicles AI app's own data (memories, letters, conversation
  // summaries): it may edit and delete these at any age. Only an assistant
  // session may send it — a browser that does gets 400 (routes/entries.ts)
  assistantOwned: z.boolean().optional(),
});

// Imports create many entries at once: up to 100 a request, so a big import
// doesn't run into the per-account request limit
export const createPostsBatchSchema = z.object({
  entries: z.array(createPostSchema).min(1).max(100),
});

export const reservePostIdsSchema = z.object({
  count: z.number().int().min(1).max(50).default(1),
});

// Hide entries from AI, or share them again (PUT /api/entries/ai-hidden)
export const aiHiddenSchema = z.object({
  // Entry ids are int4 in the database
  ids: z.array(z.number().int().positive().max(2_147_483_647)).min(1).max(5000),
  hidden: z.boolean(),
}).strict();

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
  taxonomyIds: z.array(z.number()).max(50).optional(),
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
export const FINANCE_KINDS = ['bills', 'budget', 'expenses', 'goals', 'savings'] as const;
export type FinanceKind = typeof FINANCE_KINDS[number];

export const financeRecordIdSchema = z.string().uuid('Invalid record id');

export const putFinanceRecordSchema = z.object({
  payload: ciphertext(350_000, 'Record too large'),
  iv: IV_FIELD,
});

// Re-encrypting records already stored (a new master key): each one is
// replaced in place, never created, so a deleted record can't come back
export const resealFinanceRecordsSchema = z.object({
  records: z.array(putFinanceRecordSchema.extend({ id: financeRecordIdSchema })).min(1).max(200),
}).strict();

// Topics: the name and icon are encrypted in the browser ({ name, icon } as one
// payload); only the colour stays readable. Plaintext names are refused.
// `format: 2` = the payload is bound to the topic's id. A topic is created
// under an id reserved first (POST /api/topics/ids)
const TOPIC_FORMAT_V2 = z.literal(2, { message: 'Update Chronicles to save topics' });

export const createTaxonomySchema = z.object({
  id: z.number().int().positive().max(2_147_483_647),
  format: TOPIC_FORMAT_V2,
  payload: ciphertext(20_000),
  iv: IV_FIELD,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color').optional(),
}).strict();

export const updateTaxonomySchema = z.object({
  format: TOPIC_FORMAT_V2.optional(),
  payload: ciphertext(20_000).optional(),
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
  format: z.literal(2, { message: 'Update Chronicles to save doses' }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  payload: ciphertext(10_000),
  iv: IV_FIELD,
}).strict();

// The one-time move of older dose records to the day-bound seal
export const resealDoseRecordsSchema = z.object({
  records: z.array(z.object({
    id: z.string().uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    payload: ciphertext(10_000),
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
// eslint-disable-next-line no-control-regex
export const settingKeySchema = z.string().min(1).max(100).regex(/^[^\u0000-\u001f\u007f]*$/, 'Invalid setting key');
/** A setting's value as stored, or null when it can't be: nested too deep to
 *  serialize, or holding a zero byte (Postgres refuses one in JSON) */
/** Deeper than Postgres' jsonb will take; checked without recursion, since newer
 *  engines no longer throw from JSON.stringify on deep nesting */
const MAX_JSON_DEPTH = 1000;
function tooDeep(value: unknown): boolean {
  const stack: [unknown, number][] = [[value, 1]];
  while (stack.length) {
    const [v, depth] = stack.pop()!;
    if (v === null || typeof v !== 'object') continue;
    if (depth > MAX_JSON_DEPTH) return true;
    for (const child of Object.values(v)) stack.push([child, depth + 1]);
  }
  return false;
}
function storableJson(value: unknown): string | null {
  if (tooDeep(value)) return null;
  let json: string | undefined;
  try { json = JSON.stringify(value); } catch { return null; }
  if (json === undefined || json.includes('\\u0000')) return null;
  return json;
}
export const upsertSettingSchema = z.object({
  key: settingKeySchema,
  value: z.unknown().refine(v => v !== undefined, 'value is required'),
}).refine(
  (data) => data.value === undefined || storableJson(data.value) !== null,
  { message: 'Invalid setting value', path: ['value'] }
).refine(
  // UTF-8 bytes, the unit the stored-settings cap counts in
  (data) => data.value === undefined || new TextEncoder().encode(storableJson(data.value) ?? '').length <= 65536,
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

/** One generic analytics event (POST /api/analytics/event): the event is in
    the body, never the address, so access logs can't say which happened. */
export const analyticsEventSchema = z.discriminatedUnion('event', [
  z.object({
    event: z.literal('crisis_card_shown'),
    rating: z.enum(RISK_RATINGS),
    kind: z.enum(RISK_KINDS).nullable(),
  }).strict(),
  z.object({ event: z.literal('minor_detected') }).strict(),
]);
export type AnalyticsEvent = z.infer<typeof analyticsEventSchema>;

export const aiChatConsentSchema = z.object({
  version: z.number().int().min(1).max(1000),
  ageConfirmed: z.literal(true),
}).strict();

/** Which app's request the AI declined (stop_reason "refusal"): Chronicles in the browser, or the Chronicles AI app. */
export const AI_REFUSAL_APPS = ['chronicles', 'smith'] as const;
export type AiRefusalApp = typeof AI_REFUSAL_APPS[number];
/** POST /api/ai-chat/refusal — one declined request, no content. */
export const aiRefusalSchema = z.object({
  app: z.enum(AI_REFUSAL_APPS),
}).strict();

/*
 * Declined requests, counted per account across both apps: 5 in a day warns,
 * 10 in a day pauses In-App AI for a day, 20 in 30 days turns it off (like
 * `npm run ai:block`, which also turns it back on).
 */
export const AI_REFUSAL_WARN_24H = 5;
export const AI_REFUSAL_PAUSE_24H = 10;
export const AI_REFUSAL_BLOCK_30D = 20;
export const AI_PAUSE_MS = 24 * 60 * 60 * 1000;
/** Declined requests this close together count as one: a single message can make several requests, in either app. */
export const AI_REFUSAL_DEDUPE_S = 15;

/** Why In-App AI is turned off for an account: by hand (`npm run ai:block`, e.g. believed under 18) or by the declined-request ladder. */
export type AiBlockReason = 'operator' | 'refusals';

export type AiEnforcementLevel = 'ok' | 'warned' | 'paused' | 'blocked';
export interface AiEnforcement {
  level: AiEnforcementLevel;
  /** ISO time, or null when not paused */
  pausedUntil: string | null;
  refusals24h: number;
  refusals30d: number;
}

/** GET /api/ai-chat (and what POST /consent and POST /refusal answer). */
export interface AiChatStatus {
  consentAt: string | null;
  consentVersion: number | null;
  blocked: boolean;
  /** Anonymous id sent to Anthropic as metadata.user_id: no email or name, the same in both apps */
  aiUserId: string;
  enforcement: AiEnforcement;
}

/** The level for these counts: blocked, then paused (until a time still ahead), then warned. */
export function aiEnforcementLevel(
  s: { blocked: boolean; pausedUntil: Date | null; refusals24h: number },
  now: Date = new Date(),
): AiEnforcementLevel {
  if (s.blocked) return 'blocked';
  if (s.pausedUntil && s.pausedUntil.getTime() > now.getTime()) return 'paused';
  if (s.refusals24h >= AI_REFUSAL_WARN_24H) return 'warned';
  return 'ok';
}

/** What one more declined request does, given the counts that include it. */
export function aiRefusalAction(counts: { refusals24h: number; refusals30d: number }): 'block' | 'pause' | 'none' {
  if (counts.refusals30d >= AI_REFUSAL_BLOCK_30D) return 'block';
  if (counts.refusals24h >= AI_REFUSAL_PAUSE_24H) return 'pause';
  return 'none';
}

// Sign-up / re-consent card: three separate affirmative boxes, plus how to
// get a breach notice (email, or a mailed letter to a postal address)
export const accountConsentSchema = z.object({
  ageConfirmed: z.literal(true),
  termsAccepted: z.literal(true),
  healthConsent: z.literal(true),
  termsVersion: z.string().min(1).max(20),
  healthVersion: z.string().min(1).max(20),
  breachNotice: z.enum(['email', 'mail']),
  postalAddress: z.string().trim().max(500).refine(v => !v.includes('\u0000'), 'Invalid address').optional(),
}).strict().refine(
  d => d.breachNotice === 'email' || (d.postalAddress ?? '').length >= 8,
  { message: 'Add a postal address for mailed notices', path: ['postalAddress'] },
);

export const breachNoticeSchema = z.object({
  breachNotice: z.enum(['email', 'mail']),
  postalAddress: z.string().trim().max(500).refine(v => !v.includes('\u0000'), 'Invalid address').optional(),
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
  // No longer asked on the landing page; older clients may still send them
  trackFirst: z.enum(BETA_TRACK_OPTIONS).optional(),
  device: z.enum(BETA_DEVICE_OPTIONS).optional(),
  ageConfirmed: z.literal(true, { message: 'You must be 18 or older to join' }),
  riskAccepted: z.literal(true, { message: 'Tick the box to show you understand the beta' }),
  website: z.string().max(200).optional(),
}).strict();
