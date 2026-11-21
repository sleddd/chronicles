import { describe, it, expect, vi } from 'vitest';
import { withAuthSecret } from '@/utils/passwordForms';

const DECOMPOSED = 'Café-Password-1!';
const wrong = Object.assign(new Error('Invalid credentials'), { status: 401, body: {} });

describe('withAuthSecret', () => {
  it('sends an ASCII password once, normalized or not', async () => {
    const send = vi.fn().mockRejectedValue(wrong);
    await expect(withAuthSecret('Plain-ascii-1!', 'a@b.c', send)).rejects.toBe(wrong);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('tries the as-typed form once after a wrong password, for a password normalizing changes', async () => {
    const send = vi.fn().mockRejectedValueOnce(wrong).mockResolvedValueOnce('ok');
    await expect(withAuthSecret(DECOMPOSED, 'a@b.c', send)).resolves.toBe('ok');
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][0]).not.toBe(send.mock.calls[1][0]);
  });

  it('doesn’t retry when the password was right and the 2FA code is what is missing', async () => {
    const needsCode = Object.assign(new Error('Enter the code'), { status: 401, body: { requires2FA: true } });
    const send = vi.fn().mockRejectedValue(needsCode);
    await expect(withAuthSecret(DECOMPOSED, 'a@b.c', send)).rejects.toBe(needsCode);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
