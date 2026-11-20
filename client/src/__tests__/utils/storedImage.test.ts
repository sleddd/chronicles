import { describe, it, expect } from 'vitest';
import { parseStoredImage, storedImageKeys } from '@/utils/storedImage';
import { customWallpaperFrom, resolveWallpaper, wallpaperSetting, CUSTOM_WALLPAPER, DEFAULT_CHOICE, NO_WALLPAPER, WALLPAPERS } from '@/utils/wallpapers';
import { parseGoalCategories, areaImageKeys, CUSTOM_AREA_PHOTO } from '@/utils/goalCategories';

const IMG = { key: 'img/11111111-2222-3333-4444-555555555555', iv: 'aXY=', thumbKey: 'img/11111111-2222-3333-4444-555555555555-t', thumbIv: 'dGl2', mimeType: 'image/jpeg', size: 10 };

describe('a photo kept in a setting', () => {
  it('keeps a well-formed photo and its two keys', () => {
    expect(parseStoredImage(IMG)).toMatchObject({ key: IMG.key, thumbKey: IMG.thumbKey, iv: IMG.iv, thumbIv: IMG.thumbIv, mimeType: 'image/jpeg' });
    expect(storedImageKeys(parseStoredImage(IMG))).toEqual([IMG.key, IMG.thumbKey]);
    expect(storedImageKeys(null)).toEqual([]);
  });

  it('refuses anything that is not one of the app’s own image keys', () => {
    expect(parseStoredImage(null)).toBeNull();
    expect(parseStoredImage('img/x')).toBeNull();
    expect(parseStoredImage({ ...IMG, key: 'backups/secret.sql' })).toBeNull();
    expect(parseStoredImage({ ...IMG, thumbKey: '../other' })).toBeNull();
    expect(parseStoredImage({ ...IMG, iv: 5 })).toBeNull();
    // a stored type is never trusted: uploads are always JPEG
    expect(parseStoredImage({ ...IMG, mimeType: 'image/svg+xml' })?.mimeType).toBe('image/jpeg');
  });
});

describe('the custom background', () => {
  it('is saved with the choice and read back', () => {
    const saved = wallpaperSetting(CUSTOM_WALLPAPER, IMG);
    expect(resolveWallpaper(saved)).toBe(CUSTOM_WALLPAPER);
    expect(customWallpaperFrom(saved)?.key).toBe(IMG.key);
  });

  it('stays saved while another background is chosen', () => {
    const id = WALLPAPERS[0].id;
    const saved = wallpaperSetting(id, IMG);
    expect(resolveWallpaper(saved)).toBe(id);
    expect(customWallpaperFrom(saved)?.key).toBe(IMG.key);
    expect(resolveWallpaper(wallpaperSetting(null, IMG))).toBeNull();
  });

  it('without a photo is just the choice, as before', () => {
    expect(wallpaperSetting(null, null)).toBe(NO_WALLPAPER);
    expect(customWallpaperFrom('own-2')).toBeNull();
    expect(resolveWallpaper(NO_WALLPAPER)).toBeNull();
    expect(resolveWallpaper(undefined)).toBe(DEFAULT_CHOICE);
  });

  it('falls back to the default when the choice says custom but the photo is not one', () => {
    expect(resolveWallpaper({ choice: CUSTOM_WALLPAPER, custom: { key: 'nope' } })).toBe(DEFAULT_CHOICE);
    expect(resolveWallpaper({ choice: 42 })).toBe(DEFAULT_CHOICE);
  });
});

describe('a Vision area’s own photo', () => {
  it('is kept through parsing, and its keys are listed', () => {
    const config = parseGoalCategories({ added: [], hidden: [], areas: { Health: { photo: CUSTOM_AREA_PHOTO, photoImage: IMG }, Career: { photo: 'own-2', photoImage: { key: 'x' } } } });
    expect(config.areas?.health.photoImage?.key).toBe(IMG.key);
    expect(config.areas?.career.photoImage).toBeUndefined();
    expect(areaImageKeys(config)).toEqual([IMG.key, IMG.thumbKey]);
  });
});
