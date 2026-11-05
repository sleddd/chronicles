import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { WALLPAPERS, wallpaperById, wallpaperLink, wallpaperSrc, wallpaperThumb, startingWallpaper, rememberWallpaper, resolveWallpaper, DEFAULT_WALLPAPER } from '../../utils/wallpapers.js';

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
    const w = wallpaperById('damian-patkowski-T-LfvX-7IVg')!;
    expect(w.by).toBe('Damian Patkowski');
    expect(wallpaperLink(w)).toBe('https://unsplash.com/photos/T-LfvX-7IVg?utm_source=chronicles&utm_medium=referral');
    expect(wallpaperById('damian-patkowski-T-LfvX-7IVg')?.url).toBe('https://unsplash.com/photos/T-LfvX-7IVg');
  });

  it('starts on the mountains, keeps None as None, and falls back from a removed photo', () => {
    expect(wallpaperById(DEFAULT_WALLPAPER)).toBeDefined();
    expect(resolveWallpaper(null)).toBe(DEFAULT_WALLPAPER);
    expect(resolveWallpaper(undefined)).toBe(DEFAULT_WALLPAPER);
    expect(resolveWallpaper('none')).toBeNull();
    expect(resolveWallpaper('a-photo-since-removed')).toBe(DEFAULT_WALLPAPER);
    expect(resolveWallpaper('damian-patkowski-T-LfvX-7IVg')).toBe('damian-patkowski-T-LfvX-7IVg');
  });

  it('remembers the choice per browser, None included', () => {
    localStorage.removeItem('chronicles.wallpaper-v1');
    expect(startingWallpaper()).toBe(DEFAULT_WALLPAPER);
    rememberWallpaper('damian-patkowski-T-LfvX-7IVg');
    expect(startingWallpaper()).toBe('damian-patkowski-T-LfvX-7IVg');
    rememberWallpaper(null);
    expect(startingWallpaper()).toBeNull();
  });
});
