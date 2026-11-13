import { describe, it, expect } from 'vitest';
import { validEntryRows } from '../../utils/entryRows.js';

describe('validEntryRows', () => {
  it('keeps rows with a positive integer id, each once', () => {
    const rows = [{ id: 7 }, { id: '7' }, { id: 7 }, { id: 0 }, { id: -1 }, { id: 1.5 }, { id: null }, {}, { id: 8 }];
    expect(validEntryRows(rows)).toEqual([{ id: 7 }, { id: 8 }]);
  });
});
