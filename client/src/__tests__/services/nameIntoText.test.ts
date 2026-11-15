import { beforeEach, describe, expect, it, vi } from 'vitest';

const reseal = vi.fn();
const upsert = vi.fn();
const updateDecryptedEntry = vi.fn();
vi.mock('@/services/api', () => ({
  entries: { reseal: (...a: unknown[]) => reseal(...a) },
  settings: { upsert: (...a: unknown[]) => upsert(...a) },
}));
vi.mock('@/stores/entriesStore', () => ({
  useEntriesStore: { getState: () => ({ updateDecryptedEntry }) },
}));

import { moveNamesIntoText, nameToMove, NAME_IN_TEXT_MARKER } from '@/services/nameIntoText';

const topics = [{ id: 1, name: 'Task' }, { id: 2, name: 'Journal' }, { id: 3, name: 'Podcasts' }, { id: 4, name: 'Books' }];
const fields = { 3: [{ id: 't', label: 'Title', type: 'text' as const }], 4: [{ id: 'b', label: 'Title', type: 'text' as const }] };
const entry = (id: number, topic: number, content: string, cf: Record<string, unknown>) => ({
  id, content, isEncrypted: true, createdAt: new Date(), updatedAt: new Date('2026-11-01T00:00:00Z'),
  metadata: { _taxonomyId: topic, _customFields: cf },
});

describe('nameToMove', () => {
  it('finds a name that isn’t the text’s first line', () => {
    expect(nameToMove(entry(1, 1, '', { taskDescription: 'Call the vet' }), topics, fields)).toBe('Call the vet');
    expect(nameToMove(entry(1, 1, '<p>Notes</p>', { taskDescription: 'Call the vet' }), topics, fields)).toBe('Call the vet');
  });
  it('leaves entries already in order, ones with no name, and other topics', () => {
    expect(nameToMove(entry(1, 1, '<p>Call the vet</p><p>more</p>', { taskDescription: 'Call the vet' }), topics, fields)).toBeNull();
    expect(nameToMove(entry(1, 1, '<p>Hi</p>', {}), topics, fields)).toBeNull();
    expect(nameToMove(entry(1, 2, '', { taskDescription: 'x' }), topics, fields)).toBeNull();
  });
  it('own topics: a leading Title field moves; Books keeps its title as a field', () => {
    expect(nameToMove(entry(1, 3, '', { _userFields: { t: 'Serial' } }), topics, fields)).toBe('Serial');
    expect(nameToMove(entry(1, 4, '', { _userFields: { b: 'Piranesi' } }), topics, fields)).toBeNull();
  });
});

describe('moveNamesIntoText', () => {
  beforeEach(() => { reseal.mockReset(); upsert.mockReset(); updateDecryptedEntry.mockReset(); });
  const encrypt = vi.fn(async (_id: number, content: string) => ({ contentEncrypted: content, contentIv: 'iv', metadataEncrypted: 'm', metadataIv: 'iv' }));

  it('puts the name in front, keeps updated_at, updates the store and writes the marker', async () => {
    reseal.mockResolvedValue({ resealed: 1 });
    const n = await moveNamesIntoText([entry(7, 1, '<p>Bring the leash</p>', { taskDescription: 'Call the vet' }), entry(8, 2, '<p>Hi</p>', {})], topics, fields, encrypt);
    expect(n).toBe(1);
    expect(reseal).toHaveBeenCalledWith([expect.objectContaining({ id: 7, updatedAt: '2026-11-01T00:00:00.000Z', contentEncrypted: '<p>Call the vet</p><p>Bring the leash</p>' })]);
    expect(updateDecryptedEntry).toHaveBeenCalledWith(7, { content: '<p>Call the vet</p><p>Bring the leash</p>' });
    expect(upsert).toHaveBeenCalledWith(NAME_IN_TEXT_MARKER, true);
  });

  it('leaves the marker unwritten when the server skipped one (edited since loading)', async () => {
    reseal.mockResolvedValue({ resealed: 0 });
    await moveNamesIntoText([entry(7, 1, '', { taskDescription: 'Call the vet' })], topics, fields, encrypt);
    expect(upsert).not.toHaveBeenCalled();
    expect(updateDecryptedEntry).not.toHaveBeenCalled();
  });

  it('with nothing to move, just writes the marker', async () => {
    await moveNamesIntoText([entry(8, 2, '<p>Hi</p>', {})], topics, fields, encrypt);
    expect(reseal).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledWith(NAME_IN_TEXT_MARKER, true);
  });
});
