import { describe, it, expect } from 'vitest';
import { passwordStrength, newPasswordProblem } from '../validation/passwordStrength.js';

const probe = (pw: string, ctx = {}) => { const s = passwordStrength(pw, ctx); return `${pw} → ${s.score} ${s.bits}`; };

describe('passwordStrength', () => {
  it('scores common passwords low, even with digits and symbols on', () => {
    for (const pw of ['Password123!', 'P@ssw0rd2026!', 'Qwerty123456!', 'Welcome2026!!', 'Iloveyou1234!', 'Chronicles2026!']) {
      expect(passwordStrength(pw).score, probe(pw)).toBeLessThan(3);
    }
  });

  it('scores runs and repeats low', () => {
    for (const pw of ['Aaaaaaaaaaa1!', 'Abcdefghijk1!', 'Asdfghjkl123!', 'xY7!xY7!xY7!']) {
      expect(passwordStrength(pw).score, probe(pw)).toBeLessThan(3);
    }
  });

  it('scores long random or several-word passwords well', () => {
    for (const pw of ['v8#Kq2!mZt9w', 'Tq7&fLp2xR!e9s', 'Correct-Horse-Battery-9', 'maple river 7 lantern Quiet!']) {
      expect(passwordStrength(pw).score, probe(pw)).toBeGreaterThanOrEqual(3);
    }
  });

  it('spots the email or username', () => {
    const s = passwordStrength('JaneDoe#2026xyz', { email: 'jane.doe@example.com' });
    expect(s.tip).toBe('Leave out your name and email.');
    expect(newPasswordProblem('JaneDoe#2026xyzQ', { email: 'jane.doe@example.com' })).toBe('Leave your name and email out of your password.');
  });

  it('is empty for an empty password', () => {
    expect(passwordStrength('')).toEqual({ score: 0, label: 'Too weak', bits: 0, tip: null });
  });
});

describe('newPasswordProblem', () => {
  it('checks the basic rules first', () => {
    expect(newPasswordProblem('short')).toMatch(/at least 12/);
    expect(newPasswordProblem('alllowercase12!')).toMatch(/uppercase/);
  });

  it('refuses a weak password that meets the rules', () => {
    expect(newPasswordProblem('Password123!')).toMatch(/too easy to guess/);
  });

  it('accepts a strong one', () => {
    expect(newPasswordProblem('v8#Kq2!mZt9w')).toBeNull();
    expect(newPasswordProblem('Correct-Horse-Battery-9')).toBeNull();
  });
});
