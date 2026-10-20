import { describe, it, expect, vi } from 'vitest';

vi.mock('../db/prisma.js', () => ({ prisma: {} }));

import { printable } from '../db/betaQueries.js';

describe('printable (npm run beta output)', () => {
  it('removes terminal escapes, C0/C1 controls and bidi overrides', () => {
    expect(printable('Ann\u001b[2J\u001b]0;pwned\u0007 Lee')).toBe('Ann[2J]0;pwned Lee');
    expect(printable('a\r\nb\tc\u007f\u0085\u009bd')).toBe('abcd');
    expect(printable('evil\u202egnp.exe\u2066x\u2069')).toBe('evilgnp.exex');
  });

  it('keeps ordinary names, accents and emoji', () => {
    expect(printable('José Ñúñez-O’Brien 🌱')).toBe('José Ñúñez-O’Brien 🌱');
  });
});
