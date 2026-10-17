import { describe, it, expect } from 'vitest';
import { crc32, zipTextFiles } from '../../utils/zip.js';

describe('zip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('writes a store-only zip that lists every file with its CRC', () => {
    const files = [{ name: 'a.csv', text: 'x,y\n1,2\n' }, { name: 'é.json', text: '{"ok":true}' }];
    const zip = zipTextFiles(files, new Date(2026, 9, 16, 12, 0, 0));
    const v = new DataView(zip.buffer);
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    // End of central directory: last 22 bytes
    const eocd = zip.length - 22;
    expect(v.getUint32(eocd, true)).toBe(0x06054b50);
    expect(v.getUint16(eocd + 10, true)).toBe(2);
    const cdOffset = v.getUint32(eocd + 16, true);
    expect(v.getUint32(cdOffset, true)).toBe(0x02014b50);
    expect(v.getUint32(cdOffset + 16, true)).toBe(crc32(new TextEncoder().encode('x,y\n1,2\n')));
    // File data is stored as-is after its local header
    const nameLen = v.getUint16(26, true);
    expect(new TextDecoder().decode(zip.slice(30 + nameLen, 30 + nameLen + 8))).toBe('x,y\n1,2\n');
  });
});
