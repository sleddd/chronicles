import { describe, it, expect } from 'vitest';
import { gridFrom, dropOnCard, dropOnGap, flattenGrid } from '@/utils/dashboardGrid';

const shape = (rows: ReturnType<typeof gridFrom>) => rows.map(r => r.map(c => `${c.w}:${c.keys.join('+')}`).join(' | '));

describe('dashboard zones in thirds', () => {
  it('with nothing saved, cards pair up as before; new cards go in as full-width rows', () => {
    expect(shape(gridFrom(undefined, ['wellness', 'shortcuts', 'quote']))).toEqual(['2:wellness | 1:shortcuts', '3:quote']);
    const saved = [[{ w: 3, keys: ['clocks'] }]];
    expect(shape(gridFrom(saved, ['clocks', 'wellness']))).toEqual(['3:clocks', '3:wellness']);
  });

  it('two thirds-wide cards stacked beside the wellness check-in', () => {
    let rows = gridFrom(undefined, ['wellness', 'shortcuts', 'quote', 'menu']);
    rows = dropOnCard(rows, 'quote', 'shortcuts', 'below');
    expect(shape(rows)).toEqual(['2:wellness | 1:shortcuts+quote', '3:menu']);
  });

  it('a card dropped on the strip above everything: a full-width row at the top', () => {
    let rows = gridFrom(undefined, ['wellness', 'shortcuts']);
    rows = dropOnGap(rows, 'shortcuts', 0);
    expect(shape(rows)).toEqual(['3:shortcuts', '3:wellness']);
  });

  it('beside a full-width card: two thirds / one third (wellness always the wide one)', () => {
    let rows = gridFrom([[{ w: 3, keys: ['wellness'] }], [{ w: 3, keys: ['shortcuts'] }]], ['wellness', 'shortcuts']);
    rows = dropOnCard(rows, 'shortcuts', 'wellness', 'after');
    expect(shape(rows)).toEqual(['2:wellness | 1:shortcuts']);
    rows = gridFrom([[{ w: 3, keys: ['quote'] }], [{ w: 3, keys: ['wellness'] }]], ['quote', 'wellness']);
    expect(shape(dropOnCard(rows, 'wellness', 'quote', 'before'))).toEqual(['2:wellness | 1:quote']);
  });

  it('a third column makes three thirds; a full row of three stacks instead', () => {
    let rows = gridFrom(undefined, ['wellness', 'shortcuts', 'quote', 'menu']);
    rows = dropOnCard(rows, 'quote', 'shortcuts', 'after');
    expect(shape(rows)).toEqual(['1:wellness | 1:shortcuts | 1:quote', '3:menu']);
    rows = dropOnCard(rows, 'menu', 'quote', 'after');
    expect(shape(rows)).toEqual(['1:wellness | 1:shortcuts | 1:quote+menu']);
  });

  it('above / below a full-width card: a full-width row of its own; the one it left goes full width', () => {
    let rows = gridFrom(undefined, ['wellness', 'shortcuts', 'quote']);
    rows = dropOnCard(rows, 'shortcuts', 'quote', 'below');
    expect(shape(rows)).toEqual(['3:wellness', '3:quote', '3:shortcuts']);
    expect(flattenGrid(rows)).toEqual(['wellness', 'quote', 'shortcuts']);
  });
});

import { topRowSpans, rowsOf } from '@/utils/dashboardRows';
describe('dashboard rows helpers', () => {
  it('rows hold up to three thirds', () => {
    expect(rowsOf(['a', 'b', 'c'], new Map([['a', 2], ['b', 1], ['c', 3]]))).toEqual([['a', 'b'], ['c']]);
    expect([...topRowSpans(['wellness', 'shortcuts'])]).toEqual([['wellness', 2], ['shortcuts', 1]]);
  });
});
