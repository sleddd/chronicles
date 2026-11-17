import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { WALLPAPERS, wallpaperById, wallpaperLink, wallpaperSrc, wallpaperThumb, startingWallpaper, rememberWallpaper, resolveWallpaper, DEFAULT_WALLPAPER, DEFAULT_WALLPAPERS, DEFAULT_CHOICE, shownWallpaper } from '../../utils/wallpapers.js';

const PUBLIC = path.resolve(__dirname, '../../../public');

describe('wallpapers', () => {
  it('has a photo and a thumbnail on disk for every entry, ids unique', () => {
    expect(new Set(WALLPAPERS.map(w => w.id)).size).toBe(WALLPAPERS.length);
    for (const w of WALLPAPERS) {
      expect(fs.existsSync(path.join(PUBLIC, wallpaperSrc(w.id)))).toBe(true);
      expect(fs.existsSync(path.join(PUBLIC, wallpaperThumb(w.id)))).toBe(true);
    }
  });

  it('credits each photo to its photographer and links its Unsplash page', () => {
    const w = wallpaperById('benjamin-voros-phIFdC6lA4E')!;
    expect(w.by).toBe('Benjamin Voros');
    expect(wallpaperLink(w)).toBe('https://unsplash.com/photos/phIFdC6lA4E?utm_source=chronicles&utm_medium=referral');
    expect(wallpaperById('benjamin-voros-phIFdC6lA4E')?.url).toBe('https://unsplash.com/photos/phIFdC6lA4E');
  });

  it('lists our own photos with no credit or link', () => {
    // There may be none at the moment (they come and go with the folder)
    const own = WALLPAPERS.filter(w => w.id.startsWith('own-'));
    for (const w of own) expect(w.by ?? w.url).toBeUndefined();
    for (const w of WALLPAPERS.filter(x => !x.id.startsWith('own-'))) expect(w.by && w.url).toBeTruthy();
  });

  it('starts on the default photo, keeps None as None, and falls back from a removed photo', () => {
    expect(wallpaperById(DEFAULT_WALLPAPER)).toBeDefined();
    expect(resolveWallpaper(null)).toBe(DEFAULT_CHOICE);
    expect(resolveWallpaper(undefined)).toBe(DEFAULT_CHOICE);
    expect(resolveWallpaper('none')).toBeNull();
    expect(resolveWallpaper('a-photo-since-removed')).toBe(DEFAULT_CHOICE);
    expect(resolveWallpaper('benjamin-voros-phIFdC6lA4E')).toBe('benjamin-voros-phIFdC6lA4E');
  });

  it('remembers the choice per browser, None included', () => {
    localStorage.removeItem('chronicles.wallpaper-v1');
    expect(startingWallpaper()).toBe(DEFAULT_CHOICE);
    rememberWallpaper('benjamin-voros-phIFdC6lA4E');
    expect(startingWallpaper()).toBe('benjamin-voros-phIFdC6lA4E');
    rememberWallpaper(null);
    expect(startingWallpaper()).toBeNull();
  });
});

describe('a default for each theme', () => {
  it('shows the theme\'s default to someone who never picked one, and a pick in both', () => {
    expect(wallpaperById(DEFAULT_WALLPAPERS.light)).toBeDefined();
    expect(DEFAULT_WALLPAPERS.dark).toBeNull(); // dark: no photo by default
    expect(shownWallpaper(DEFAULT_CHOICE, 'light')).toBe(DEFAULT_WALLPAPERS.light);
    expect(shownWallpaper(DEFAULT_CHOICE, 'dark')).toBe(DEFAULT_WALLPAPERS.dark);
    expect(shownWallpaper('benjamin-voros-phIFdC6lA4E', 'light')).toBe('benjamin-voros-phIFdC6lA4E');
    expect(shownWallpaper(null, 'dark')).toBeNull();
  });
});
