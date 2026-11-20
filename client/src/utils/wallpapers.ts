/**
 * Wallpapers (Settings → Theme → Background): photos from Unsplash and our
 * own (ids starting own-, no credit or link), served
 * from public/wallpapers — 2,400px wide, with 480 × 300 thumbnails for the
 * picker — and loaded only once chosen. The originals are kept outside the
 * app (src/assets/wallpaper, not committed). Each carries its credit:
 * "Photo by <name> on Unsplash", linking to the photo's page.
 */

import type { EntryImage } from '../services/imageStorage.js';
import { parseStoredImage } from './storedImage.js';

export interface Wallpaper {
  id: string;
  /** The photographer, as Unsplash credits them. None on our own photos */
  by?: string;
  /** The photo's Unsplash page. None on our own photos */
  url?: string;
}

export const WALLPAPERS: Wallpaper[] = [
  { id: 'own-2' },
  { id: 'own-starry-night' },
  { id: 'own-green-mountains' },
  { id: 'own-grains' },
  { id: 'own-beach' },
  { id: 'own-renaissance-floral' },
  { id: 'own-sunset' },
  { id: 'own-waterfalls' },
  { id: 'nikolett-harmat-VSTP_kmMpPQ', by: 'Nikolett Harmat', url: 'https://unsplash.com/photos/VSTP_kmMpPQ' },
  { id: 'aaron-burden-tQF8FCNYNrk', by: 'Aaron Burden', url: 'https://unsplash.com/photos/tQF8FCNYNrk' },
  { id: 'allec-gomes-GJGO_B64xv0', by: 'Allec Gomes', url: 'https://unsplash.com/photos/GJGO_B64xv0' },
  { id: 'amy-chen-WoBGZrctrHE', by: 'Amy Chen', url: 'https://unsplash.com/photos/WoBGZrctrHE' },
  { id: 'camille-brodard-kOAU9SG0VX8', by: 'Camille Brodard', url: 'https://unsplash.com/photos/kOAU9SG0VX8' },
  { id: 'curated-lifestyle-kfRDQsx6Oa4', by: 'Curated Lifestyle', url: 'https://unsplash.com/photos/kfRDQsx6Oa4' },
  { id: 'curated-lifestyle-r0kspUg5zRU', by: 'Curated Lifestyle', url: 'https://unsplash.com/photos/r0kspUg5zRU' },
  { id: 'curated-lifestyle-rq6-JSmTN7k', by: 'Curated Lifestyle', url: 'https://unsplash.com/photos/rq6-JSmTN7k' },
  { id: 'daniel-mirlea-7X6e9sYQggg', by: 'Daniel Mirlea', url: 'https://unsplash.com/photos/7X6e9sYQggg' },
  { id: 'daniel-sessler-BurTAJlbsRo', by: 'Daniel Seßler', url: 'https://unsplash.com/photos/BurTAJlbsRo' },
  { id: 'daniela-cuevas-t7YycgAoVSw', by: 'Daniela Cuevas', url: 'https://unsplash.com/photos/t7YycgAoVSw' },
  { id: 'daniil-komov-KqOtezbdxKs', by: 'Daniil Komov', url: 'https://unsplash.com/photos/KqOtezbdxKs' },
  { id: 'david-zieglgansberger-YhBPpNRyN-8', by: 'David Zieglgänsberger', url: 'https://unsplash.com/photos/YhBPpNRyN-8' },
  { id: 'dmytro-yarish-sKYUe5cboxw', by: 'Dmytro Yarish', url: 'https://unsplash.com/photos/sKYUe5cboxw' },
  { id: 'eren-goldman-1Nd7uUq-Hfc', by: 'Eren Goldman', url: 'https://unsplash.com/photos/1Nd7uUq-Hfc' },
  { id: 'evgeni-tcherkasski-EJ6Y59HMDEY', by: 'Evgeni Tcherkasski', url: 'https://unsplash.com/photos/EJ6Y59HMDEY' },
  { id: 'federico-bottos-Vbx4qm-qR_w', by: 'Federico Bottos', url: 'https://unsplash.com/photos/Vbx4qm-qR_w' },
  { id: 'getty-images-kqr1K7ASnGY', by: 'Getty Images', url: 'https://unsplash.com/photos/kqr1K7ASnGY' },
  { id: 'getty-images-LSVUVk4o7DM', by: 'Getty Images', url: 'https://unsplash.com/photos/LSVUVk4o7DM' },
  { id: 'getty-images-QfFpQqiAj5A', by: 'Getty Images', url: 'https://unsplash.com/photos/QfFpQqiAj5A' },
  { id: 'getty-images-TFuEe-FTSRE', by: 'Getty Images', url: 'https://unsplash.com/photos/TFuEe-FTSRE' },
  { id: 'getty-images-z46zJAvvuWM', by: 'Getty Images', url: 'https://unsplash.com/photos/z46zJAvvuWM' },
  { id: 'henrique-ferreira-RKsLQoSnuTc', by: 'Henrique Ferreira', url: 'https://unsplash.com/photos/RKsLQoSnuTc' },
  { id: 'jared-rice-xce530fBHrk', by: 'Jared Rice', url: 'https://unsplash.com/photos/xce530fBHrk' },
  { id: 'jay-castor-7AcMUSYRZpU', by: 'Jay Castor', url: 'https://unsplash.com/photos/7AcMUSYRZpU' },
  { id: 'jeremy-bishop-SltlOI33APs', by: 'Jeremy Bishop', url: 'https://unsplash.com/photos/SltlOI33APs' },
  { id: 'john-wiesenfeld-Ug6z9PCwr58', by: 'John Wiesenfeld', url: 'https://unsplash.com/photos/Ug6z9PCwr58' },
  { id: 'jonny-gios-bsgoRil5e70', by: 'Jonny Gios', url: 'https://unsplash.com/photos/bsgoRil5e70' },
  { id: 'jonny-gios-gKik93wrD9A', by: 'Jonny Gios', url: 'https://unsplash.com/photos/gKik93wrD9A' },
  { id: 'joshua-earle-Ax3b7Ge4HO8', by: 'Joshua Earle', url: 'https://unsplash.com/photos/Ax3b7Ge4HO8' },
  { id: 'justin-fisher-qrga71KYbgM', by: 'Justin Fisher', url: 'https://unsplash.com/photos/qrga71KYbgM' },
  { id: 'justin-wolff-pbp_Ww2cewA', by: 'Justin Wolff', url: 'https://unsplash.com/photos/pbp_Ww2cewA' },
  { id: 'karsten-wurth-rafblRbne3o', by: 'Karsten Würth', url: 'https://unsplash.com/photos/rafblRbne3o' },
  { id: 'kat-von-wood-jqyhb23qcc0', by: 'Kat Von Wood', url: 'https://unsplash.com/photos/jqyhb23qcc0' },
  { id: 'ladi-svoboda-RGDR7LCPk2E', by: 'Ladi Svoboda', url: 'https://unsplash.com/photos/RGDR7LCPk2E' },
  { id: 'leo_visions-D9-bDyjgeHo', by: 'Leo_visions', url: 'https://unsplash.com/photos/D9-bDyjgeHo' },
  { id: 'madison-kuhn-aV7_rCZpvGY', by: 'Madison Kuhn', url: 'https://unsplash.com/photos/aV7_rCZpvGY' },
  { id: 'mark-olsen-OyiSf0nVz7U', by: 'Mark Olsen', url: 'https://unsplash.com/photos/OyiSf0nVz7U' },
  { id: 'neil-thomas-dGyshquBzOc', by: 'Neil Thomas', url: 'https://unsplash.com/photos/dGyshquBzOc' },
  { id: 'own-my-lakehouse' },
  { id: 'pawel-czerwinski-CENK_Rzij0c', by: 'Pawel Czerwinski', url: 'https://unsplash.com/photos/CENK_Rzij0c' },
  { id: 'philipp-torres-LNYdZutqsi0', by: 'Philipp Torres', url: 'https://unsplash.com/photos/LNYdZutqsi0' },
  { id: 'pj-gal-szabo--LgSPyExO9I', by: 'PJ Gal-Szabo', url: 'https://unsplash.com/photos/-LgSPyExO9I' },
  { id: 'ritz-WupU1u45AbE', by: 'Ritz', url: 'https://unsplash.com/photos/WupU1u45AbE' },
  { id: 'saad-chaudhry-YNM4KStg78I', by: 'Saad Chaudhry', url: 'https://unsplash.com/photos/YNM4KStg78I' },
  { id: 'sean-oulashin-KMn4VEeEPR8', by: 'Sean Oulashin', url: 'https://unsplash.com/photos/KMn4VEeEPR8' },
  { id: 'steve-a-johnson-x4iP2RKzIdM', by: 'Steve A Johnson', url: 'https://unsplash.com/photos/x4iP2RKzIdM' },
  { id: 'the-metropolitan-museum-of-art-jfRwwaQRWsQ', by: 'The Metropolitan Museum Of Art', url: 'https://unsplash.com/photos/jfRwwaQRWsQ' },
  { id: 'the-metropolitan-museum-of-art-mdb3LSgqKuo', by: 'The Metropolitan Museum of Art', url: 'https://unsplash.com/photos/mdb3LSgqKuo' },
  { id: 'tim-marshall-PKSCrmZdvwA', by: 'Tim Marshall', url: 'https://unsplash.com/photos/PKSCrmZdvwA' },
  { id: 'uran-wang-TVORvlpH2ZY', by: 'Uran Wang', url: 'https://unsplash.com/photos/TVORvlpH2ZY' },
  { id: 'venti-views-Vs5ciaxG1Cs', by: 'Venti Views', url: 'https://unsplash.com/photos/Vs5ciaxG1Cs' },
  { id: 'europeana-r5F0zmg_BAk', by: 'Europeana', url: 'https://unsplash.com/photos/r5F0zmg_BAk' },
  { id: 'dennis-yu-4FLmDMG6wQs', by: 'Dennis Yu', url: 'https://unsplash.com/photos/4FLmDMG6wQs' },
  { id: 'benjamin-voros-phIFdC6lA4E', by: 'Benjamin Voros', url: 'https://unsplash.com/photos/phIFdC6lA4E' },
  { id: 'behnam-mohsenzadeh-8KZLgOy-xQY', by: 'Behnam Mohsenzadeh', url: 'https://unsplash.com/photos/8KZLgOy-xQY' },
  { id: 'ashim-d-silva-WeYamle9fDM', by: 'Ashim D’Silva', url: 'https://unsplash.com/photos/WeYamle9fDM' },
  { id: 'colin-watts-T5g1bLqJego', by: 'Colin Watts', url: 'https://unsplash.com/photos/T5g1bLqJego' },
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

/** The background everyone starts with in dark theme: Frank van Hulst's beach and
 *  dune grass (0h3McHB_eCc) — the light default until Justin Fisher's qrga71KYbgM came back. Markus Ojanperä's lake (rCHv_7lzLOw) was the dark default
 *  briefly, Madison Kuhn's river valley (aV7_rCZpvGY) before it — still the landing
 *  page's hero photo (HERO_PHOTO in LandingTemplate) — and Justin Fisher's
 *  qrga71KYbgM for a while; all stay in the list */
export const DEFAULT_WALLPAPER = 'own-2';

/** The default background for each theme — shown to anyone who hasn't picked one.
 *  Both themes start on our own photo `own-2` (light was Justin Fisher's
 *  qrga71KYbgM and dark had none before) */
export const DEFAULT_WALLPAPERS: Record<'light' | 'dark', string | null> = {
  light: 'own-2',
  dark: 'own-2',
};

/** The choice "never picked one": the theme's default, which changes with the theme */
export const DEFAULT_CHOICE = 'default';

/** What's saved when someone picks None — kept apart from "never chosen",
 *  which means the default */
export const NO_WALLPAPER = 'none';

/** The choice "my own photo" (only while Entry Images is on and set up): the photo
 *  itself is kept beside the choice in the sealed setting */
export const CUSTOM_WALLPAPER = 'custom';

/** The sealed `wallpaper` setting: just the choice (a photo's id / NO_WALLPAPER), or —
 *  once the person has a photo of their own — the choice with that photo, which is kept
 *  while another background is chosen so it can be picked again */
export type WallpaperSetting = string | { choice: string; custom: EntryImage } | null;

/** The person's own photo in a saved value (null: none) */
export function customWallpaperFrom(saved: unknown): EntryImage | null {
  return saved && typeof saved === 'object' ? parseStoredImage((saved as { custom?: unknown }).custom) : null;
}

/** What to save for a choice, keeping the person's own photo with it */
export function wallpaperSetting(choice: string | null, custom: EntryImage | null): WallpaperSetting {
  const value = choice ?? NO_WALLPAPER;
  return custom ? { choice: value, custom } : value;
}

/** The choice a saved value stands for: None → null, a known photo → it, the person's
 *  own photo → CUSTOM_WALLPAPER, nothing saved (or a photo that's since been removed)
 *  → DEFAULT_CHOICE, the theme's default */
export function resolveWallpaper(saved: unknown): string | null {
  if (saved && typeof saved === 'object') {
    const choice = (saved as { choice?: unknown }).choice;
    if (choice === CUSTOM_WALLPAPER) return customWallpaperFrom(saved) ? CUSTOM_WALLPAPER : DEFAULT_CHOICE;
    return resolveWallpaper(typeof choice === 'string' ? choice : null);
  }
  if (saved === NO_WALLPAPER) return null;
  // The browser's remembered choice: the photo itself arrives with the settings
  if (saved === CUSTOM_WALLPAPER) return CUSTOM_WALLPAPER;
  return typeof saved === 'string' && wallpaperById(saved) ? saved : DEFAULT_CHOICE;
}

/** The photo to show for a choice in a theme (null = none) */
export function shownWallpaper(choice: string | null, theme: 'light' | 'dark'): string | null {
  return choice === DEFAULT_CHOICE ? DEFAULT_WALLPAPERS[theme] : choice;
}

export function startingWallpaper(): string | null {
  try {
    return resolveWallpaper(localStorage.getItem(KEY));
  } catch { return DEFAULT_CHOICE; }
}

export function rememberWallpaper(id: string | null): void {
  try {
    localStorage.setItem(KEY, id ?? NO_WALLPAPER);
  } catch { /* storage unavailable */ }
}
