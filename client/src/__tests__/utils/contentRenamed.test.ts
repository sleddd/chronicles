import { describe, it, expect } from 'vitest';
import { contentRenamed } from '@/utils/nameFields';

describe('contentRenamed', () => {
  it('replaces the first line and keeps the rest of the writing', () => {
    expect(contentRenamed('<p>Old name</p><p>Notes stay</p>', 'New <name>', 'Old name')).toBe('<p>New &lt;name&gt;</p><p>Notes stay</p>');
    expect(contentRenamed('<h2>Old</h2><ul><li>a</li></ul>', 'New', 'Old')).toBe('<p>New</p><ul><li>a</li></ul>');
  });

  it('keeps a dollar amount in the new name as written', () => {
    expect(contentRenamed('<p>save money</p><p>rest</p>', 'Save $1,000 by June', 'save money')).toBe('<p>Save $1,000 by June</p><p>rest</p>');
    expect(contentRenamed('<p>old</p>', 'Pay $& and $`', 'old')).toBe('<p>Pay $&amp; and $`</p>');
  });

  it('puts the name in front when the first line is other writing, not the name', () => {
    expect(contentRenamed('<p>Some notes I wrote</p>', 'New', 'Old name')).toBe('<p>New</p><p>Some notes I wrote</p>');
  });

  it('puts the name in front when the content doesn’t open with a line of text', () => {
    expect(contentRenamed('<ul><li>a</li></ul>', 'New', 'a')).toBe('<p>New</p><ul><li>a</li></ul>');
    expect(contentRenamed('', 'New', '')).toBe('<p>New</p>');
  });

  it('leaves the content alone for an empty name', () => {
    expect(contentRenamed('<p>Old</p>', '  ', 'Old')).toBe('<p>Old</p>');
  });
});
