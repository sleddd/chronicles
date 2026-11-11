import { describe, it, expect } from 'vitest';
import {
  isAllowedCoverUrl, rankWikipedia, wikipediaGuesses, tvmazeSearchUrl, parseTvmaze, genreFromSubjects, detailsFromDescription, openLibrarySearchUrl, openLibraryCoverUrl, itunesSearchUrl, itunesArtworkUrl,
  wikipediaSearchUrl, wikipediaSummaryUrl, parseOpenLibrary, parseItunes, parseWikipediaSearch, parseWikipediaSummary,
} from '@/services/coverLookup';

describe('cover sources are a fixed list', () => {
  it('allows only the catalogues and their image hosts, over https', () => {
    for (const ok of [
      'https://openlibrary.org/search.json?title=dune',
      'https://covers.openlibrary.org/b/id/1-L.jpg',
      'https://archive.org/download/x.jpg',
      'https://ia600703.us.archive.org/view_archive.php?x=1',
      'https://itunes.apple.com/search?term=blue',
      'https://api.tvmaze.com/search/shows?q=severance',
      'https://static.tvmaze.com/uploads/images/original_untouched/548/1371406.jpg',
      'https://is1-ssl.mzstatic.com/image/thumb/a/600x600bb.jpg',
      'https://en.wikipedia.org/api/rest_v1/page/summary/Inception',
      'https://upload.wikimedia.org/wikipedia/en/2/2e/poster.jpg',
    ]) expect(isAllowedCoverUrl(ok), ok).toBe(true);
    for (const bad of [
      'http://covers.openlibrary.org/b/id/1-L.jpg',
      'https://evil.example/archive.org/x.jpg',
      'https://archive.org.evil.example/x.jpg',
      'https://mzstatic.com.evil.example/x.jpg',
      'https://de.wikipedia.org/wiki/x',
      'javascript:alert(1)',
      'not a url',
    ]) expect(isAllowedCoverUrl(bad), bad).toBe(false);
  });

  it('builds search addresses on those hosts only', () => {
    for (const u of [
      openLibrarySearchUrl('Dune', 'Herbert'), openLibraryCoverUrl(5), itunesSearchUrl('Blue', 'Joni Mitchell'),
      wikipediaSearchUrl('Inception', 'movie', '2010'), wikipediaSummaryUrl('Breaking Bad'), tvmazeSearchUrl('Severance'),
    ]) expect(isAllowedCoverUrl(u), u).toBe(true);
    expect(openLibrarySearchUrl('Dune', 'Herbert')).toContain('author=Herbert');
    expect(openLibrarySearchUrl('Dune', '')).not.toContain('author=');
    expect(wikipediaSearchUrl('Severance', 'tv', '')).toContain('srsearch=intitle%3A%22Severance%22+TV+series');
    expect(wikipediaSearchUrl('Inception', 'movie', '2010')).toContain('srsearch=intitle%3A%22Inception%22+2010+film');
    expect(wikipediaSummaryUrl('Breaking Bad')).toBe('https://en.wikipedia.org/api/rest_v1/page/summary/Breaking_Bad');
  });

  it('asks for Apple artwork at a usable size', () => {
    expect(itunesArtworkUrl('https://is1-ssl.mzstatic.com/image/thumb/a/b.jpg/100x100bb.jpg')).toBe('https://is1-ssl.mzstatic.com/image/thumb/a/b.jpg/600x600bb.jpg');
  });
});

describe('answers', () => {
  it('reads Open Library docs with a cover', () => {
    const out = parseOpenLibrary({ docs: [
      { title: 'Dune', author_name: ['Frank Herbert'], cover_i: 8406786, first_publish_year: 1965 },
      { title: 'No cover', author_name: ['X'] },
    ] });
    expect(out).toEqual([{ title: 'Dune', detail: 'Frank Herbert · 1965', imageUrl: 'https://covers.openlibrary.org/b/id/8406786-L.jpg', source: 'openlibrary', details: { creator: 'Frank Herbert', year: '1965' } }]);
    expect(parseOpenLibrary(null)).toEqual([]);
  });

  it('reads iTunes results, once per artwork', () => {
    const art = 'https://is1-ssl.mzstatic.com/image/thumb/x/100x100bb.jpg';
    const out = parseItunes({ results: [
      { wrapperType: 'collection', collectionName: 'Blue', artistName: 'Joni Mitchell', artworkUrl100: art, releaseDate: '1971-06-22T07:00:00Z' },
      { wrapperType: 'track', trackName: 'River', collectionName: 'Blue', artistName: 'Joni Mitchell', artworkUrl100: art, releaseDate: '1971-06-22T07:00:00Z' },
      { wrapperType: 'track', trackName: 'Nothing', artistName: 'X' },
    ] });
    expect(out).toEqual([{ title: 'Blue', detail: 'Joni Mitchell · 1971 · Album', imageUrl: 'https://is1-ssl.mzstatic.com/image/thumb/x/600x600bb.jpg', source: 'itunes', details: { creator: 'Joni Mitchell', year: '1971' } }]);
  });

  it('reads TVmaze shows with a poster', () => {
    const out = parseTvmaze([
      { show: { name: 'Severance', premiered: '2022-02-18', webChannel: { name: 'Apple TV' }, genres: ['Drama', 'Science-Fiction', 'Mystery'], image: { medium: 'https://static.tvmaze.com/m.jpg', original: 'https://static.tvmaze.com/o.jpg' } } },
      { show: { name: 'No poster', image: null } },
    ]);
    expect(out).toEqual([{ title: 'Severance', detail: '2022 · Apple TV · Drama, Science-Fiction', imageUrl: 'https://static.tvmaze.com/o.jpg', source: 'tvmaze', details: { year: '2022', genre: 'Drama, Science-Fiction' } }]);
    expect(parseTvmaze({})).toEqual([]);
  });

  it('reads Wikipedia search hits and a summary with its poster', () => {
    expect(parseWikipediaSearch({ query: { search: [{ title: 'Inception' }, { title: 'Inception (disambiguation)' }, { title: 'Inception (soundtrack)' }] } }))
      .toEqual(['Inception', 'Inception (soundtrack)']);
    const c = parseWikipediaSummary({ title: 'Inception', description: '2010 film by Christopher Nolan',
      thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/en/2/2e/Inception.jpg?utm_source=x', width: 220 },
      originalimage: { source: 'https://upload.wikimedia.org/wikipedia/en/2/2e/Inception.jpg?utm_source=x', width: 220 } });
    expect(c).toEqual({ title: 'Inception', detail: '2010 film by Christopher Nolan', imageUrl: 'https://upload.wikimedia.org/wikipedia/en/2/2e/Inception.jpg', source: 'wikipedia', details: { year: '2010', creator: 'Christopher Nolan' } });
    // A huge original falls back to the thumbnail
    const big = parseWikipediaSummary({ title: 'X', thumbnail: { source: 'https://upload.wikimedia.org/t.jpg' }, originalimage: { source: 'https://upload.wikimedia.org/o.jpg', width: 4000 } });
    expect(big?.imageUrl).toBe('https://upload.wikimedia.org/t.jpg');
    expect(parseWikipediaSummary({ title: 'No image' })).toBeNull();
  });
});

describe('ranking Wikipedia pages', () => {
  const c = (title: string, detail: string) => ({ title, detail, imageUrl: 'https://upload.wikimedia.org/x.jpg', source: 'wikipedia' as const, details: {} });
  it('puts the show before a person who shares its name, and a film before its soundtrack', () => {
    const tv = rankWikipedia([c('Joan Severance', 'American model and actress'), c('Cold Harbor (Severance)', '10th episode of the 2nd season'), c('Severance (TV series)', '2022 American television series')], 'tv');
    expect(tv.map(x => x.title)).toEqual(['Severance (TV series)', 'Cold Harbor (Severance)', 'Joan Severance']);
    const film = rankWikipedia([c('Inception (soundtrack)', '2010 soundtrack album by Hans Zimmer'), c('Inception', '2010 film by Christopher Nolan')], 'movie');
    expect(film[0].title).toBe('Inception');
    // A season page describes "television series" too, but the series itself comes first
    const seasons = rankWikipedia([c('Breaking Bad season 5', 'Fifth season of the AMC crime drama television series'), c('Breaking Bad', 'American crime drama television series (2008–2013)')], 'tv');
    expect(seasons.map(x => x.title)).toEqual(['Breaking Bad', 'Breaking Bad season 5']);
  });

  it('tries the article names Wikipedia uses before searching', () => {
    expect(wikipediaGuesses('Severance', 'tv', '')).toEqual(['Severance (TV series)', 'Severance (American TV series)', 'Severance (British TV series)', 'Severance (miniseries)', 'Severance']);
    expect(wikipediaGuesses('Inception', 'movie', '2010')).toEqual(['Inception (film)', 'Inception (2010 film)', 'Inception']);
  });
});

describe('details from the catalogues', () => {
  it('picks a genre out of Open Library subjects', () => {
    expect(genreFromSubjects(['Fiction', 'Science fiction', 'Dune (Imaginary place)'])).toBe('Science fiction');
    expect(genreFromSubjects(['Dune (Imaginary place)', 'Fiction'])).toBe('Fiction');
    expect(genreFromSubjects(['Sandworms'])).toBe('');
    expect(genreFromSubjects(undefined)).toBe('');
  });

  it('reads the year, maker and genre out of a Wikipedia description', () => {
    expect(detailsFromDescription('2010 film by Christopher Nolan')).toEqual({ year: '2010', creator: 'Christopher Nolan' });
    expect(detailsFromDescription('2022 American science fiction psychological thriller television series created by Dan Erickson'))
      .toEqual({ year: '2022', creator: 'Dan Erickson', genre: 'Science fiction' });
    expect(detailsFromDescription('American model and actress')).toEqual({});
  });

  it('a song carries its album, an album does not', () => {
    const art = 'https://is1-ssl.mzstatic.com/image/thumb/x/100x100bb.jpg';
    const [song] = parseItunes({ results: [{ wrapperType: 'track', trackName: 'River', collectionName: 'Blue', artistName: 'Joni Mitchell', artworkUrl100: art, releaseDate: '1971-06-22T07:00:00Z', primaryGenreName: 'Singer/Songwriter' }] });
    expect(song.details).toEqual({ creator: 'Joni Mitchell', year: '1971', genre: 'Singer/Songwriter', album: 'Blue' });
  });
});
