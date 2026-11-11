import { describe, it, expect } from 'vitest';

describe('isReservedImportColumn', () => {
  it('refuses the app’s own keys, the public-shelf flag and object names — and lets ordinary columns through', async () => {
    const { isReservedImportColumn } = await import('../../utils/csv.js');
    for (const name of ['_doseLink', '_importKey', '__proto__', 'onPublicShelf', ' ONPUBLICSHELF ', 'constructor', 'prototype']) {
      expect(isReservedImportColumn(name)).toBe(true);
    }
    for (const name of ['Author', 'Rating', 'notes', 'On shelf']) {
      expect(isReservedImportColumn(name)).toBe(false);
    }
  });
});

describe('safeAccent', () => {
  it('takes only a hex colour, else Teal', async () => {
    const { safeAccent, DEFAULT_ACCENT_COLOR } = await import('../../styles/accent.js');
    expect(safeAccent('#C0FFEE')).toBe('#C0FFEE');
    expect(safeAccent('#abc')).toBe('#abc');
    for (const bad of ['red; background:url(/api/x)', '#12345', 'transparent', '', null, 7]) {
      expect(safeAccent(bad)).toBe(DEFAULT_ACCENT_COLOR);
    }
  });
});
