import { describe, it, expect } from 'vitest';
import { parseLicense } from '../../views/LicenseView.js';
import licenseText from '../../../../LICENSE?raw';

describe('parseLicense', () => {
  it('reads the title, the copyright line, the section headings and joined paragraphs', () => {
    const { title, meta, blocks } = parseLicense(licenseText);
    expect(title).toBe('Chronicles — Personal Use License');
    expect(meta).toMatch(/^Copyright/);
    expect(blocks.filter(b => b.kind === 'h2').map(b => b.text)).toContain('1. Permitted use');
    expect(blocks.some(b => b.kind === 'p' && b.text.startsWith('a. use the Software for any commercial purpose'))).toBe(true);
    expect(blocks.every(b => !b.text.includes('\n'))).toBe(true);
  });
});
