/**
 * Security audit unit tests — client-side
 * Tests for encryption context, recovery key handling, and client security fixes
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const readSrc = (relativePath: string) =>
  fs.readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8');

// ============================================================================
// 1. Idle sign-out — by the clock, not a running timer
// ============================================================================
describe('idle sign-out', () => {
  it('ends the session after 15 minutes away, watching the usual activity', () => {
    const content = readSrc('hooks/useIdleSignOut.ts');
    expect(readSrc('services/activity.ts')).toContain('15 * 60 * 1000');
    for (const event of ['pointerdown', 'keydown', 'scroll', 'touchstart']) expect(content).toContain(event);
    expect(content).toContain('removeEventListener');
    expect(content).toContain('clearInterval(timer)');
  });

  it('measures against the clock and checks when the page comes back (timers stop while a laptop sleeps)', () => {
    const content = readSrc('hooks/useIdleSignOut.ts');
    expect(content).toContain('Date.now()');
    expect(content).toContain('visibilitychange');
    expect(content).toContain('pageshow');
    // No timer set for the whole idle period
    expect(content).not.toMatch(/setTimeout\([^)]*IDLE_SIGN_OUT_MS/);
  });

  it('a tab asked for the key refuses once the browser is idle, and only a real sign-in counts as being here', () => {
    const content = readSrc('contexts/EncryptionContext.tsx');
    expect(content).toContain('!browserIsIdle()');
    // Taking the key from another tab is installed without marking activity
    expect(content).toContain('await install(key, false)');
  });

  it('is not in the encryption context any more, and nothing there locks a hidden tab', () => {
    const content = readSrc('contexts/EncryptionContext.tsx');
    expect(content).not.toContain('INACTIVITY_TIMEOUT_MS');
    expect(content).not.toContain('visibilitychange');
    expect(content).not.toContain('document.hidden');
  });
});

// ============================================================================
// 2. EncryptionContext — recovery flow converts to non-extractable
// ============================================================================
describe('EncryptionContext recovery key lifecycle', () => {
  it('rewrapMasterKey converts to non-extractable after recovery rewrap', () => {
    const content = readSrc('contexts/EncryptionContext.tsx');
    // In recovery path, should call toNonExtractable AFTER rewrap
    expect(content).toContain('await toNonExtractable(extractableKey)');
  });

  it('clear master key on unmount', () => {
    const content = readSrc('contexts/EncryptionContext.tsx');
    expect(content).toContain('masterKeyRef.current = null');
  });

  it('holds nothing of the old stored-key Remember me', () => {
    const content = readSrc('contexts/EncryptionContext.tsx');
    expect(content).not.toMatch(/rememberDevice|unwrapFromDevice|unwrapMasterKeyForDevice|REMEMBER_STORE_KEY/);
    expect(fs.existsSync(path.resolve(__dirname, '..', 'services/rememberDevice.ts'))).toBe(false);
    expect(fs.existsSync(path.resolve(__dirname, '..', 'components/organisms/UnlockDialog.tsx'))).toBe(false);
  });

});

// ============================================================================
// 3. RegisterView — PBKDF2 recovery key hashing
// ============================================================================
describe('RegisterView PBKDF2 recovery key hashing', () => {
  // The PBKDF2 itself (600k iterations, random 16-byte salt) is tested in
  // shared/src/__tests__/authSecret.test.ts
  it('hashes the recovery key with the shared PBKDF2 helper, not SHA-256', () => {
    const content = readSrc('views/RegisterView.tsx');
    expect(content).toContain('newRecoveryProof(result.recoveryKey)');
    expect(content).not.toContain("crypto.subtle.digest(");
  });

  it('sends a derived sign-in secret, never the password', () => {
    const content = readSrc('views/RegisterView.tsx');
    expect(content).toContain('deriveAuthSecret(password, email)');
    const registerCall = content.split('await register({')[1]?.split('});')[0] || '';
    expect(registerCall).toContain('authSecret');
    expect(registerCall).not.toMatch(/\bpassword\b/);
  });

  it('sends recoveryKeySalt to server on register', () => {
    const content = readSrc('views/RegisterView.tsx');
    expect(content).toContain('recoveryKeySalt');
  });

  it('clears recovery key from state on confirm', () => {
    const content = readSrc('views/RegisterView.tsx');
    expect(content).toContain('setRecoveryKey(null)');
    expect(content).toContain('handleConfirm');
  });
});

// ============================================================================
// 4. RecoveryKeyDisplay — clipboard cleanup on unmount
// ============================================================================
describe('RecoveryKeyDisplay clipboard security', () => {
  it('clears clipboard on unmount', () => {
    const content = readSrc('components/molecules/RecoveryKeyDisplay.tsx');
    expect(content).toContain('useEffect');
    expect(content).toContain("navigator.clipboard.writeText('')");
    // Should have cleanup in useEffect return
    expect(content).toContain('return () =>');
  });

  it('auto-clears clipboard after 30 seconds on copy', () => {
    const content = readSrc('components/molecules/RecoveryKeyDisplay.tsx');
    expect(content).toContain('30000');
    expect(content).toContain("navigator.clipboard.writeText('')");
  });
});

// ============================================================================
// 5. API client — CSRF header always sent
// ============================================================================
describe('API client CSRF protection', () => {
  it('always includes X-Requested-With header', () => {
    const content = readSrc('services/api.ts');
    expect(content).toContain("'X-Requested-With': 'XMLHttpRequest'");
  });

  it('sends credentials by default, and leaves them out only for public shelf reads', () => {
    const content = readSrc('services/api.ts');
    expect(content).toContain("credentials = 'include'");
    // A public shelf's token never travels beside the session (getPage and peek)
    const omitted = content.split('\n').filter(line => line.includes("credentials: 'omit'"));
    expect(omitted).toHaveLength(2);
    for (const line of omitted) expect(line).toContain('/public-shelf/${encodeURIComponent(token)}');
  });

  it('register payload includes recoveryKeySalt', () => {
    const content = readSrc('services/api.ts');
    expect(content).toContain('recoveryKeySalt: string');
  });
});

// ============================================================================
// 6. AuthContext — register type includes recoveryKeySalt
// ============================================================================
describe('AuthContext register type', () => {
  it('register type includes recoveryKeySalt', () => {
    const content = readSrc('contexts/AuthContext.tsx');
    expect(content).toContain('recoveryKeySalt: string');
  });
});

// ============================================================================
// 7. EncryptionContext — PBKDF2 iteration downgrade protection
// ============================================================================
describe('PBKDF2 downgrade protection', () => {
  it('rejects iterations below PBKDF2_ITERATIONS minimum', () => {
    const content = readSrc('contexts/EncryptionContext.tsx');
    expect(content).toContain('kekIterations < PBKDF2_ITERATIONS');
    expect(content).toContain('below minimum');
  });
});

// ============================================================================
// 8. RegisterView — recovery key PBKDF2 uses 600,000 iterations
// ============================================================================
describe('Recovery never sends the recovery key or password', () => {
  it('RecoverView sends a proof and a derived secret', () => {
    const content = readSrc('views/RecoverView.tsx');
    const recoverCall = content.split('await authApi.recover({')[1]?.split('});')[0] || '';
    expect(recoverCall).toContain('recoveryProof');
    expect(recoverCall).toContain('newAuthSecret');
    expect(recoverCall).not.toMatch(/\brecoveryKey\b|\bnewPassword\b/);
  });
});

// ============================================================================
// 9. RecoveryKeyDisplay — clipboard failure logging
// ============================================================================
describe('RecoveryKeyDisplay clipboard failure logging', () => {
  it('logs warning when clipboard auto-clear fails', () => {
    const content = readSrc('components/molecules/RecoveryKeyDisplay.tsx');
    expect(content).toContain('Failed to auto-clear clipboard');
    expect(content).toContain('console.warn');
  });
});
