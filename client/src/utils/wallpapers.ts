/**
 * Wallpapers (Settings → Theme → Background): photos from Unsplash, served
 * from public/wallpapers — 2,400px wide, with 480 × 300 thumbnails for the
 * picker — and loaded only once chosen. The originals are kept outside the
 * app (src/assets/wallpaper, not committed). Each carries its credit:
 * "Photo by <name> on Unsplash", linking to the photo's page.
 */

export interface Wallpaper {
  id: string;
  /** The photographer, as Unsplash credits them */
  by: string;
  /** The photo's Unsplash page */
  url: string;
}

export const WALLPAPERS: Wallpaper[] = [
  { id: 'ales-krivec-UQSmR5hUwiQ', by: 'Ales Krivec', url: 'https://unsplash.com/photos/UQSmR5hUwiQ' },
  { id: 'ales-krivec-ZVvcTwANofQ', by: 'Ales Krivec', url: 'https://unsplash.com/photos/ZVvcTwANofQ' },
  { id: 'ales-krivec-wsokJokUfgI', by: 'Ales Krivec', url: 'https://unsplash.com/photos/wsokJokUfgI' },
  { id: 'ansgar-scheffold-z_f2JrBRbOg', by: 'Ansgar Scheffold', url: 'https://unsplash.com/photos/z_f2JrBRbOg' },
  { id: 'benjamin-davies-Zm2n2O7Fph4', by: 'Benjamin Davies', url: 'https://unsplash.com/photos/Zm2n2O7Fph4' },
  { id: 'benjamin-voros-phIFdC6lA4E', by: 'Benjamin Voros', url: 'https://unsplash.com/photos/phIFdC6lA4E' },
  { id: 'damian-markutt-t5zd13bixkQ', by: 'Damian Markutt', url: 'https://unsplash.com/photos/t5zd13bixkQ' },
  { id: 'damian-patkowski-T-LfvX-7IVg', by: 'Damian Patkowski', url: 'https://unsplash.com/photos/T-LfvX-7IVg' },
  { id: 'daniel-mirlea-2gGuHuQEaXM', by: 'Daniel Mirlea', url: 'https://unsplash.com/photos/2gGuHuQEaXM' },
  { id: 'evgeni-tcherkasski-EJ6Y59HMDEY', by: 'Evgeni Tcherkasski', url: 'https://unsplash.com/photos/EJ6Y59HMDEY' },
  { id: 'getty-images-cZ6-FXVNj7k', by: 'Getty Images', url: 'https://unsplash.com/photos/cZ6-FXVNj7k' },
  { id: 'getty-images-gLstV49rQb8', by: 'Getty Images', url: 'https://unsplash.com/photos/gLstV49rQb8' },
  { id: 'getty-images-gPbd8TxXxWQ', by: 'Getty Images', url: 'https://unsplash.com/photos/gPbd8TxXxWQ' },
  { id: 'getty-images-pbSOdPFrqLc', by: 'Getty Images', url: 'https://unsplash.com/photos/pbSOdPFrqLc' },
  { id: 'getty-images-wWiERe7wlIg', by: 'Getty Images', url: 'https://unsplash.com/photos/wWiERe7wlIg' },
  { id: 'jailam-rashad-Qe58SmRMcH4', by: 'Jailam Rashad', url: 'https://unsplash.com/photos/Qe58SmRMcH4' },
  { id: 'jerry-zhang-SJGiS1JzUCc', by: 'Jerry Zhang', url: 'https://unsplash.com/photos/SJGiS1JzUCc' },
  { id: 'jonny-gios-iaDSz9TsRYY', by: 'Jonny Gios', url: 'https://unsplash.com/photos/iaDSz9TsRYY' },
  { id: 'justin-fisher-qrga71KYbgM', by: 'Justin Fisher', url: 'https://unsplash.com/photos/qrga71KYbgM' },
  { id: 'kace-rodriguez-p3OzJuT_Dks', by: 'Kace Rodriguez', url: 'https://unsplash.com/photos/p3OzJuT_Dks' },
  { id: 'leo-serrat-T2vkCx_b04E', by: 'Leo Serrat', url: 'https://unsplash.com/photos/T2vkCx_b04E' },
  { id: 'marek-piwnicki-wgsu3WzFZ5c', by: 'Marek Piwnicki', url: 'https://unsplash.com/photos/wgsu3WzFZ5c' },
  { id: 'nick-fewings-Bd1MhsLxeRI', by: 'Nick Fewings', url: 'https://unsplash.com/photos/Bd1MhsLxeRI' },
  { id: 'richard-dorran-e56x9U4SaJs', by: 'Richard Dorran', url: 'https://unsplash.com/photos/e56x9U4SaJs' },
  { id: 'sudhakar-chandra-5qRTC0t1A58', by: 'Sudhakar Chandra', url: 'https://unsplash.com/photos/5qRTC0t1A58' },
  { id: 'uran-wang-TVORvlpH2ZY', by: 'Uran Wang', url: 'https://unsplash.com/photos/TVORvlpH2ZY' },
  { id: 'venti-views-Vs5ciaxG1Cs', by: 'Venti Views', url: 'https://unsplash.com/photos/Vs5ciaxG1Cs' },
];

const UTM = '?utm_source=chronicles&utm_medium=referral';

export const wallpaperSrc = (id: string) => `/wallpapers/${id}.jpg`;
export const wallpaperThumb = (id: string) => `/wallpapers/thumbs/${id}.jpg`;
export const wallpaperById = (id: string | null | undefined) => (id ? WALLPAPERS.find(w => w.id === id) : undefined);
/** The photo's page, with Unsplash's referral tag */
export const wallpaperLink = (w: Wallpaper) => `${w.url}${UTM}`;
export const UNSPLASH_LINK = `https://unsplash.com/${UTM}`;

/* The choice is remembered per browser, so a reload shows it at once (the
   sealed `wallpaper` setting is the record; this is only a head start) */
const KEY = 'chronicles.wallpaper-v1';

/** The background everyone starts with: Marek Piwnicki's mountains at sunset
 *  (the one in the landing page's screenshots) */
export const DEFAULT_WALLPAPER = 'marek-piwnicki-wgsu3WzFZ5c';

/** What's saved when someone picks None — kept apart from "never chosen",
 *  which means the default */
export const NO_WALLPAPER = 'none';

/** The wallpaper to show for a saved choice: None → null, a known photo → it,
 *  nothing saved (or a photo that's since been removed) → the default */
export function resolveWallpaper(saved: string | null | undefined): string | null {
  if (saved === NO_WALLPAPER) return null;
  return wallpaperById(saved) ? saved! : DEFAULT_WALLPAPER;
}

export function startingWallpaper(): string | null {
  try {
    return resolveWallpaper(localStorage.getItem(KEY));
  } catch { return DEFAULT_WALLPAPER; }
}

export function rememberWallpaper(id: string | null): void {
  try {
    localStorage.setItem(KEY, id ?? NO_WALLPAPER);
  } catch { /* storage unavailable */ }
}
