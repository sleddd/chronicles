import { describe, it, expect } from 'vitest';
import { gridFrom, dropOnCard, dropOnGap, flattenGrid, setWidth } from '@/utils/dashboardGrid';

const shape = (rows: ReturnType<typeof gridFrom>) => rows.map(r => r.map(c => `${c.w}:${c.keys.join('+')}`).join(' | '));

describe('dashboard zones in thirds', () => {
  it('the old two columns come in three across, a third each', () => {
    expect(shape(gridFrom(undefined, ['quote', 'a', 'b', 'c', 'd'], ['a', 'b', 'c', 'd']))).toEqual(['3:quote', '1:a | 1:b | 1:c', '3:d']);
    // A saved grid keeps its rows; column cards it doesn't hold go in three across under them
    expect(shape(gridFrom([[{ w: 3, keys: ['quote'] }]], ['quote', 'a', 'b'], ['a', 'b']))).toEqual(['3:quote', '2:a | 1:b']);
  });

  it('a column dragged to a third, two thirds or full width', () => {
    const rows = gridFrom([[{ w: 3, keys: ['a'] }], [{ w: 1, keys: ['b'] }, { w: 1, keys: ['c'] }, { w: 1, keys: ['d'] }]], ['a', 'b', 'c', 'd']);
    // Alone: it keeps the narrower width, leaving room beside it
    expect(shape(setWidth(rows, 'a', 1))).toEqual(['1:a', '1:b | 1:c | 1:d']);
    // Wider in a full row: the others narrow, and the last that can't moves under it
    expect(shape(setWidth(rows, 'b', 2))).toEqual(['3:a', '2:b | 1:c', '1:d']);
    // Full: a row of its own under its row
    expect(shape(setWidth(rows, 'c', 3))).toEqual(['3:a', '1:b | 1:d', '3:c']);
    // An older stacked column is unstacked into rows first
    const stacked = gridFrom([[{ w: 1, keys: ['x', 'y'] }, { w: 2, keys: ['z'] }]], ['x', 'y', 'z']);
    expect(shape(stacked)).toEqual(['1:x | 2:z', '3:y']);
  });

  it('dropped on a card’s top or bottom edge: a full-width row of its own', () => {
    const rows: ReturnType<typeof gridFrom> = [[{ w: 1, keys: ['a'] }, { w: 1, keys: ['b'] }, { w: 1, keys: ['c'] }]];
    expect(shape(dropOnCard(rows, 'b', 'a', 'rowAbove'))).toEqual(['3:b', '2:a | 1:c']);
    expect(shape(dropOnCard(rows, 'c', 'b', 'rowBelow'))).toEqual(['2:a | 1:b', '3:c']);
  });

  it('with nothing saved, cards pair up as before; new cards go in as full-width rows', () => {
    expect(shape(gridFrom(undefined, ['wellness', 'shortcuts', 'quote']))).toEqual(['2:wellness | 1:shortcuts', '3:quote']);
    const saved = [[{ w: 3, keys: ['clocks'] }]];
    expect(shape(gridFrom(saved, ['clocks', 'wellness']))).toEqual(['3:clocks', '3:wellness']);
  });

  it('every row is its own: two thirds / one third over three across', () => {
    let rows = gridFrom(undefined, ['wellness', 'shortcuts', 'quote', 'menu', 'recent']);
    // Below a card in a shared row: a row of its own under that row
    rows = dropOnCard(rows, 'quote', 'shortcuts', 'below');
    expect(shape(rows)).toEqual(['2:wellness | 1:shortcuts', '3:quote', '3:menu', '3:recent']);
    rows = dropOnCard(rows, 'menu', 'quote', 'after');
    rows = dropOnCard(rows, 'recent', 'menu', 'after');
    expect(shape(rows)).toEqual(['2:wellness | 1:shortcuts', '1:quote | 1:menu | 1:recent']);
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

  it('a third card makes three thirds; a fourth sends the row’s last card to a row under it', () => {
    let rows = gridFrom(undefined, ['wellness', 'shortcuts', 'quote', 'menu']);
    rows = dropOnCard(rows, 'quote', 'shortcuts', 'after');
    expect(shape(rows)).toEqual(['1:wellness | 1:shortcuts | 1:quote', '3:menu']);
    rows = dropOnCard(rows, 'menu', 'wellness', 'after');
    expect(shape(rows)).toEqual(['1:wellness | 1:menu | 1:shortcuts', '3:quote']);
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
