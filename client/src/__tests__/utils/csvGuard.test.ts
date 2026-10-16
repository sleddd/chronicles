import { describe, it, expect } from 'vitest';
import { csvCell, parseCsvRow } from '../../utils/csv.js';

describe('CSV formula guard', () => {
  it('prefixes cells a spreadsheet would run as formulas', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-2')).toBe("'-2");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('plain, text')).toBe('"plain, text"');
    expect(csvCell('hello')).toBe('hello');
  });

  it('round-trips through the importer unchanged', () => {
    const values = ['=1+1', '- a list item', '@mention', 'normal', "it's fine", 'a "quote", here'];
    expect(parseCsvRow(values.map(csvCell).join(','))).toEqual(values);
  });
});
