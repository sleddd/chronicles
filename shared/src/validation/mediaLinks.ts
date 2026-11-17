/*
 * The sites a media item's Link may point to — the major book, film / TV and
 * music sites only. The form opens nothing else and the public shelf
 * publishes nothing else (checked in the browser and again by the server), so
 * a shelf can't carry a visitor off to an arbitrary page. A host matches its
 * domain or any subdomain of it (www., music.apple.com, artist.bandcamp.com).
 */

export const MEDIA_LINK_SITES: readonly { domain: string; name: string }[] = [
  // Books
  { domain: 'goodreads.com', name: 'Goodreads' },
  { domain: 'thestorygraph.com', name: 'StoryGraph' },
  { domain: 'barnesandnoble.com', name: 'Barnes & Noble' },
  { domain: 'bookshop.org', name: 'Bookshop.org' },
  { domain: 'audible.com', name: 'Audible' },
  { domain: 'librarything.com', name: 'LibraryThing' },
  { domain: 'openlibrary.org', name: 'Open Library' },
  { domain: 'books.google.com', name: 'Google Books' },
  { domain: 'kobo.com', name: 'Kobo' },
  // Amazon, by country
  { domain: 'amazon.com', name: 'Amazon' },
  { domain: 'amazon.ca', name: 'Amazon' },
  { domain: 'amazon.co.uk', name: 'Amazon' },
  { domain: 'amazon.com.au', name: 'Amazon' },
  { domain: 'amazon.de', name: 'Amazon' },
  { domain: 'amazon.fr', name: 'Amazon' },
  { domain: 'amazon.es', name: 'Amazon' },
  { domain: 'amazon.it', name: 'Amazon' },
  { domain: 'amazon.co.jp', name: 'Amazon' },
  { domain: 'amazon.in', name: 'Amazon' },
  { domain: 'amazon.com.mx', name: 'Amazon' },
  { domain: 'primevideo.com', name: 'Prime Video' },
  // Film and TV
  { domain: 'imdb.com', name: 'IMDb' },
  { domain: 'rottentomatoes.com', name: 'Rotten Tomatoes' },
  { domain: 'letterboxd.com', name: 'Letterboxd' },
  { domain: 'metacritic.com', name: 'Metacritic' },
  { domain: 'themoviedb.org', name: 'TMDB' },
  { domain: 'tvmaze.com', name: 'TVmaze' },
  { domain: 'justwatch.com', name: 'JustWatch' },
  { domain: 'netflix.com', name: 'Netflix' },
  { domain: 'hulu.com', name: 'Hulu' },
  { domain: 'disneyplus.com', name: 'Disney+' },
  { domain: 'max.com', name: 'Max' },
  // Apple (Music, TV, Books, Podcasts)
  { domain: 'apple.com', name: 'Apple' },
  // Music
  { domain: 'spotify.com', name: 'Spotify' },
  { domain: 'youtube.com', name: 'YouTube' },
  { domain: 'bandcamp.com', name: 'Bandcamp' },
  { domain: 'soundcloud.com', name: 'SoundCloud' },
  { domain: 'tidal.com', name: 'Tidal' },
  { domain: 'deezer.com', name: 'Deezer' },
  { domain: 'pandora.com', name: 'Pandora' },
  { domain: 'discogs.com', name: 'Discogs' },
  { domain: 'allmusic.com', name: 'AllMusic' },
  { domain: 'last.fm', name: 'Last.fm' },
];

/** The site a host belongs to, or null when it isn't one of the allowed ones */
export function mediaLinkSite(hostname: string): { domain: string; name: string } | null {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return MEDIA_LINK_SITES.find(s => host === s.domain || host.endsWith(`.${s.domain}`)) ?? null;
}

/** A typed link as an https address on one of the allowed sites, else null —
    "goodreads.com/…" gets https://; http is upgraded; no logins in the
    address, no other ports, never javascript:, data: or any other site */
export function allowedMediaLink(raw: string | undefined | null): string | null {
  const t = (raw ?? '').trim();
  if (!t || t.length > 500 || /[\s\x00-\x1f\x7f]/.test(t)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
  let u: URL;
  try { u = new URL(withScheme); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password || u.port) return null;
  if (!mediaLinkSite(u.hostname)) return null;
  u.protocol = 'https:';
  return u.href;
}
