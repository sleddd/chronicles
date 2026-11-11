import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MEDIA_DEFAULTS, type MediaFieldValues } from '@/utils/media';

const chatReply = vi.fn();
vi.mock('@/services/aiAssistant', () => ({ chatReply: (...a: unknown[]) => chatReply(...a) }));

const { applyLookupDetails, blankDetailKeys, detailKeysFor, parseDetailsJson, aiMediaDetails } = await import('@/services/mediaDetails');

const book = (over: Partial<MediaFieldValues> = {}): MediaFieldValues => ({ ...MEDIA_DEFAULTS, mediaType: 'book', mediaTitle: 'Dune', ...over });

describe('detail fields by type', () => {
  it('asks only for what the form shows', () => {
    expect(detailKeysFor('book')).toEqual(['creator', 'year', 'genre']);
    expect(detailKeysFor('music')).toEqual(['creator', 'album', 'year', 'genre']);
    expect(detailKeysFor('tv')).toEqual(['creator', 'season', 'year', 'genre']);
    expect(blankDetailKeys(book({ creator: 'Frank Herbert' }))).toEqual(['year', 'genre']);
  });
});

describe('applying lookup details', () => {
  it('fills blanks and never a typed value', () => {
    const { patch, filled } = applyLookupDetails(book({ creator: 'Frank Herbert' }), { creator: 'F. Herbert', year: '1965', genre: 'Science fiction', album: 'ignored' }, []);
    expect(patch).toEqual({ year: '1965', genre: 'Science fiction' });
    expect(filled.sort()).toEqual(['genre', 'year']);
  });

  it('replaces what an earlier lookup filled when another cover is picked', () => {
    const { patch, filled } = applyLookupDetails(book({ creator: 'Frank Herbert', year: '1965' }), { creator: 'Someone Else', year: '1984' }, ['year']);
    expect(patch).toEqual({ year: '1984' });
    expect(filled).toEqual(['year']);
  });
});

describe('the model answer', () => {
  it('reads the JSON object out of a reply, dropping unknowns and bad years', () => {
    expect(parseDetailsJson('Sure: {"creator":"Frank Herbert","year":1965,"genre":"Science fiction","extra":"x"}'))
      .toEqual({ creator: 'Frank Herbert', year: '1965', genre: 'Science fiction' });
    expect(parseDetailsJson('{"creator":"unknown","year":"around 1960s"}')).toEqual({});
    expect(parseDetailsJson('{"year":"released in 1971"}')).toEqual({ year: '1971' });
    expect(parseDetailsJson('no json here')).toEqual({});
  });
});

describe('aiMediaDetails', () => {
  beforeEach(() => chatReply.mockReset());

  it('asks for the blank keys only and keeps only those from the answer', async () => {
    chatReply.mockResolvedValue('{"creator":"Frank Herbert","year":"1965","genre":"Science fiction"}');
    const out = await aiMediaDetails(book({ creator: 'Frank Herbert' }));
    expect(out).toEqual({ year: '1965', genre: 'Science fiction' });
    const [system, turns] = chatReply.mock.calls[0] as [string, { role: string; content: string }[]];
    expect(system).toMatch(/JSON/);
    expect(turns[0].content).toContain('Title: Dune');
    expect(turns[0].content).toContain('Known: creator: Frank Herbert');
    expect(turns[0].content).not.toMatch(/Wanted keys:.*creator/);
  });

  it('does nothing without a title or with nothing blank', async () => {
    expect(await aiMediaDetails(book({ mediaTitle: '' }))).toEqual({});
    expect(await aiMediaDetails(book({ creator: 'a', year: '1', genre: 'g' }))).toEqual({});
    expect(chatReply).not.toHaveBeenCalled();
  });
});
