import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { entryTitleText, clearEntryTitleCache } from '@/utils/entryTitle';

describe('entry title cache', () => {
  it('is cleared when the key leaves the tab (it is keyed by decrypted entry HTML)', () => {
    expect(entryTitleText('<h2>Private</h2><p>body</p>')).toBe('Private');
    clearEntryTitleCache();
    expect(entryTitleText('<h2>Private</h2><p>body</p>')).toBe('Private');
    const ctx = readFileSync(resolve(__dirname, '../../contexts/EncryptionContext.tsx'), 'utf8');
    const clearKey = ctx.split('const clearKey = useCallback')[1]?.split('}, [])')[0] ?? '';
    // clearKey drops every decrypted thing through one helper (shared with a re-encryption)
    expect(clearKey).toContain('dropDecryptedState()');
    const drop = ctx.split('function dropDecryptedState(): void {')[1]?.split('\n}\n')[0] ?? '';
    expect(drop).toContain('clearEntryTitleCache()');
  });
});

import { entryTitleText as titleOf } from '@/utils/entryTitle';
import { it as it2, expect as expect2 } from 'vitest';

it2('a long entry is titled by its first paragraph, never its paragraphs run together', () => {
  expect2(titleOf('<p>Slow morning by the river</p><p>Walked the long way round.</p>')).toBe('Slow morning by the river');
  expect2(titleOf('<p></p><p>Second line first</p>')).toBe('Second line first');
  expect2(titleOf('<p>One line<br>then another</p>')).toBe('One line');
  expect2(titleOf('<h2>A heading</h2><p>text</p>')).toBe('A heading');
});
