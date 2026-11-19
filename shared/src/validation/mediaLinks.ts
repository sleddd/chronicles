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

/** First path segments that are a site's "leave this site" endpoint — /redirect,
    /url, /out, /away, /exit, /link… (YouTube's /redirect?q=, Google's /url?q=,
    Amazon's /gp/redirect.html). A link to one could carry a visitor anywhere,
    so it is refused on every allowed site */
const REDIRECT_FIRST = /^(redirect|redir|url|out|outbound|away|exit|link|go|goto|leave|external|click|r)(\.[a-z]+)?$/i;
/** …and anywhere in the path, the unmistakable ones (/gp/redirect.html) — a
    film called "Out" or "Link" lower down a path stays a film page */
const REDIRECT_ANY = /^(redirect|redir|redirector|outbound)(\.[a-z]+)?$/i;

/** True when the address has a redirect endpoint in its path, or any query
    value (or fragment) that is itself an absolute http(s) address — plain or
    URL-encoded, once or twice */
function looksLikeRedirect(u: URL): boolean {
  const segs = u.pathname.split('/').filter(Boolean).map(seg => { try { return decodeURIComponent(seg); } catch { return seg; } });
  if (segs.length && REDIRECT_FIRST.test(segs[0])) return true;
  if (segs.some(seg => REDIRECT_ANY.test(seg))) return true;
  const absolute = (v: string) => {
    let x = v;
    for (let i = 0; i < 3; i++) {
      if (/^\s*(https?:)?[/\\]{2}/i.test(x) || /(^|[^a-z])https?:[/\\]{2}/i.test(x) || /https?%3a/i.test(x)) return true;
      try { const next = decodeURIComponent(x); if (next === x) break; x = next; } catch { break; }
    }
    return false;
  };
  for (const [, value] of u.searchParams) if (absolute(value)) return true;
  return absolute(u.hash.slice(1));
}

/** A typed link as an https address on one of the allowed sites, else null —
    "goodreads.com/…" gets https://; http is upgraded; no logins in the
    address, no other ports, never javascript:, data: or any other site, and
    never a redirect endpoint or an address carried in its query */
export function allowedMediaLink(raw: string | undefined | null): string | null {
  const t = (raw ?? '').trim();
  if (!t || t.length > 500 || /[\s\x00-\x1f\x7f]/.test(t)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
  let u: URL;
  try { u = new URL(withScheme); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password || u.port) return null;
  if (!mediaLinkSite(u.hostname)) return null;
  if (looksLikeRedirect(u)) return null;
  u.protocol = 'https:';
  return u.href;
}
