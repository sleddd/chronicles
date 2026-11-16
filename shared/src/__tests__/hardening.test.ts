import { describe, it, expect } from 'vitest';
import { registerSchema, changePasswordSchema, upsertSettingSchema, settingKeySchema, usernameSchema, createShareSchema } from '../validation/schemas.js';

const WRAP = 'A'.repeat(64);
const IV = 'A'.repeat(16);
const register = {
  email: 'a@example.com', username: 'alice', authSecret: 'a'.repeat(64),
  encryptedMasterKey: WRAP, kekSalt: 'A'.repeat(22) + '==', kekWrapIv: IV,
  recoveryWrappedMK: WRAP, recoveryWrapIv: IV, recoveryKeyHash: 'b'.repeat(64), recoveryKeySalt: 'c'.repeat(32),
};

describe('key wraps are stored only in the shape a key can open', () => {
  it('accepts a real wrap', () => {
    expect(registerSchema.safeParse(register).success).toBe(true);
  });
  it.each([
    ['encryptedMasterKey', 'not base64 !!'], ['encryptedMasterKey', 'AAAA'], ['encryptedMasterKey', WRAP + 'AAAA'],
    ['kekWrapIv', '@@'], ['kekWrapIv', 'AAAA'], ['recoveryWrappedMK', 'zz'], ['recoveryWrapIv', '!'],
  ])('refuses %s = %s at sign-up', (key, value) => {
    expect(registerSchema.safeParse({ ...register, [key]: value }).success).toBe(false);
  });
  it('refuses a wrap no password could open at a password change', () => {
    const change = { currentAuthSecret: 'a'.repeat(64), newAuthSecret: 'b'.repeat(64), newEncryptedMasterKey: WRAP, newKekSalt: register.kekSalt, newKekWrapIv: IV };
    expect(changePasswordSchema.safeParse(change).success).toBe(true);
    expect(changePasswordSchema.safeParse({ ...change, newEncryptedMasterKey: 'garbage' }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ ...change, newKekWrapIv: 'x' }).success).toBe(false);
  });
});

describe('text the database cannot store is refused, not a server error', () => {
  it('usernames and setting keys hold no control characters', () => {
    expect(usernameSchema.safeParse('ab\u0000cd').success).toBe(false);
    expect(usernameSchema.safeParse('Zoë Lee').success).toBe(true);
    expect(settingKeySchema.safeParse('k\u0000').success).toBe(false);
  });
  it('a setting value with a zero byte, or nested too deep to store, is refused', () => {
    expect(upsertSettingSchema.safeParse({ key: 'x', value: 'a\u0000b' }).success).toBe(false);
    expect(upsertSettingSchema.safeParse({ key: 'x', value: { a: ['ok', 'b\u0000'] } }).success).toBe(false);
    let deep: unknown = 1;
    for (let i = 0; i < 20000; i++) deep = [deep];
    expect(upsertSettingSchema.safeParse({ key: 'x', value: deep }).success).toBe(false);
    expect(upsertSettingSchema.safeParse({ key: 'x', value: { a: 1 } }).success).toBe(true);
  });
  it('a share with a zero byte is refused', () => {
    expect(createShareSchema.safeParse({ content: '<p>a\u0000</p>', entryId: 1 }).success).toBe(false);
  });
});
