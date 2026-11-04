import { describe, it, expect, vi } from 'vitest';
import { winsContent, winsOf, winsTitle, winsTitleOf } from '../../utils/wins.js';

vi.mock('../../services/aiAssistant.js', () => ({ autoCaloriesOnSave: async () => null }));
import { prepareEntryForSave } from '../../utils/entrySave.js';

describe('wins', () => {
  it('titles a day and writes the wins as a list, escaped', () => {
    expect(winsTitle(new Date(2026, 10, 4))).toBe('Wins: 11/04/2026');
    expect(winsContent('Wins: 11/04/2026', [{ id: 'a', text: 'Ran 5k' }, { id: 'b', text: 'Fixed <bug>' }, { id: 'c', text: ' ' }]))
      .toBe('<p>Wins: 11/04/2026</p><ul><li><p>Ran 5k</p></li><li><p>Fixed &lt;bug&gt;</p></li></ul>');
    expect(winsContent('Wins: 11/04/2026', [])).toBe('<p>Wins: 11/04/2026</p>');
  });

  it('keeps an entry’s own title and reads only well-formed wins', () => {
    expect(winsTitleOf('<p>Wins: 10/30/2026</p><ul></ul>')).toBe('Wins: 10/30/2026');
    expect(winsOf({ wins: [{ id: 'a', text: 'x' }, { text: 'no id' }, null] })).toEqual([{ id: 'a', text: 'x' }]);
    expect(winsOf(undefined)).toEqual([]);
  });

  it('a journal save rewrites the text from the wins, keeping the day', async () => {
    const out = await prepareEntryForSave('<p>Wins: 10/30/2026</p>', { wins: [{ id: 'a', text: 'Shipped it' }] }, 'wins', []);
    expect(out.content).toBe('<p>Wins: 10/30/2026</p><ul><li><p>Shipped it</p></li></ul>');
  });
});
