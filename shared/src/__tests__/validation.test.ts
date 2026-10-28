/**
 * Validation schema unit tests
 * Tests for all Zod schemas in shared/src/validation/schemas.ts
 */
import { describe, it, expect } from 'vitest';

// Shaped like real ciphertext: base64 holding at least a GCM tag, and a 12-byte IV
const CT = 'Y2lwaGVydGV4dC13aXRoLWEtdGFn';
const CT2 = 'YW5vdGhlci1jaXBoZXJ0ZXh0LXRhZw==';
const IV = 'aXZpdml2aXZpdml2';
const IV2 = 'MTIzNDU2Nzg5MDEy';
import {
  emailSchema,
  usernameSchema,
  passwordSchema,
  registerSchema,
  loginSchema,
  changePasswordSchema,
  recoverSchema,
  createPostSchema,
  updatePostSchema,
  createTaxonomySchema,
  updateTaxonomySchema,
  upsertSettingSchema,
  createShareSchema, isPlaintextTopicWrite, putDoseRecordSchema, betaApplicationSchema } from '../validation/schemas.js';

// ============================================================================
// emailSchema
// ============================================================================
describe('emailSchema', () => {
  it('accepts valid emails', () => {
    expect(emailSchema.safeParse('user@example.com').success).toBe(true);
    expect(emailSchema.safeParse('name+tag@domain.co.uk').success).toBe(true);
    expect(emailSchema.safeParse('a@b.cc').success).toBe(true);
  });

  it('rejects invalid emails', () => {
    const cases = ['', 'not-email', '@no-local.com', 'no-domain@', 'spaces in@email.com', 'missing@.com'];
    for (const c of cases) {
      const result = emailSchema.safeParse(c);
      expect(result.success, `Expected "${c}" to fail`).toBe(false);
    }
  });

  it('provides correct error message', () => {
    const result = emailSchema.safeParse('bad');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Invalid email address');
    }
  });

  it('rejects non-string types', () => {
    expect(emailSchema.safeParse(123).success).toBe(false);
    expect(emailSchema.safeParse(null).success).toBe(false);
    expect(emailSchema.safeParse(undefined).success).toBe(false);
  });
});

// ============================================================================
// usernameSchema
// ============================================================================
describe('usernameSchema', () => {
  it('accepts valid usernames (3-30 chars)', () => {
    expect(usernameSchema.safeParse('abc').success).toBe(true);
    expect(usernameSchema.safeParse('user_name').success).toBe(true);
    expect(usernameSchema.safeParse('a'.repeat(30)).success).toBe(true);
  });

  it('rejects usernames shorter than 3 characters', () => {
    const result = usernameSchema.safeParse('ab');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Username must be at least 3 characters');
    }
  });

  it('rejects empty string', () => {
    expect(usernameSchema.safeParse('').success).toBe(false);
  });

  it('rejects usernames longer than 30 characters', () => {
    expect(usernameSchema.safeParse('a'.repeat(31)).success).toBe(false);
  });

  it('accepts boundary values exactly', () => {
    expect(usernameSchema.safeParse('abc').success).toBe(true); // min boundary
    expect(usernameSchema.safeParse('a'.repeat(30)).success).toBe(true); // max boundary
  });
});

// ============================================================================
// passwordSchema
// ============================================================================
describe('passwordSchema', () => {
  const validPassword = 'SecurePass1!xy';

  it('accepts a valid password', () => {
    expect(passwordSchema.safeParse(validPassword).success).toBe(true);
  });

  it('rejects passwords shorter than 12 characters', () => {
    const result = passwordSchema.safeParse('Short1!aaaa');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.message.includes('at least 12'))).toBe(true);
    }
  });

  it('rejects passwords without uppercase', () => {
    const result = passwordSchema.safeParse('nouppercase1!a');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.message.includes('uppercase'))).toBe(true);
    }
  });

  it('rejects passwords without lowercase', () => {
    const result = passwordSchema.safeParse('NOLOWERCASE1!A');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.message.includes('lowercase'))).toBe(true);
    }
  });

  it('rejects passwords without a number', () => {
    const result = passwordSchema.safeParse('NoNumberHere!ab');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.message.includes('number'))).toBe(true);
    }
  });

  it('rejects passwords without a special character', () => {
    const result = passwordSchema.safeParse('NoSpecialChar1a');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.message.includes('special'))).toBe(true);
    }
  });

  it('accepts password at exactly 12 characters', () => {
    expect(passwordSchema.safeParse('Abcdefghij1!').success).toBe(true);
  });

  it('accepts various special characters', () => {
    const specials = ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '_', '+', '-', '=', '[', ']', '{', '}', ';', ':', "'", '"', '\\', '|', ',', '.', '<', '>', '/', '?', '`', '~'];
    for (const s of specials) {
      const pw = `Abcdefghij1${s}`;
      expect(passwordSchema.safeParse(pw).success, `Special char "${s}" should be accepted`).toBe(true);
    }
  });
});

// ============================================================================
// registerSchema
// ============================================================================
describe('registerSchema', () => {
  const validRegister = {
    email: 'user@example.com',
    username: 'testuser',
    authSecret: 'a'.repeat(64),
    encryptedMasterKey: 'abc123',
    kekSalt: 'c2FsdHNhbHRzYWx0c2FsdA==',
    kekWrapIv: 'iv123',
    recoveryWrappedMK: 'recovmk',
    recoveryWrapIv: 'recoviv',
    recoveryKeyHash: 'b'.repeat(64),
    recoveryKeySalt: 'c'.repeat(32),
  };

  it('accepts valid registration data', () => {
    expect(registerSchema.safeParse(validRegister).success).toBe(true);
  });

  it('rejects missing email', () => {
    const { email, ...rest } = validRegister;
    expect(registerSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects missing username', () => {
    const { username, ...rest } = validRegister;
    expect(registerSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a missing sign-in secret', () => {
    const { authSecret, ...rest } = validRegister;
    expect(registerSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects missing encryption fields', () => {
    const { encryptedMasterKey, ...rest } = validRegister;
    expect(registerSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects empty encryption fields', () => {
    expect(registerSchema.safeParse({ ...validRegister, kekSalt: '' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...validRegister, kekWrapIv: '' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...validRegister, recoveryWrappedMK: '' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...validRegister, recoveryWrapIv: '' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...validRegister, recoveryKeyHash: '' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...validRegister, recoveryKeySalt: '' }).success).toBe(false);
  });

  it('strips extra fields', () => {
    const result = registerSchema.safeParse({ ...validRegister, extraField: 'should be stripped' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).extraField).toBeUndefined();
    }
  });

  it('refuses a raw password in place of the derived secret', () => {
    expect(registerSchema.safeParse({ ...validRegister, authSecret: 'SecurePass1!xy' }).success).toBe(false);
  });

  it('checks the recovery proof and salt are hex of the right length', () => {
    expect(registerSchema.safeParse({ ...validRegister, recoveryKeyHash: 'hash123' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...validRegister, recoveryKeySalt: 'rsalt123' }).success).toBe(false);
  });
});

// ============================================================================
// loginSchema
// ============================================================================
describe('loginSchema', () => {
  const secret = 'a'.repeat(64);

  it('accepts an email and derived secret', () => {
    expect(loginSchema.safeParse({ email: 'user@example.com', authSecret: secret }).success).toBe(true);
  });

  it('rejects missing email', () => {
    expect(loginSchema.safeParse({ authSecret: secret }).success).toBe(false);
  });

  it('rejects a missing secret', () => {
    expect(loginSchema.safeParse({ email: 'user@example.com' }).success).toBe(false);
  });

  it('refuses a raw password as the secret', () => {
    expect(loginSchema.safeParse({ email: 'user@example.com', authSecret: 'anything' }).success).toBe(false);
  });

  it('rejects invalid email', () => {
    expect(loginSchema.safeParse({ email: 'notanemail', authSecret: secret }).success).toBe(false);
  });

  it('refuses a password sent alongside the secret', () => {
    expect(loginSchema.safeParse({ email: 'user@example.com', authSecret: secret, legacyPassword: 'x' }).success).toBe(false);
  });
});

// ============================================================================
// changePasswordSchema
// ============================================================================
describe('changePasswordSchema', () => {
  const valid = {
    currentAuthSecret: 'a'.repeat(64),
    newAuthSecret: 'b'.repeat(64),
    newEncryptedMasterKey: 'enc123',
    newKekSalt: 'c2FsdHNhbHRzYWx0c2FsdA==',
    newKekWrapIv: 'iv123',
  };

  it('accepts valid change password data', () => {
    expect(changePasswordSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a missing current secret', () => {
    const { currentAuthSecret, ...rest } = valid;
    expect(changePasswordSchema.safeParse(rest).success).toBe(false);
  });

  it('refuses a raw new password', () => {
    expect(changePasswordSchema.safeParse({ ...valid, newAuthSecret: 'NewSecure1!abc' }).success).toBe(false);
  });

  it('rejects empty encryption fields', () => {
    expect(changePasswordSchema.safeParse({ ...valid, newEncryptedMasterKey: '' }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ ...valid, newKekSalt: '' }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ ...valid, newKekWrapIv: '' }).success).toBe(false);
  });
});

// ============================================================================
// recoverSchema
// ============================================================================
describe('recoverSchema', () => {
  const valid = {
    email: 'user@example.com',
    recoveryProof: 'a'.repeat(64),
    newAuthSecret: 'b'.repeat(64),
    newEncryptedMasterKey: 'enc123',
    newKekSalt: 'c2FsdHNhbHRzYWx0c2FsdA==',
    newKekWrapIv: 'iv123',
    newRecoveryWrappedMK: 'rwmk123',
    newRecoveryWrapIv: 'riv123',
    newRecoveryKeyHash: 'c'.repeat(64),
    newRecoveryKeySalt: 'd'.repeat(32),
  };

  it('accepts valid recovery data', () => {
    expect(recoverSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a missing recovery proof', () => {
    const { recoveryProof, ...rest } = valid;
    expect(recoverSchema.safeParse(rest).success).toBe(false);
  });

  it('requires the rotated recovery key material', () => {
    const { newRecoveryKeyHash, ...rest } = valid;
    expect(recoverSchema.safeParse(rest).success).toBe(false);
  });

  it('refuses the raw recovery key in place of the proof', () => {
    expect(recoverSchema.safeParse({ ...valid, recoveryProof: 'recovery-key-value' }).success).toBe(false);
  });

  it('refuses a raw new password', () => {
    expect(recoverSchema.safeParse({ ...valid, newAuthSecret: 'NewSecure1!abc' }).success).toBe(false);
  });

  it('rejects invalid email', () => {
    expect(recoverSchema.safeParse({ ...valid, email: 'bad' }).success).toBe(false);
  });
});

// ============================================================================
// createPostSchema
// ============================================================================
describe('createPostSchema', () => {
  const encrypted = {
    id: 5,
    format: 3,
    isEncrypted: true,
    contentEncrypted: CT,
    contentIv: IV,
    metadataEncrypted: CT2,
    metadataIv: IV2,
  };

  it('accepts a fully encrypted post', () => {
    expect(createPostSchema.safeParse(encrypted).success).toBe(true);
  });

  it('rejects an unencrypted post', () => {
    expect(createPostSchema.safeParse({}).success).toBe(false);
    expect(createPostSchema.safeParse({ content: 'Hello world' }).success).toBe(false);
    expect(createPostSchema.safeParse({ ...encrypted, isEncrypted: false }).success).toBe(false);
  });

  it('never passes plaintext content or metadata through', () => {
    const result = createPostSchema.safeParse({ ...encrypted, content: 'plain', metadata: { a: 1 } });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('content');
      expect(result.data).not.toHaveProperty('metadata');
    }
  });

  it('needs the reserved id and format 3 (an older client is refused)', () => {
    const { id: _i, ...noId } = encrypted;
    const { format: _f, ...noFormat } = encrypted;
    expect(createPostSchema.safeParse(noId).success).toBe(false);
    expect(createPostSchema.safeParse(noFormat).success).toBe(false);
    expect(createPostSchema.safeParse({ ...encrypted, id: 0 }).success).toBe(false);
  });

  it('rejects encrypted post missing required encrypted fields', () => {
    expect(createPostSchema.safeParse({ isEncrypted: true, contentEncrypted: 'enc-content' }).success).toBe(false);
  });

  it('rejects encrypted post missing only metadataIv', () => {
    const { metadataIv: _omit, ...incomplete } = encrypted;
    expect(createPostSchema.safeParse(incomplete).success).toBe(false);
  });

  it('accepts taxonomyIds as an array of numbers', () => {
    expect(createPostSchema.safeParse({ ...encrypted, taxonomyIds: [1, 2, 3] }).success).toBe(true);
  });

  it('rejects taxonomyIds with non-number values', () => {
    expect(createPostSchema.safeParse({ ...encrypted, taxonomyIds: ['a', 'b'] }).success).toBe(false);
  });
});

describe('updatePostSchema', () => {
  const fields = {
    format: 3,
    contentEncrypted: CT,
    contentIv: IV,
    metadataEncrypted: CT2,
    metadataIv: IV2,
  };

  it('accepts empty object', () => {
    expect(updatePostSchema.safeParse({}).success).toBe(true);
  });

  it('accepts all four encrypted fields together', () => {
    expect(updatePostSchema.safeParse(fields).success).toBe(true);
  });

  it('refuses new ciphertext without format 3 (an older client)', () => {
    const { format: _f, ...old } = fields;
    expect(updatePostSchema.safeParse(old).success).toBe(false);
  });

  it('rejects a partial encrypted update (content and metadata are a bound pair)', () => {
    expect(updatePostSchema.safeParse({ contentEncrypted: 'enc' }).success).toBe(false);
    const { metadataIv: _omit, ...three } = fields;
    expect(updatePostSchema.safeParse(three).success).toBe(false);
  });

  it('drops plaintext content and metadata', () => {
    const result = updatePostSchema.safeParse({ content: 'Updated content', metadata: { a: 1 } });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({});
  });

  it('accepts taxonomyIds', () => {
    expect(updatePostSchema.safeParse({ taxonomyIds: [1] }).success).toBe(true);
  });

  it('rejects encrypted metadata over 200,000 chars', () => {
    expect(updatePostSchema.safeParse({ ...fields, metadataEncrypted: 'x'.repeat(200_001) }).success).toBe(false);
  });

  it('accepts on update any metadata size create accepts', () => {
    // An entry that could be created must stay editable
    expect(updatePostSchema.safeParse({ ...fields, metadataEncrypted: 'x'.repeat(200_000) }).success).toBe(true);
    expect(createPostSchema.safeParse({ ...fields, isEncrypted: true, metadataEncrypted: 'x'.repeat(200_001) }).success).toBe(false);
  });
});


// ============================================================================
// createTaxonomySchema
// ============================================================================
describe('createTaxonomySchema', () => {
  const T = { id: 3, format: 2, payload: CT, iv: IV };
  it('accepts an encrypted payload under a reserved id, with an optional colour', () => {
    expect(createTaxonomySchema.safeParse(T).success).toBe(true);
    expect(createTaxonomySchema.safeParse({ ...T, color: '#AbCdEf' }).success).toBe(true);
  });
  it('refuses a plaintext name or icon, a missing iv or id, an older format and a bad colour', () => {
    expect(createTaxonomySchema.safeParse({ name: 'Work' }).success).toBe(false);
    expect(createTaxonomySchema.safeParse({ ...T, icon: 'pills' }).success).toBe(false);
    expect(createTaxonomySchema.safeParse({ id: 3, format: 2, payload: 'x' }).success).toBe(false);
    expect(createTaxonomySchema.safeParse({ format: 2, payload: 'x', iv: 'y' }).success).toBe(false);
    expect(createTaxonomySchema.safeParse({ id: 3, payload: 'x', iv: 'y' }).success).toBe(false);
    const bad = createTaxonomySchema.safeParse({ ...T, color: 'red' });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues[0].message).toBe('Invalid hex color');
  });
  it('isPlaintextTopicWrite spots an out-of-date app', () => {
    expect(isPlaintextTopicWrite({ name: 'Work' })).toBe(true);
    expect(isPlaintextTopicWrite({ icon: 'pills' })).toBe(true);
    expect(isPlaintextTopicWrite({ payload: 'x', iv: 'y' })).toBe(false);
  });
});

describe('updateTaxonomySchema', () => {
  it('accepts a payload with its iv (format 2), or just a colour', () => {
    expect(updateTaxonomySchema.safeParse({ format: 2, payload: CT, iv: IV }).success).toBe(true);
    expect(updateTaxonomySchema.safeParse({ color: '#123456' }).success).toBe(true);
  });
  it('needs payload and iv together, format 2 with a payload, and refuses plaintext', () => {
    expect(updateTaxonomySchema.safeParse({ format: 2, payload: CT }).success).toBe(false);
    expect(updateTaxonomySchema.safeParse({ payload: CT, iv: IV }).success).toBe(false);
    expect(updateTaxonomySchema.safeParse({ name: 'Work' }).success).toBe(false);
  });
});

describe('putDoseRecordSchema', () => {
  it('takes only the format, date, payload and iv', () => {
    expect(putDoseRecordSchema.safeParse({ format: 2, date: '2026-04-03', payload: CT, iv: IV }).success).toBe(true);
    expect(putDoseRecordSchema.safeParse({ format: 2, date: '2026-04-03', payload: CT, iv: IV, status: 'taken' }).success).toBe(false);
    expect(putDoseRecordSchema.safeParse({ format: 2, date: 'April 3', payload: CT, iv: IV }).success).toBe(false);
  });
  it('refuses a dose from an older client (not sealed to its day)', () => {
    expect(putDoseRecordSchema.safeParse({ date: '2026-04-03', payload: CT, iv: IV }).success).toBe(false);
  });
});

describe('upsertSettingSchema', () => {
  it('accepts valid key-value pair', () => {
    expect(upsertSettingSchema.safeParse({ key: 'headerColor', value: '#ff0000' }).success).toBe(true);
  });

  it('accepts various value types', () => {
    expect(upsertSettingSchema.safeParse({ key: 'boolSetting', value: true }).success).toBe(true);
    expect(upsertSettingSchema.safeParse({ key: 'numSetting', value: 42 }).success).toBe(true);
    expect(upsertSettingSchema.safeParse({ key: 'objSetting', value: { nested: 'value' } }).success).toBe(true);
    expect(upsertSettingSchema.safeParse({ key: 'arrSetting', value: [1, 2, 3] }).success).toBe(true);
    expect(upsertSettingSchema.safeParse({ key: 'nullSetting', value: null }).success).toBe(true);
  });

  it('rejects empty key', () => {
    expect(upsertSettingSchema.safeParse({ key: '', value: 'test' }).success).toBe(false);
  });

  it('rejects key exceeding 100 characters', () => {
    expect(upsertSettingSchema.safeParse({ key: 'k'.repeat(101), value: 'test' }).success).toBe(false);
  });

  it('accepts key at exactly 100 characters', () => {
    expect(upsertSettingSchema.safeParse({ key: 'k'.repeat(100), value: 'test' }).success).toBe(true);
  });

  it('rejects value exceeding 64KB', () => {
    const largeValue = 'x'.repeat(65537);
    const result = upsertSettingSchema.safeParse({ key: 'bigKey', value: largeValue });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.message.includes('Setting value too large'))).toBe(true);
    }
  });

  it('accepts value just under 64KB', () => {
    // JSON.stringify of a string adds quotes, so account for that
    const value = 'x'.repeat(65530);
    expect(upsertSettingSchema.safeParse({ key: 'bigKey', value }).success).toBe(true);
  });

  it('rejects missing key', () => {
    expect(upsertSettingSchema.safeParse({ value: 'test' }).success).toBe(false);
  });
});

// ============================================================================
// createShareSchema
// ============================================================================
describe('createShareSchema', () => {
  const valid = { content: '<p>Shared entry</p>', entryId: 7 };

  it('accepts valid share with required fields', () => {
    expect(createShareSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts share with optional expiresAt', () => {
    expect(createShareSchema.safeParse({ ...valid, expiresAt: '2025-12-31T23:59:59Z' }).success).toBe(true);
  });

  it('accepts share with null expiresAt', () => {
    expect(createShareSchema.safeParse({ ...valid, expiresAt: null }).success).toBe(true);
  });

  it('rejects missing content', () => {
    expect(createShareSchema.safeParse({ entryId: 7 }).success).toBe(false);
  });

  it('rejects empty content', () => {
    const result = createShareSchema.safeParse({ ...valid, content: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('content is required');
    }
  });

  it('rejects content over 100,000 characters', () => {
    expect(createShareSchema.safeParse({ ...valid, content: 'x'.repeat(100_001) }).success).toBe(false);
  });

  it('rejects missing or non-positive entryId', () => {
    expect(createShareSchema.safeParse({ content: 'x' }).success).toBe(false);
    expect(createShareSchema.safeParse({ content: 'x', entryId: 0 }).success).toBe(false);
    expect(createShareSchema.safeParse({ content: 'x', entryId: 1.5 }).success).toBe(false);
  });

  it('rejects invalid datetime for expiresAt', () => {
    expect(createShareSchema.safeParse({ ...valid, expiresAt: 'not-a-date' }).success).toBe(false);
  });
});

describe('betaApplicationSchema — name', () => {
  const base = { email: 'a@b.co', trackFirst: 'journal', device: 'ios', ageConfirmed: true, riskAccepted: true } as const;
  it('accepts ordinary names', () => {
    expect(betaApplicationSchema.safeParse({ ...base, name: 'José O’Brien-Ñúñez' }).success).toBe(true);
  });
  it('refuses control characters and bidi overrides', () => {
    for (const name of ['Ann\u001b[2J', 'a\nb', 'x\u0085y', 'evil‮gnp', 'a⁦b', 'del\u007f']) {
      expect(betaApplicationSchema.safeParse({ ...base, name }).success).toBe(false);
    }
  });
});

describe('encrypted field shapes', () => {
  it('refuses values that are not ciphertext or a 12-byte IV (they slipped past the storage caps as free rows)', () => {
    const T = { id: 3, format: 2, payload: CT, iv: IV };
    expect(createTaxonomySchema.safeParse({ ...T, payload: '@' }).success).toBe(false);
    expect(createTaxonomySchema.safeParse({ ...T, payload: 'YQ==' }).success).toBe(false);
    expect(createTaxonomySchema.safeParse({ ...T, iv: 'aXY=' }).success).toBe(false);
    expect(createTaxonomySchema.safeParse({ ...T, iv: 'aXZpdml2aXZpdml2aXZp' }).success).toBe(false);
    expect(putDoseRecordSchema.safeParse({ format: 2, date: '2026-04-03', payload: CT + '!', iv: IV }).success).toBe(false);
  });
  it('bounds ids to the database int range', () => {
    const post = { id: 2_147_483_648, format: 3, isEncrypted: true, contentEncrypted: CT, contentIv: IV, metadataEncrypted: CT2, metadataIv: IV2 };
    expect(createPostSchema.safeParse(post).success).toBe(false);
    expect(createPostSchema.safeParse({ ...post, id: 2_147_483_647 }).success).toBe(true);
  });
});

describe('createShareSchema media scan', () => {
  it('stays linear on input built to backtrack', () => {
    const evil = 'url(' + ' '.repeat(1_000_000);
    const t = Date.now();
    expect(createShareSchema.safeParse({ content: evil, entryId: 1 }).success).toBe(false);
    expect(Date.now() - t).toBeLessThan(500);
  });
  it('still finds media inside url(), with or without quotes and spaces', () => {
    for (const c of ['url(data:image/png;base64,AA)', 'url( "https://x/y.png")', "url(' blob:abc')", 'a { background: image-set("a.png" 1x) }', '<input type=image src=x>']) {
      expect(createShareSchema.safeParse({ content: c, entryId: 1 }).success).toBe(false);
    }
    expect(createShareSchema.safeParse({ content: '<p>a url( to nowhere</p>', entryId: 1 }).success).toBe(true);
  });
});

describe('upsertSettingSchema value', () => {
  it('needs a value, and caps it in UTF-8 bytes', () => {
    expect(upsertSettingSchema.safeParse({ key: 'k' }).success).toBe(false);
    expect(upsertSettingSchema.safeParse({ key: 'k', value: 'é'.repeat(40_000) }).success).toBe(false);
    expect(upsertSettingSchema.safeParse({ key: 'k', value: 'e'.repeat(40_000) }).success).toBe(true);
  });
});
