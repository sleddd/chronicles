import { describe, expect, it } from 'vitest';
import { contentWithName, nameFromContent, NAME_MAX } from '@/utils/nameFields';

describe('nameFromContent', () => {
  it('reads the first line that has text', () => {
    expect(nameFromContent('<p>Call the vet</p><p>Ask about the booster</p>')).toBe('Call the vet');
    expect(nameFromContent('<p></p><h2>Dentist</h2>')).toBe('Dentist');
    expect(nameFromContent('<ul><li>Milk</li><li>Eggs</li></ul>')).toBe('Milk');
    expect(nameFromContent('Plain words')).toBe('Plain words');
    expect(nameFromContent('')).toBe('');
  });
  it('keeps a long first line to the name limit', () => {
    expect(nameFromContent(`<p>${'a'.repeat(300)}</p>`)).toHaveLength(NAME_MAX);
  });
});

describe('contentWithName', () => {
  it('leaves text that already starts with the name', () => {
    expect(contentWithName('<p>Oatmeal</p><p>With berries</p>', 'Oatmeal')).toBe('<p>Oatmeal</p><p>With berries</p>');
  });
  it('puts the name in front of other writing, keeping it', () => {
    expect(contentWithName('<p>At the cafe</p>', 'Oatmeal')).toBe('<p>Oatmeal</p><p>At the cafe</p>');
  });
  it('makes the name the whole text when there is none', () => {
    expect(contentWithName('', 'Tea & toast')).toBe('<p>Tea &amp; toast</p>');
  });
  it('changes nothing for an empty name', () => {
    expect(contentWithName('<p>Hi</p>', '  ')).toBe('<p>Hi</p>');
  });
});
