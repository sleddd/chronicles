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
  { id: 'ales-krivec-wsokJokUfgI', by: 'Ales Krivec', url: 'https://unsplash.com/photos/wsokJokUfgI' },
  { id: 'andrew-ridley-Kt5hRENuotI', by: 'Andrew Ridley', url: 'https://unsplash.com/photos/Kt5hRENuotI' },
  { id: 'ashim-d-silva-WeYamle9fDM', by: 'Ashim D’Silva', url: 'https://unsplash.com/photos/WeYamle9fDM' },
  { id: 'benjamin-voros-phIFdC6lA4E', by: 'Benjamin Voros', url: 'https://unsplash.com/photos/phIFdC6lA4E' },
  { id: 'casey-horner-Ib3VGPlGrMc', by: 'Casey Horner', url: 'https://unsplash.com/photos/Ib3VGPlGrMc' },
  { id: 'colin-watts-T5g1bLqJego', by: 'Colin Watts', url: 'https://unsplash.com/photos/T5g1bLqJego' },
  { id: 'curated-lifestyle-kfRDQsx6Oa4', by: 'Curated Lifestyle', url: 'https://unsplash.com/photos/kfRDQsx6Oa4' },
  { id: 'curated-lifestyle-rq6-JSmTN7k', by: 'Curated Lifestyle', url: 'https://unsplash.com/photos/rq6-JSmTN7k' },
  { id: 'daniel-mirlea-rurr5I6TfzQ', by: 'Daniel Mirlea', url: 'https://unsplash.com/photos/rurr5I6TfzQ' },
  { id: 'daniel-olah-NplTeCZG_uU', by: 'Daniel Olah', url: 'https://unsplash.com/photos/NplTeCZG_uU' },
  { id: 'daniel-sessler-BurTAJlbsRo', by: 'Daniel Seßler', url: 'https://unsplash.com/photos/BurTAJlbsRo' },
  { id: 'daniela-cuevas-t7YycgAoVSw', by: 'Daniela Cuevas', url: 'https://unsplash.com/photos/t7YycgAoVSw' },
  { id: 'daniil-komov-KqOtezbdxKs', by: 'Daniil Komov', url: 'https://unsplash.com/photos/KqOtezbdxKs' },
  { id: 'david-zieglgansberger-YhBPpNRyN-8', by: 'David Zieglgänsberger', url: 'https://unsplash.com/photos/YhBPpNRyN-8' },
  { id: 'dennis-yu-4FLmDMG6wQs', by: 'Dennis Yu', url: 'https://unsplash.com/photos/4FLmDMG6wQs' },
  { id: 'evgeni-tcherkasski-EJ6Y59HMDEY', by: 'Evgeni Tcherkasski', url: 'https://unsplash.com/photos/EJ6Y59HMDEY' },
  { id: 'getty-images-Eu8PztU27_w', by: 'Getty Images', url: 'https://unsplash.com/photos/Eu8PztU27_w' },
  { id: 'getty-images-GNqLWDUKwDk', by: 'Getty Images', url: 'https://unsplash.com/photos/GNqLWDUKwDk' },
  { id: 'getty-images-kqr1K7ASnGY', by: 'Getty Images', url: 'https://unsplash.com/photos/kqr1K7ASnGY' },
  { id: 'getty-images-LSVUVk4o7DM', by: 'Getty Images', url: 'https://unsplash.com/photos/LSVUVk4o7DM' },
  { id: 'henrique-ferreira-RKsLQoSnuTc', by: 'Henrique Ferreira', url: 'https://unsplash.com/photos/RKsLQoSnuTc' },
  { id: 'jessica-pamp-sGRMspZmfPE', by: 'Jessica Pamp', url: 'https://unsplash.com/photos/sGRMspZmfPE' },
  { id: 'joshua-earle-Ax3b7Ge4HO8', by: 'Joshua Earle', url: 'https://unsplash.com/photos/Ax3b7Ge4HO8' },
  { id: 'justin-fisher-qrga71KYbgM', by: 'Justin Fisher', url: 'https://unsplash.com/photos/qrga71KYbgM' },
  { id: 'karsten-wurth-rafblRbne3o', by: 'Karsten Würth', url: 'https://unsplash.com/photos/rafblRbne3o' },
  { id: 'kev-kindred-EJ41bTpIdB8', by: 'Kev Kindred', url: 'https://unsplash.com/photos/EJ41bTpIdB8' },
  { id: 'kurt-cotoaga-JocesMTPf58', by: 'Kurt Cotoaga', url: 'https://unsplash.com/photos/JocesMTPf58' },
  { id: 'ladi-svoboda-RGDR7LCPk2E', by: 'Ladi Svoboda', url: 'https://unsplash.com/photos/RGDR7LCPk2E' },
  { id: 'leonardo-milani-SW2iwG3vBOM', by: 'Leonardo Milani', url: 'https://unsplash.com/photos/SW2iwG3vBOM' },
  { id: 'luca-micheli-ruWkmt3nU58', by: 'Luca Micheli', url: 'https://unsplash.com/photos/ruWkmt3nU58' },
  { id: 'maksim-shutov-pwod5dX4hEc', by: 'Maksim Shutov', url: 'https://unsplash.com/photos/pwod5dX4hEc' },
  { id: 'matt-hardy-6ArTTluciuA', by: 'Matt Hardy', url: 'https://unsplash.com/photos/6ArTTluciuA' },
  { id: 'michal-mrozek-y0iTdaWGBxI', by: 'Michal Mrozek', url: 'https://unsplash.com/photos/y0iTdaWGBxI' },
  { id: 'pj-gal-szabo--LgSPyExO9I', by: 'PJ Gal-Szabo', url: 'https://unsplash.com/photos/-LgSPyExO9I' },
  { id: 'robert-ostheimer-YzhqA8pj_uI', by: 'Robert Ostheimer', url: 'https://unsplash.com/photos/YzhqA8pj_uI' },
  { id: 'uran-wang-TVORvlpH2ZY', by: 'Uran Wang', url: 'https://unsplash.com/photos/TVORvlpH2ZY' },
  { id: 'venti-views-Vs5ciaxG1Cs', by: 'Venti Views', url: 'https://unsplash.com/photos/Vs5ciaxG1Cs' },
  { id: 'wynand-van-poortvliet-4AmyOdXZAQc', by: 'Wynand van Poortvliet', url: 'https://unsplash.com/photos/4AmyOdXZAQc' },
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

/** The background everyone starts with: Daniel Seßler's green lake under a
 *  mountain and a blue sky */
export const DEFAULT_WALLPAPER = 'daniel-sessler-BurTAJlbsRo';

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
