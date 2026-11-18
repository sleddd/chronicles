import { describe, it, expect } from 'vitest';
import { retagMedia, retaggedTags } from '../../utils/retagMedia.js';

type E = { id: number; metadata: { _taxonomyId: number; _customFields: Record<string, unknown> } };
const entry = (id: number, tags: string[], topic = 9): E => ({ id, metadata: { _taxonomyId: topic, _customFields: { title: `t${id}`, tags } } });

function store(list: E[], failing: (id: number, call: number) => boolean = () => false) {
  const calls: Record<number, number> = {};
  const save = async (e: E, fields: Record<string, unknown>) => {
    calls[e.id] = (calls[e.id] ?? 0) + 1;
    if (failing(e.id, calls[e.id])) return false;
    const i = list.findIndex(x => x.id === e.id);
    list[i] = { ...e, metadata: { ...e.metadata, _customFields: fields } };
    return true;
  };
  const tagsOf = (id: number) => list.find(e => e.id === id)!.metadata._customFields.tags;
  return { save, tagsOf, calls, deps: { entries: () => list, mediaTopicIds: [9], save, wait: async () => {} } };
}

describe('retaggedTags', () => {
  it('renames or removes, case ignored, and says null when the tag is absent', () => {
    expect(retaggedTags(['Book Club', 'cosy'], 'book club', 'Club')).toEqual(['Club', 'cosy']);
    expect(retaggedTags(['Book Club', 'cosy'], 'BOOK CLUB', null)).toEqual(['cosy']);
    expect(retaggedTags(['cosy'], 'book club', 'x')).toBeNull();
  });
});

describe('retagMedia', () => {
  it('renames on every media item but the open one, and leaves other topics alone', async () => {
    const list = [entry(1, ['a']), entry(2, ['a', 'b']), entry(3, ['a']), entry(4, ['a'], 5)];
    const s = store(list);
    expect(await retagMedia('a', 'z', { ...s.deps, skipId: 3 })).toBe('done');
    expect([s.tagsOf(1), s.tagsOf(2), s.tagsOf(3), s.tagsOf(4)]).toEqual([['z'], ['z', 'b'], ['a'], ['a']]);
  });

  it('tries a failed save again before giving up', async () => {
    const list = [entry(1, ['a']), entry(2, ['a'])];
    const s = store(list, (id, call) => id === 2 && call < 3);
    expect(await retagMedia('a', null, s.deps)).toBe('done');
    expect([s.tagsOf(1), s.tagsOf(2)]).toEqual([[], []]);
  });

  it('puts the changed items back when one keeps failing', async () => {
    const list = [entry(1, ['a']), entry(2, ['a', 'b']), entry(3, ['a'])];
    const s = store(list, id => id === 3);
    expect(await retagMedia('a', 'z', s.deps)).toBe('rolled-back');
    expect([s.tagsOf(1), s.tagsOf(2), s.tagsOf(3)]).toEqual([['a'], ['a', 'b'], ['a']]);
  });

  it('says partial when putting one back fails too', async () => {
    const list = [entry(1, ['a']), entry(2, ['a'])];
    const s = store(list, (id, call) => (id === 2) || (id === 1 && call > 1));
    expect(await retagMedia('a', 'z', s.deps)).toBe('partial');
  });

  it('keeps other fields written since the plan was made', async () => {
    const list = [entry(1, ['a']), entry(2, ['a'])];
    const s = store(list);
    const save = async (e: E, f: Record<string, unknown>) => {
      if (e.id === 1) list[1] = { ...list[1], metadata: { ...list[1].metadata, _customFields: { ...list[1].metadata._customFields, rating: 5 } } };
      return s.save(e, f);
    };
    await retagMedia('a', 'z', { ...s.deps, save });
    expect(list[1].metadata._customFields).toMatchObject({ rating: 5, tags: ['z'] });
  });
});
