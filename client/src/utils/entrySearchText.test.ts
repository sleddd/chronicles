import { describe, it, expect, vi } from 'vitest';
import type { DecryptedPost } from '@shared/crypto/types';
import { entrySearchText } from './entrySearchText.js';

const entry = (content: string, metadata: Record<string, unknown>): DecryptedPost =>
  ({ id: 1, content, metadata, isEncrypted: true, createdAt: new Date(), updatedAt: new Date() } as DecryptedPost);

describe('entrySearchText', () => {
  it('holds the text and the fields, lower-cased', () => {
    const text = entrySearchText(entry('<p>Dentist</p>', { _customFields: { venue: 'Main Street' } }));
    expect(text).toContain('dentist');
    expect(text).toContain('main street');
  });

  it('is worked out once per entry object, again for a saved copy', () => {
    const spy = vi.spyOn(JSON, 'stringify');
    const e = entry('one', { a: 1 });
    entrySearchText(e); entrySearchText(e); entrySearchText(e);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(entrySearchText({ ...e, content: 'two' })).toContain('two');
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});
