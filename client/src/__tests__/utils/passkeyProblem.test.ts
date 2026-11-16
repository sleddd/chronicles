import { describe, it, expect } from 'vitest';
import { passkeySignInProblem } from '../../utils/passkeyProblem.js';

describe('passkeySignInProblem', () => {
  it('a rate limit before the sheet opens doesn’t blame the passkey', () => {
    const msg = passkeySignInProblem({ status: 429, retryAfterSec: 540, message: 'Too many requests' }, false);
    expect(msg).toContain('Wait 9 minutes');
    expect(msg).not.toContain('didn’t work');
  });
  it('the server’s refusal is passed on', () => {
    expect(passkeySignInProblem({ status: 401, message: 'That passkey didn’t work because it isn’t on your account.' }, false)).toContain('isn’t on your account');
  });
  it('a server fault, a wrong address and no connection each say so', () => {
    expect(passkeySignInProblem({ status: 500, message: 'x' }, false)).toContain('unavailable');
    expect(passkeySignInProblem({ name: 'SecurityError' }, false)).toContain('this address');
    expect(passkeySignInProblem(new TypeError('Failed to fetch'), false)).toContain('couldn’t be reached');
  });
  it('after the server accepted it, the journal is what failed', () => {
    expect(passkeySignInProblem(new Error('x'), true)).toContain('couldn’t be opened');
  });
});
