/**
 * Wallpapers (Settings → Theme → Background): photos from Unsplash and our
 * own (ids starting own-, no credit or link), served
 * from public/wallpapers — 2,400px wide, with 480 × 300 thumbnails for the
 * picker — and loaded only once chosen. The originals are kept outside the
 * app (src/assets/wallpaper, not committed). Each carries its credit:
 * "Photo by <name> on Unsplash", linking to the photo's page.
 */

export interface Wallpaper {
  id: string;
  /** The photographer, as Unsplash credits them. None on our own photos */
  by?: string;
  /** The photo's Unsplash page. None on our own photos */
  url?: string;
}

export const WALLPAPERS: Wallpaper[] = [
  { id: 'ashim-d-silva-WeYamle9fDM', by: 'Ashim D’Silva', url: 'https://unsplash.com/photos/WeYamle9fDM' },
  { id: 'ashish-kumar-senapati-cRmUSrt22vw', by: 'Ashish Kumar Senapati', url: 'https://unsplash.com/photos/cRmUSrt22vw' },
  { id: 'behnam-mohsenzadeh-8KZLgOy-xQY', by: 'Behnam Mohsenzadeh', url: 'https://unsplash.com/photos/8KZLgOy-xQY' },
  { id: 'benjamin-voros-phIFdC6lA4E', by: 'Benjamin Voros', url: 'https://unsplash.com/photos/phIFdC6lA4E' },
  { id: 'camille-brodard-kOAU9SG0VX8', by: 'Camille Brodard', url: 'https://unsplash.com/photos/kOAU9SG0VX8' },
  { id: 'claudio-testa--SO3JtE3gZo', by: 'Claudio Testa', url: 'https://unsplash.com/photos/-SO3JtE3gZo' },
  { id: 'colin-watts-T5g1bLqJego', by: 'Colin Watts', url: 'https://unsplash.com/photos/T5g1bLqJego' },
  { id: 'curated-lifestyle-kfRDQsx6Oa4', by: 'Curated Lifestyle', url: 'https://unsplash.com/photos/kfRDQsx6Oa4' },
  { id: 'curated-lifestyle-rq6-JSmTN7k', by: 'Curated Lifestyle', url: 'https://unsplash.com/photos/rq6-JSmTN7k' },
  { id: 'daniel-olah-NplTeCZG_uU', by: 'Daniel Olah', url: 'https://unsplash.com/photos/NplTeCZG_uU' },
  { id: 'daniel-sessler-BurTAJlbsRo', by: 'Daniel Seßler', url: 'https://unsplash.com/photos/BurTAJlbsRo' },
  { id: 'daniela-cuevas-t7YycgAoVSw', by: 'Daniela Cuevas', url: 'https://unsplash.com/photos/t7YycgAoVSw' },
  { id: 'daniil-komov-KqOtezbdxKs', by: 'Daniil Komov', url: 'https://unsplash.com/photos/KqOtezbdxKs' },
  { id: 'david-zieglgansberger-YhBPpNRyN-8', by: 'David Zieglgänsberger', url: 'https://unsplash.com/photos/YhBPpNRyN-8' },
  { id: 'dennis-yu-4FLmDMG6wQs', by: 'Dennis Yu', url: 'https://unsplash.com/photos/4FLmDMG6wQs' },
  { id: 'europeana-r5F0zmg_BAk', by: 'Europeana', url: 'https://unsplash.com/photos/r5F0zmg_BAk' },
  { id: 'evgeni-tcherkasski-EJ6Y59HMDEY', by: 'Evgeni Tcherkasski', url: 'https://unsplash.com/photos/EJ6Y59HMDEY' },
  { id: 'federico-bottos-Vbx4qm-qR_w', by: 'Federico Bottos', url: 'https://unsplash.com/photos/Vbx4qm-qR_w' },
  { id: 'frank-van-hulst-0h3McHB_eCc', by: 'Frank Van Hulst', url: 'https://unsplash.com/photos/0h3McHB_eCc' },
  { id: 'getty-images-kqr1K7ASnGY', by: 'Getty Images', url: 'https://unsplash.com/photos/kqr1K7ASnGY' },
  { id: 'getty-images-LSVUVk4o7DM', by: 'Getty Images', url: 'https://unsplash.com/photos/LSVUVk4o7DM' },
  { id: 'henrique-ferreira-RKsLQoSnuTc', by: 'Henrique Ferreira', url: 'https://unsplash.com/photos/RKsLQoSnuTc' },
  { id: 'jeremy-bishop-SltlOI33APs', by: 'Jeremy Bishop', url: 'https://unsplash.com/photos/SltlOI33APs' },
  { id: 'jessica-pamp-sGRMspZmfPE', by: 'Jessica Pamp', url: 'https://unsplash.com/photos/sGRMspZmfPE' },
  { id: 'joshua-earle-Ax3b7Ge4HO8', by: 'Joshua Earle', url: 'https://unsplash.com/photos/Ax3b7Ge4HO8' },
  { id: 'justin-fisher-qrga71KYbgM', by: 'Justin Fisher', url: 'https://unsplash.com/photos/qrga71KYbgM' },
  { id: 'justin-wolff-pbp_Ww2cewA', by: 'Justin Wolff', url: 'https://unsplash.com/photos/pbp_Ww2cewA' },
  { id: 'karsten-wurth-rafblRbne3o', by: 'Karsten Würth', url: 'https://unsplash.com/photos/rafblRbne3o' },
  { id: 'kat-von-wood-jqyhb23qcc0', by: 'Kat Von Wood', url: 'https://unsplash.com/photos/jqyhb23qcc0' },
  { id: 'kev-kindred-EJ41bTpIdB8', by: 'Kev Kindred', url: 'https://unsplash.com/photos/EJ41bTpIdB8' },
  { id: 'ladi-svoboda-RGDR7LCPk2E', by: 'Ladi Svoboda', url: 'https://unsplash.com/photos/RGDR7LCPk2E' },
  { id: 'leonardo-milani-SW2iwG3vBOM', by: 'Leonardo Milani', url: 'https://unsplash.com/photos/SW2iwG3vBOM' },
  { id: 'luca-micheli-ruWkmt3nU58', by: 'Luca Micheli', url: 'https://unsplash.com/photos/ruWkmt3nU58' },
  { id: 'madison-kuhn-aV7_rCZpvGY', by: 'Madison Kuhn', url: 'https://unsplash.com/photos/aV7_rCZpvGY' },
  { id: 'maksim-shutov-pwod5dX4hEc', by: 'Maksim Shutov', url: 'https://unsplash.com/photos/pwod5dX4hEc' },
  { id: 'mark-olsen-OyiSf0nVz7U', by: 'Mark Olsen', url: 'https://unsplash.com/photos/OyiSf0nVz7U' },
  { id: 'markus-ojanpera-rCHv_7lzLOw', by: 'Markus Ojanpera', url: 'https://unsplash.com/photos/rCHv_7lzLOw' },
  { id: 'nikolett-harmat-VSTP_kmMpPQ', by: 'Nikolett Harmat', url: 'https://unsplash.com/photos/VSTP_kmMpPQ' },
  { id: 'pj-gal-szabo--LgSPyExO9I', by: 'PJ Gal-Szabo', url: 'https://unsplash.com/photos/-LgSPyExO9I' },
  { id: 'ritz-WupU1u45AbE', by: 'Ritz', url: 'https://unsplash.com/photos/WupU1u45AbE' },
  { id: 'sabari-nathan-p_fv7e4RzoY', by: 'Sabari Nathan', url: 'https://unsplash.com/photos/p_fv7e4RzoY' },
  { id: 'smithsonian-C1J3Z40D8Ok', by: 'Smithsonian', url: 'https://unsplash.com/photos/C1J3Z40D8Ok' },
  { id: 'spencer-demera-qZ4XVhpXGKQ', by: 'Spencer Demera', url: 'https://unsplash.com/photos/qZ4XVhpXGKQ' },
  { id: 'steve-a-johnson-x4iP2RKzIdM', by: 'Steve A Johnson', url: 'https://unsplash.com/photos/x4iP2RKzIdM' },
  { id: 'the-metropolitan-museum-of-art-jfRwwaQRWsQ', by: 'The Metropolitan Museum Of Art', url: 'https://unsplash.com/photos/jfRwwaQRWsQ' },
  { id: 'the-metropolitan-museum-of-art-mdb3LSgqKuo', by: 'The Metropolitan Museum of Art', url: 'https://unsplash.com/photos/mdb3LSgqKuo' },
  { id: 'tim-marshall-PKSCrmZdvwA', by: 'Tim Marshall', url: 'https://unsplash.com/photos/PKSCrmZdvwA' },
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

/** The background everyone starts with in dark theme: Frank van Hulst's beach and
 *  dune grass (0h3McHB_eCc). Markus Ojanperä's lake (rCHv_7lzLOw) was the dark default
 *  briefly, Madison Kuhn's river valley (aV7_rCZpvGY) before it — still the landing
 *  page's hero photo (HERO_PHOTO in LandingTemplate) — and Justin Fisher's
 *  qrga71KYbgM for a while; all stay in the list */
export const DEFAULT_WALLPAPER = 'frank-van-hulst-0h3McHB_eCc';

/** The default background for each theme — shown to anyone who hasn't picked one */
export const DEFAULT_WALLPAPERS: Record<'light' | 'dark', string> = {
  light: 'frank-van-hulst-0h3McHB_eCc',
  dark: DEFAULT_WALLPAPER,
};

/** The choice "never picked one": the theme's default, which changes with the theme */
export const DEFAULT_CHOICE = 'default';

/** What's saved when someone picks None — kept apart from "never chosen",
 *  which means the default */
export const NO_WALLPAPER = 'none';

/** The choice a saved value stands for: None → null, a known photo → it, nothing
 *  saved (or a photo that's since been removed) → DEFAULT_CHOICE, the theme's default */
export function resolveWallpaper(saved: string | null | undefined): string | null {
  if (saved === NO_WALLPAPER) return null;
  return wallpaperById(saved) ? saved! : DEFAULT_CHOICE;
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
