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

describe('CSV formula guard — evasions', () => {
  it('guards formulas behind leading whitespace and full-width signs', () => {
    expect(csvCell('  =1+1')).toBe("'  =1+1");
    expect(csvCell(' @SUM(A1)')).toBe("' @SUM(A1)");
    expect(csvCell('\t=1')).toBe("'\t=1");
    for (const v of ['＝1+1', '＋1', '－2', '＠SUM(A1)', ' ＝1']) expect(csvCell(v)).toBe(`'${v}`);
    expect(csvCell('a = b')).toBe('a = b');
  });

  it('round-trips the new cases, and values that already start with an apostrophe', () => {
    const values = ['  =1+1', '＝1', ' ＠x', "'=already", "''+1", "'plain", "it's"];
    expect(parseCsvRow(values.map(csvCell).join(','))).toEqual(values);
  });
});
