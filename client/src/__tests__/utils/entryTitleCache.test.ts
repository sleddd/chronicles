import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { entryTitleText, clearEntryTitleCache } from '@/utils/entryTitle';

describe('entry title cache', () => {
  it('is cleared when the journal locks (it is keyed by decrypted entry HTML)', () => {
    expect(entryTitleText('<h2>Private</h2><p>body</p>')).toBe('Private');
    clearEntryTitleCache();
    expect(entryTitleText('<h2>Private</h2><p>body</p>')).toBe('Private');
    const ctx = readFileSync(resolve(__dirname, '../../contexts/EncryptionContext.tsx'), 'utf8');
    const lockLocal = ctx.split('const lockLocal = useCallback')[1]?.split('}, [])')[0] ?? '';
    expect(lockLocal).toContain('clearEntryTitleCache()');
  });
});
