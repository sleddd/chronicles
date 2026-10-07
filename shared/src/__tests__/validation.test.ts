/**
 * Validation schema unit tests
 * Tests for all Zod schemas in shared/src/validation/schemas.ts
 */
import { describe, it, expect } from 'vitest';
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
  createShareSchema,
} from '../validation/schemas.js';

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
    password: 'SecurePass1!xy',
    encryptedMasterKey: 'abc123',
    kekSalt: 'salt123',
    kekWrapIv: 'iv123',
    recoveryWrappedMK: 'recovmk',
    recoveryWrapIv: 'recoviv',
    recoveryKeyHash: 'hash123',
    recoveryKeySalt: 'rsalt123',
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

  it('rejects missing password', () => {
    const { password, ...rest } = validRegister;
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

  it('applies password validation rules', () => {
    expect(registerSchema.safeParse({ ...validRegister, password: 'weak' }).success).toBe(false);
  });
});

// ============================================================================
// loginSchema
// ============================================================================
describe('loginSchema', () => {
  it('accepts valid login', () => {
    expect(loginSchema.safeParse({ email: 'user@example.com', password: 'anything' }).success).toBe(true);
  });

  it('rejects missing email', () => {
    expect(loginSchema.safeParse({ password: 'test' }).success).toBe(false);
  });

  it('rejects missing password', () => {
    expect(loginSchema.safeParse({ email: 'user@example.com' }).success).toBe(false);
  });

  it('rejects empty password', () => {
    const result = loginSchema.safeParse({ email: 'user@example.com', password: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Password is required');
    }
  });

  it('rejects invalid email', () => {
    expect(loginSchema.safeParse({ email: 'notanemail', password: 'test' }).success).toBe(false);
  });

  it('does not enforce password strength (login only checks presence)', () => {
    // Login schema uses min(1), not passwordSchema
    expect(loginSchema.safeParse({ email: 'user@example.com', password: 'x' }).success).toBe(true);
  });
});

// ============================================================================
// changePasswordSchema
// ============================================================================
describe('changePasswordSchema', () => {
  const valid = {
    currentPassword: 'old-password',
    newPassword: 'NewSecure1!abc',
    newEncryptedMasterKey: 'enc123',
    newKekSalt: 'salt123',
    newKekWrapIv: 'iv123',
  };

  it('accepts valid change password data', () => {
    expect(changePasswordSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects missing currentPassword', () => {
    const { currentPassword, ...rest } = valid;
    expect(changePasswordSchema.safeParse(rest).success).toBe(false);
  });

  it('applies password strength validation to newPassword', () => {
    expect(changePasswordSchema.safeParse({ ...valid, newPassword: 'weak' }).success).toBe(false);
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
    recoveryKey: 'recovery-key-value',
    newPassword: 'NewSecure1!abc',
    newEncryptedMasterKey: 'enc123',
    newKekSalt: 'salt123',
    newKekWrapIv: 'iv123',
    newRecoveryWrappedMK: 'rwmk123',
    newRecoveryWrapIv: 'riv123',
    newRecoveryKeyHash: 'rhash123',
    newRecoveryKeySalt: 'rsalt123',
  };

  it('accepts valid recovery data', () => {
    expect(recoverSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects missing recoveryKey', () => {
    const { recoveryKey, ...rest } = valid;
    expect(recoverSchema.safeParse(rest).success).toBe(false);
  });

  it('requires the rotated recovery key material', () => {
    const { newRecoveryKeyHash, ...rest } = valid;
    expect(recoverSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects empty recoveryKey', () => {
    const result = recoverSchema.safeParse({ ...valid, recoveryKey: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Recovery key is required');
    }
  });

  it('applies password strength validation to newPassword', () => {
    expect(recoverSchema.safeParse({ ...valid, newPassword: 'weak' }).success).toBe(false);
  });

  it('rejects invalid email', () => {
    expect(recoverSchema.safeParse({ ...valid, email: 'bad' }).success).toBe(false);
  });
});

// ============================================================================
// createPostSchema
// ============================================================================
describe('createPostSchema', () => {
  it('accepts a minimal unencrypted post', () => {
    expect(createPostSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a post with content', () => {
    expect(createPostSchema.safeParse({ content: 'Hello world' }).success).toBe(true);
  });

  it('accepts a fully encrypted post', () => {
    const encrypted = {
      isEncrypted: true,
      contentEncrypted: 'enc-content',
      contentIv: 'iv1',
      metadataEncrypted: 'enc-meta',
      metadataIv: 'iv2',
    };
    expect(createPostSchema.safeParse(encrypted).success).toBe(true);
  });

  it('rejects encrypted post missing required encrypted fields', () => {
    const incomplete = {
      isEncrypted: true,
      contentEncrypted: 'enc-content',
      // missing contentIv, metadataEncrypted, metadataIv
    };
    const result = createPostSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('Encrypted posts must include');
    }
  });

  it('rejects encrypted post missing only metadataIv', () => {
    const incomplete = {
      isEncrypted: true,
      contentEncrypted: 'enc-content',
      contentIv: 'iv1',
      metadataEncrypted: 'enc-meta',
      // missing metadataIv
    };
    expect(createPostSchema.safeParse(incomplete).success).toBe(false);
  });

  it('accepts taxonomyIds as an array of numbers', () => {
    expect(createPostSchema.safeParse({ taxonomyIds: [1, 2, 3] }).success).toBe(true);
  });

  it('rejects taxonomyIds with non-number values', () => {
    expect(createPostSchema.safeParse({ taxonomyIds: ['a', 'b'] }).success).toBe(false);
  });

  it('accepts metadata object', () => {
    expect(createPostSchema.safeParse({ metadata: { title: 'test', date: '2024-01-01' } }).success).toBe(true);
  });

  it('rejects metadata exceeding 10KB', () => {
    const largeMetadata: Record<string, string> = {};
    // Create a metadata object that serializes to > 10000 bytes
    largeMetadata.data = 'x'.repeat(10001);
    const result = createPostSchema.safeParse({ metadata: largeMetadata });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.message.includes('Metadata too large'))).toBe(true);
    }
  });

  it('accepts metadata just under 10KB', () => {
    const metadata = { data: 'x'.repeat(9980) };
    expect(createPostSchema.safeParse({ metadata }).success).toBe(true);
  });
});

// ============================================================================
// updatePostSchema
// ============================================================================
describe('updatePostSchema', () => {
  it('accepts a partial update with content only', () => {
    expect(updatePostSchema.safeParse({ content: 'Updated content' }).success).toBe(true);
  });

  it('accepts empty object', () => {
    expect(updatePostSchema.safeParse({}).success).toBe(true);
  });

  it('accepts encrypted fields', () => {
    expect(updatePostSchema.safeParse({
      contentEncrypted: 'enc',
      contentIv: 'iv',
      metadataEncrypted: 'meta-enc',
      metadataIv: 'meta-iv',
    }).success).toBe(true);
  });

  it('accepts taxonomyIds', () => {
    expect(updatePostSchema.safeParse({ taxonomyIds: [1] }).success).toBe(true);
  });

  it('rejects metadata exceeding 10KB', () => {
    const result = updatePostSchema.safeParse({ metadata: { data: 'x'.repeat(10001) } });
    expect(result.success).toBe(false);
  });

  it('does not have isEncrypted field (no refinement check)', () => {
    // updatePostSchema does not include isEncrypted, so it has no encrypted-post refinement
    expect(updatePostSchema.safeParse({ contentEncrypted: 'enc' }).success).toBe(true);
  });
});

// ============================================================================
// createTaxonomySchema
// ============================================================================
describe('createTaxonomySchema', () => {
  it('accepts valid taxonomy with name only', () => {
    expect(createTaxonomySchema.safeParse({ name: 'Work' }).success).toBe(true);
  });

  it('accepts taxonomy with all fields', () => {
    expect(createTaxonomySchema.safeParse({ name: 'Work', icon: 'briefcase', color: '#ff0000' }).success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = createTaxonomySchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Name is required');
    }
  });

  it('rejects name exceeding 100 characters', () => {
    expect(createTaxonomySchema.safeParse({ name: 'a'.repeat(101) }).success).toBe(false);
  });

  it('accepts name at exactly 100 characters', () => {
    expect(createTaxonomySchema.safeParse({ name: 'a'.repeat(100) }).success).toBe(true);
  });

  it('accepts name at exactly 1 character', () => {
    expect(createTaxonomySchema.safeParse({ name: 'A' }).success).toBe(true);
  });

  it('rejects invalid hex color formats', () => {
    const invalidColors = ['red', '#fff', '#gggggg', '123456', '#12345', '#1234567', 'rgb(0,0,0)'];
    for (const color of invalidColors) {
      expect(
        createTaxonomySchema.safeParse({ name: 'Test', color }).success,
        `Color "${color}" should be rejected`
      ).toBe(false);
    }
  });

  it('accepts valid hex colors', () => {
    const validColors = ['#000000', '#ffffff', '#ABCDEF', '#abcdef', '#a1B2c3'];
    for (const color of validColors) {
      expect(
        createTaxonomySchema.safeParse({ name: 'Test', color }).success,
        `Color "${color}" should be accepted`
      ).toBe(true);
    }
  });

  it('provides correct error message for invalid color', () => {
    const result = createTaxonomySchema.safeParse({ name: 'Test', color: 'red' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Invalid hex color');
    }
  });
});

// ============================================================================
// updateTaxonomySchema
// ============================================================================
describe('updateTaxonomySchema', () => {
  it('accepts partial update with name only', () => {
    expect(updateTaxonomySchema.safeParse({ name: 'Updated' }).success).toBe(true);
  });

  it('accepts partial update with icon only', () => {
    expect(updateTaxonomySchema.safeParse({ icon: 'star' }).success).toBe(true);
  });

  it('accepts partial update with color only', () => {
    expect(updateTaxonomySchema.safeParse({ color: '#abcdef' }).success).toBe(true);
  });

  it('accepts empty object (all optional)', () => {
    expect(updateTaxonomySchema.safeParse({}).success).toBe(true);
  });

  it('rejects invalid color in update', () => {
    expect(updateTaxonomySchema.safeParse({ color: 'notacolor' }).success).toBe(false);
  });

  it('rejects name exceeding 100 characters in update', () => {
    expect(updateTaxonomySchema.safeParse({ name: 'a'.repeat(101) }).success).toBe(false);
  });

  it('rejects empty name when provided', () => {
    expect(updateTaxonomySchema.safeParse({ name: '' }).success).toBe(false);
  });
});

// ============================================================================
// upsertSettingSchema
// ============================================================================
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
