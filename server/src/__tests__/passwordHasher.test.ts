import { describe, it, expect, vi, afterEach } from 'vitest';
import bcryptjs from 'bcryptjs';

afterEach(() => {
  vi.resetModules();
  delete process.env.BCRYPT_MAX_QUEUE;
  delete process.env.BCRYPT_WORKERS;
});

describe('passwordHasher', () => {
  it('makes hashes bcryptjs accepts, and accepts hashes bcryptjs made', async () => {
    const { default: hasher } = await import('../services/passwordHasher.js');
    const made = await hasher.hash('secret', 4);
    expect(made).toMatch(/^\$2[ab]\$04\$/);
    expect(await bcryptjs.compare('secret', made)).toBe(true);

    const stored = await bcryptjs.hash('secret', 4);
    expect(await hasher.compare('secret', stored)).toBe(true);
    expect(await hasher.compare('wrong', stored)).toBe(false);
  });

  it('keeps the event loop free while hashing', async () => {
    const { default: hasher } = await import('../services/passwordHasher.js');
    await hasher.hash('warm-up', 4); // worker start-up isn't what's measured
    let worst = 0;
    let last = performance.now();
    let ticking = true;
    const tick = () => {
      const now = performance.now();
      worst = Math.max(worst, now - last);
      last = now;
      if (ticking) setTimeout(tick, 1);
    };
    setTimeout(tick, 1);
    await Promise.all([hasher.hash('a', 10), hasher.hash('b', 10)]); // ~60 ms+ of bcrypt each
    ticking = false;
    // In-thread, bcryptjs would stall the loop for the whole hash
    expect(worst).toBeLessThan(40);
  });

  it('refuses work with HasherBusyError once the queue is full', async () => {
    process.env.BCRYPT_WORKERS = '1';
    process.env.BCRYPT_MAX_QUEUE = '2';
    const { default: hasher, HasherBusyError } = await import('../services/passwordHasher.js');
    const running = [hasher.hash('a', 8), hasher.hash('b', 8), hasher.hash('c', 8)]; // 1 running + 2 queued
    await expect(hasher.hash('d', 8)).rejects.toBeInstanceOf(HasherBusyError);
    await expect(Promise.all(running)).resolves.toHaveLength(3);
  });

  it('reports a bad hash as an error, not a crash', async () => {
    const { default: hasher } = await import('../services/passwordHasher.js');
    await expect(hasher.hash(123 as unknown as string, 4)).rejects.toThrow(/Illegal arguments/);
    expect(await hasher.hash('still works', 4)).toMatch(/^\$2/);
  });
});
