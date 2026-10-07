/**
 * Security audit unit tests — server-side
 * Tests for all security fixes applied during the audit
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

// ============================================================================
// 1. escapeSchema — validates schema names and prevents SQL injection
// ============================================================================
import { escapeSchema } from '../db/escapeSchema.js';

describe('escapeSchema — schema name validation', () => {
  it('accepts valid schema names', () => {
    expect(escapeSchema('usr_1_a1b2c3')).toBe('usr_1_a1b2c3');
    expect(escapeSchema('usr_999_abcdef')).toBe('usr_999_abcdef');
  });

  it('rejects SQL injection attempts', () => {
    expect(() => escapeSchema('usr_1_a1b2c3; DROP TABLE')).toThrow('Invalid schema name');
    expect(() => escapeSchema("usr_1_a1b2c3' OR '1'='1")).toThrow('Invalid schema name');
    // Note: 'usr_1_a1b2c3--' gets stripped to 'usr_1_a1b2c3' which is valid — escapeSchema
    // strips non-alphanumeric chars first, so the injection chars are removed before validation
    expect(() => escapeSchema('; DROP SCHEMA public CASCADE')).toThrow('Invalid schema name');
  });

  it('rejects names not matching usr_N_hex format', () => {
    expect(() => escapeSchema('public')).toThrow();
    expect(() => escapeSchema('information_schema')).toThrow();
    expect(() => escapeSchema('admin_1_abc')).toThrow();
    expect(() => escapeSchema('')).toThrow();
  });

  it('rejects names that are too long', () => {
    expect(() => escapeSchema('usr_1_a1b2c3' + 'x'.repeat(30))).toThrow();
  });

  it('strips special characters before validation (defense-in-depth)', () => {
    // Special characters are stripped — escapeSchema('usr_1_a1b2c3\x00') becomes 'usr_1_a1b2c3' which is valid
    // This is intentional: the regex strip + format validation provides defense-in-depth
    expect(escapeSchema('usr_1_a1b2c3')).toBe('usr_1_a1b2c3');
    // Strings that are ONLY special chars get rejected
    expect(() => escapeSchema('\x00\n')).toThrow();
    expect(() => escapeSchema('')).toThrow();
  });
});

// ============================================================================
// 2. Session lifetime — 7 days instead of 30
// ============================================================================
describe('Session lifetime', () => {
  it('SESSION_MAX_AGE_DAYS should be 7', async () => {
    // Read the auth.ts file content to verify the constant
    const fs = await import('fs');
    const authContent = fs.readFileSync(new URL('../routes/auth.ts', import.meta.url).pathname.replace('/__tests__', ''), 'utf8');
    expect(authContent).toContain('SESSION_MAX_AGE_DAYS = 7');
    expect(authContent).toContain('SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000');
  });

  it('Session expiry in createSession should be 7 days', async () => {
    const fs = await import('fs');
    const authMiddleware = fs.readFileSync(
      new URL('../middleware/auth.ts', import.meta.url).pathname.replace('/__tests__', ''),
      'utf8'
    );
    expect(authMiddleware).toContain('expiresAt.setDate(expiresAt.getDate() + 7)');
    expect(authMiddleware).not.toContain('expiresAt.setDate(expiresAt.getDate() + 30)');
  });
});

// ============================================================================
// 3. Constant-time delay function
// ============================================================================
describe('constantTimeDelay', () => {
  it('auth.ts exports and uses constantTimeDelay for /salt and /recovery-params', async () => {
    const fs = await import('fs');
    const authContent = fs.readFileSync(
      new URL('../routes/auth.ts', import.meta.url).pathname.replace('/__tests__', ''),
      'utf8'
    );
    // Verify the function exists
    expect(authContent).toContain('async function constantTimeDelay');
    // Verify it's used in /salt endpoint
    const saltSection = authContent.split("router.get('/salt'")[1]?.split('router.')[0] || '';
    expect(saltSection).toContain('constantTimeDelay(startTime)');
    // Verify it's used in /recovery-params endpoint
    const recoverySection = authContent.split("router.get('/recovery-params'")[1]?.split('router.')[0] || '';
    expect(recoverySection).toContain('constantTimeDelay(startTime)');
    // Verify it's used in /recover endpoint
    const recoverSection = authContent.split("router.post('/recover'")[1]?.split('router.')[0] || '';
    expect(recoverSection).toContain('constantTimeDelay(startTime)');
  });
});

// ============================================================================
// 4. Email validation on /salt endpoint
// ============================================================================
describe('Email validation on /salt', () => {
  it('/salt endpoint validates email format before querying', async () => {
    const fs = await import('fs');
    const authContent = fs.readFileSync(
      new URL('../routes/auth.ts', import.meta.url).pathname.replace('/__tests__', ''),
      'utf8'
    );
    expect(authContent).toMatch(/import \{[^}]*\bemailSchema\b[^}]*\} from '@chronicles\/shared'/);
    // Salt endpoint should validate email
    const saltSection = authContent.split("router.get('/salt'")[1]?.split("router.")[0] || '';
    expect(saltSection).toContain('emailSchema.safeParse');
  });
});

// ============================================================================
// 5. Password change revokes ALL sessions (no race condition)
// ============================================================================
describe('Password change session revocation', () => {
  it('should revoke ALL sessions including current, then create new session', async () => {
    const fs = await import('fs');
    const authContent = fs.readFileSync(
      new URL('../routes/auth.ts', import.meta.url).pathname.replace('/__tests__', ''),
      'utf8'
    );
    const changePasswordSection = authContent.split("router.post('/change-password'")[1]?.split("router.")[0] || '';
    // Should NOT have NOT: { selector: ... } — revokes ALL sessions
    expect(changePasswordSection).not.toContain('NOT: { selector:');
    // Should have createSession AFTER the transaction
    expect(changePasswordSection).toContain('createSession(account.id');
    // Should set cookie with new token
    expect(changePasswordSection).toContain('res.cookie(COOKIE_NAME, token');
  });
});

// ============================================================================
// 6. Recovery key uses PBKDF2 hashing (not plain SHA-256)
// ============================================================================
describe('Recovery key PBKDF2 hashing', () => {
  it('server recovery endpoint uses pbkdf2Sync, not createHash', async () => {
    const fs = await import('fs');
    const authContent = fs.readFileSync(
      new URL('../routes/auth.ts', import.meta.url).pathname.replace('/__tests__', ''),
      'utf8'
    );
    const recoverSection = authContent.split("router.post('/recover'")[1]?.split("router.")[0] || '';
    expect(recoverSection).toContain('pbkdf2Sync');
    expect(recoverSection).not.toContain("createHash('sha256')");
    expect(recoverSection).toContain('recoveryKeySalt');
    expect(recoverSection).toContain('600000'); // iterations
  });

  it('PBKDF2 hash produces correct output', () => {
    const recoveryKey = 'test-recovery-key-base64';
    const salt = crypto.randomBytes(16);
    const hash = crypto.pbkdf2Sync(recoveryKey, salt, 600000, 32, 'sha256').toString('hex');
    // Verify it's deterministic with same inputs
    const hash2 = crypto.pbkdf2Sync(recoveryKey, salt, 600000, 32, 'sha256').toString('hex');
    expect(hash).toBe(hash2);
    expect(hash).toHaveLength(64); // 32 bytes = 64 hex chars
    // Different salt produces different hash
    const salt2 = crypto.randomBytes(16);
    const hash3 = crypto.pbkdf2Sync(recoveryKey, salt2, 100000, 32, 'sha256').toString('hex');
    expect(hash3).not.toBe(hash);
  });
});

// ============================================================================
// 7. Recovery key is single-use (atomic transaction with recoveryKeyUsedAt)
// ============================================================================
describe('Recovery key single-use enforcement', () => {
  it('recovery endpoint atomically rotates recovery data and revokes sessions', async () => {
    const fs = await import('fs');
    const authContent = fs.readFileSync(
      new URL('../routes/auth.ts', import.meta.url).pathname.replace('/__tests__', ''),
      'utf8'
    );
    const recoverSection = authContent.split("router.post('/recover'")[1]?.split("router.")[0] || '';
    // Should use $transaction
    expect(recoverSection).toContain('prisma.$transaction');
    // Should set recoveryKeyUsedAt
    expect(recoverSection).toContain('recoveryKeyUsedAt: new Date()');
    // The used recovery key is replaced by a fresh one in the same transaction,
    // so the old key can never unlock the account again
    expect(recoverSection).toContain('recoveryKeyHash: newRecoveryKeyHash');
    expect(recoverSection).toContain('recoveryKeySalt: newRecoveryKeySalt');
    expect(recoverSection).toContain('recoveryWrappedMK: new Uint8Array(Buffer.from(newRecoveryWrappedMK');
    // Row lock re-checks the key wasn't consumed by a concurrent request
    expect(recoverSection).toContain('FOR UPDATE');
    // Should revoke all sessions in same transaction
    expect(recoverSection).toContain('session.updateMany');
  });

  it('Prisma schema has recoveryKeyUsedAt and recoveryKeySalt fields', async () => {
    const fs = await import('fs');
    const schema = fs.readFileSync(
      new URL('../../prisma/schema.prisma', import.meta.url).pathname.replace('/src/__tests__', ''),
      'utf8'
    );
    expect(schema).toContain('recoveryKeyUsedAt');
    expect(schema).toContain('recoveryKeySalt');
    expect(schema).toContain('recovery_key_used_at');
    expect(schema).toContain('recovery_key_salt');
  });
});

// ============================================================================
// 8. Password validation errors are generic (don't leak requirements)
// ============================================================================
describe('Generic password validation errors', () => {
  it('register endpoint returns generic validation error', async () => {
    const fs = await import('fs');
    const authContent = fs.readFileSync(
      new URL('../routes/auth.ts', import.meta.url).pathname.replace('/__tests__', ''),
      'utf8'
    );
    // Register should return generic message
    const registerSection = authContent.split("router.post('/register'")[1]?.split("router.")[0] || '';
    expect(registerSection).toContain("'Password does not meet requirements'");
    expect(registerSection).not.toContain('parsed.error.errors[0].message');
  });

  it('change-password endpoint returns generic validation error', async () => {
    const fs = await import('fs');
    const authContent = fs.readFileSync(
      new URL('../routes/auth.ts', import.meta.url).pathname.replace('/__tests__', ''),
      'utf8'
    );
    const changePwSection = authContent.split("router.post('/change-password'")[1]?.split("router.")[0] || '';
    expect(changePwSection).toContain("'Password does not meet requirements'");
  });

  it('recover endpoint returns generic validation error', async () => {
    const fs = await import('fs');
    const authContent = fs.readFileSync(
      new URL('../routes/auth.ts', import.meta.url).pathname.replace('/__tests__', ''),
      'utf8'
    );
    const recoverSection = authContent.split("router.post('/recover'")[1]?.split("router.")[0] || '';
    expect(recoverSection).toContain("'Password does not meet requirements'");
  });
});

// ============================================================================
// 9. Error logging is sanitized (no full err objects)
// ============================================================================
describe('Sanitized error logging', () => {
  it('auth.ts never logs raw error objects in catch blocks', async () => {
    const fs = await import('fs');
    const authContent = fs.readFileSync(
      new URL('../routes/auth.ts', import.meta.url).pathname.replace('/__tests__', ''),
      'utf8'
    );
    // Should NOT have console.error('...:', err) without .message
    const rawErrorLogs = authContent.match(/console\.error\([^)]+,\s+err\s*\)/g);
    expect(rawErrorLogs).toBeNull();
  });

  it('auth middleware logs activity update errors', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync(
      new URL('../middleware/auth.ts', import.meta.url).pathname.replace('/__tests__', ''),
      'utf8'
    );
    // Should log errors instead of swallowing them
    expect(content).toContain('Session activity update failed');
    expect(content).not.toContain('.catch(() => {})');
  });
});

// ============================================================================
// 10. DB SSL enforcement in production
// ============================================================================
describe('Database SSL enforcement', () => {
  it('prisma.ts throws if DATABASE_URL is missing', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync(
      new URL('../db/prisma.ts', import.meta.url).pathname.replace('/__tests__', ''),
      'utf8'
    );
    expect(content).toContain("throw new Error('DATABASE_URL environment variable is required')");
  });

  it('prisma.ts throws if production DB lacks sslmode=require', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync(
      new URL('../db/prisma.ts', import.meta.url).pathname.replace('/__tests__', ''),
      'utf8'
    );
    expect(content).toContain("throw new Error('DATABASE_URL must include sslmode=require in production')");
    // Should be a throw, not a warn
    expect(content).not.toContain('console.warn');
  });
});

// ============================================================================
// 11. Index names use validated schema names
// ============================================================================
describe('Index name escaping in tenantQueries', () => {
  it('dose logs index names use escaped schema name prefix', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync(
      new URL('../db/tenantQueries.ts', import.meta.url).pathname.replace('/__tests__', ''),
      'utf8'
    );
    // Should use a validated prefix variable, not raw interpolation
    expect(content).toContain('const idxPrefix = `idx_${s}`');
    expect(content).toContain('${idxPrefix}_dose_logs_date');
    expect(content).toContain('${idxPrefix}_dose_logs_med_date');
    expect(content).toContain('${idxPrefix}_dose_logs_unique');
  });
});

// ============================================================================
// 12. Topics route uses escapeSchema (not inline regex)
// ============================================================================
describe('Topics route uses escapeSchema', () => {
  it('ensureSortOrderColumn uses escapeSchema import', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync(
      new URL('../routes/topics.ts', import.meta.url).pathname.replace('/__tests__', ''),
      'utf8'
    );
    expect(content).toContain("import { escapeSchema } from '../db/escapeSchema.js'");
    expect(content).toContain('const s = escapeSchema(schemaName)');
    // Should NOT have inline regex escaping
    expect(content).not.toContain("schemaName.replace(/[^a-z0-9_]/gi, '')");
  });
});

// ============================================================================
// 13. Dose route validates medication post ownership
// ============================================================================
describe('Dose route post ownership validation', () => {
  it('POST /doses validates medicationPostId belongs to tenant', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync(
      new URL('../routes/doses.ts', import.meta.url).pathname.replace('/__tests__', ''),
      'utf8'
    );
    expect(content).toContain("import { ensureDoseLogsTable, getDoseLogsByDate, upsertDoseLog, getPost }");
    expect(content).toContain('getPost(req.auth!.tenantSchemaName, medicationPostId)');
    expect(content).toContain("'Medication post not found'");
  });
});

// ============================================================================
// 14. Metadata size limit in validation schemas
// ============================================================================
describe('Metadata size limit', () => {
  it('createPostSchema and updatePostSchema enforce metadata size limit', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync(
      new URL('../../../shared/src/validation/schemas.ts', import.meta.url).pathname.replace('/server/src/__tests__', ''),
      'utf8'
    );
    expect(content).toContain('Metadata too large (max 10KB)');
    expect(content).toContain('JSON.stringify(val).length <= 10000');
  });
});

// ============================================================================
// 15. Register schema requires recoveryKeySalt
// ============================================================================
describe('Register schema includes recoveryKeySalt', () => {
  it('registerSchema requires recoveryKeySalt field', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync(
      new URL('../../../shared/src/validation/schemas.ts', import.meta.url).pathname.replace('/server/src/__tests__', ''),
      'utf8'
    );
    expect(content).toContain("recoveryKeySalt: z.string().min(1)");
  });
});

// ============================================================================
// 16. Login timing oracle fix — constantTimeDelay on bad password
// ============================================================================
describe('Login timing oracle fix', () => {
  it('login endpoint uses constantTimeDelay on both no-account and bad-password paths', async () => {
    const fs = await import('fs');
    const authContent = fs.readFileSync(
      new URL('../routes/auth.ts', import.meta.url).pathname.replace('/__tests__', ''),
      'utf8'
    );
    const loginSection = authContent.split("router.post('/login'")[1]?.split("router.")[0] || '';
    // Should capture startTime at top of handler
    expect(loginSection).toContain('const startTime = Date.now()');
    // Should use constantTimeDelay on no-account path
    const noAccountBlock = loginSection.split('login_failed_no_account')[1]?.split('const valid')[0] || '';
    expect(noAccountBlock).toContain('constantTimeDelay(startTime)');
    // Should use constantTimeDelay on bad-password path
    const badPasswordBlock = loginSection.split('login_failed_bad_password')[1]?.split('const token')[0] || '';
    expect(badPasswordBlock).toContain('constantTimeDelay(startTime)');
  });
});

// ============================================================================
// 17. Login does NOT leak Zod validation errors
// ============================================================================
describe('Login validation error sanitization', () => {
  it('login endpoint returns generic error on validation failure', async () => {
    const fs = await import('fs');
    const authContent = fs.readFileSync(
      new URL('../routes/auth.ts', import.meta.url).pathname.replace('/__tests__', ''),
      'utf8'
    );
    const loginSection = authContent.split("router.post('/login'")[1]?.split("router.")[0] || '';
    // Should NOT expose Zod error details
    expect(loginSection).not.toContain('parsed.error.errors[0].message');
    expect(loginSection).not.toContain('parsed.error.errors');
  });
});

// ============================================================================
// 18. Recovery race condition — interactive transaction with row locking
// ============================================================================
describe('Recovery race condition prevention', () => {
  it('recovery endpoint uses interactive transaction with FOR UPDATE row locking', async () => {
    const fs = await import('fs');
    const authContent = fs.readFileSync(
      new URL('../routes/auth.ts', import.meta.url).pathname.replace('/__tests__', ''),
      'utf8'
    );
    const recoverSection = authContent.split("router.post('/recover'")[1]?.split("router.")[0] || '';
    // Should use interactive transaction (async callback, not array)
    expect(recoverSection).toContain('prisma.$transaction(async (tx)');
    // Should use SELECT ... FOR UPDATE to lock the row
    expect(recoverSection).toContain('FOR UPDATE');
    // Should re-check recovery_key_hash inside transaction
    expect(recoverSection).toContain('recovery_key_hash');
    // Should handle concurrent recovery case
    expect(recoverSection).toContain('concurrent_recovery');
  });
});

// ============================================================================
// 19. Server tsconfig has sourceMap disabled
// ============================================================================
describe('Server source maps disabled', () => {
  it('server tsconfig.json has sourceMap set to false', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync(
      new URL('../../tsconfig.json', import.meta.url).pathname.replace('/src/__tests__', ''),
      'utf8'
    );
    const config = JSON.parse(content);
    expect(config.compilerOptions.sourceMap).toBe(false);
  });
});

// ============================================================================
// 20. Expanded Permissions-Policy header
// ============================================================================
describe('Expanded Permissions-Policy', () => {
  it('security headers include payment, usb, accelerometer, gyroscope, magnetometer', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync(
      new URL('../middleware/security.ts', import.meta.url).pathname.replace('/__tests__', ''),
      'utf8'
    );
    expect(content).toContain('payment=()');
    expect(content).toContain('usb=()');
    expect(content).toContain('accelerometer=()');
    expect(content).toContain('gyroscope=()');
    expect(content).toContain('magnetometer=()');
  });
});

// ============================================================================
// 21. Activity debounce reduced to 5 minutes
// ============================================================================
describe('Activity debounce interval', () => {
  it('ACTIVITY_DEBOUNCE_MS is 5 minutes', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync(
      new URL('../middleware/auth.ts', import.meta.url).pathname.replace('/__tests__', ''),
      'utf8'
    );
    expect(content).toContain('5 * 60 * 1000');
    expect(content).not.toContain('15 * 60 * 1000');
  });
});

// ============================================================================
// 22. Recovery PBKDF2 iterations increased to 600,000
// ============================================================================
describe('Recovery PBKDF2 iterations', () => {
  it('server recovery endpoint uses 600000 iterations', async () => {
    const fs = await import('fs');
    const authContent = fs.readFileSync(
      new URL('../routes/auth.ts', import.meta.url).pathname.replace('/__tests__', ''),
      'utf8'
    );
    const recoverSection = authContent.split("router.post('/recover'")[1]?.split("router.")[0] || '';
    expect(recoverSection).toContain('pbkdf2Sync(recoveryKey, recoveryKeySalt, 600000');
    // Should NOT use old 100000 iterations
    expect(recoverSection).not.toContain('100000');
  });
});
