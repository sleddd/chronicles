import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/services/entryCache', () => ({ clearEntryCache: vi.fn().mockResolvedValue(undefined) }));

import { claimBrowserFor, ownerMark, wipeBrowserData } from '@/services/browserData';
import { clearEntryCache } from '@/services/entryCache';
import { EGRESS_STORE } from '@/services/deviceConsent';
import { SEEN_MARKERS_STORE, legacyMigrationAllowed } from '@/services/sealedFormats';
import { SETTING_REVS_STORE } from '@/services/settingCipher';

describe('whose browser is this? (the same person keeps what it stores, anyone else gets a clean one)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.mocked(clearEntryCache).mockClear();
  });

  it('the mark is made from the key’s tag, never holds it, and differs per account', async () => {
    const a = await ownerMark('tag-of-account-a');
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(a).not.toContain('tag-of-account-a');
    expect(await ownerMark('tag-of-account-a')).toBe(a);
    expect(await ownerMark('tag-of-account-b')).not.toBe(a);
  });

  it('the same person coming back keeps the cache, drafts and preferences', async () => {
    await claimBrowserFor('tag-a');
    localStorage.setItem('chronicles.theme-v1', 'dark');
    sessionStorage.setItem('planning-filters-v1', '{}');
    vi.mocked(clearEntryCache).mockClear();

    expect(await claimBrowserFor('tag-a')).toBe(false);
    expect(localStorage.getItem('chronicles.theme-v1')).toBe('dark');
    expect(sessionStorage.getItem('planning-filters-v1')).toBe('{}');
    expect(clearEntryCache).not.toHaveBeenCalled();
  });

  it('a different person gets everything wiped before anything loads', async () => {
    await claimBrowserFor('tag-a');
    localStorage.setItem('chronicles.reminders-dismissed-v1', '["dose:12"]');
    sessionStorage.setItem('planner-keyword-v1', 'divorce lawyer');

    expect(await claimBrowserFor('tag-b')).toBe(true);
    expect(localStorage.getItem('chronicles.reminders-dismissed-v1')).toBeNull();
    expect(sessionStorage.getItem('planner-keyword-v1')).toBeNull();
    expect(clearEntryCache).toHaveBeenCalled();
    // …and the browser is now theirs
    expect(await claimBrowserFor('tag-b')).toBe(false);
  });

  it('a browser with no mark (from before marks, or wiped by Sign out) is wiped too: its leftovers could be anyone’s', async () => {
    localStorage.setItem('journal-prompt-v1', '3');
    expect(await claimBrowserFor('tag-a')).toBe(true);
    expect(localStorage.getItem('journal-prompt-v1')).toBeNull();
  });

  it('a wipe keeps only the guards that hold no data', async () => {
    localStorage.setItem(EGRESS_STORE, '{"x":1}');
    localStorage.setItem(SEEN_MARKERS_STORE, '{"y":1}');
    localStorage.setItem(SETTING_REVS_STORE, '{"z":1}');
    localStorage.setItem('chronicles.owner-v1', 'someone');
    localStorage.setItem('chronicles.wallpaper-v1', 'photo');
    await wipeBrowserData();
    expect(localStorage.getItem(EGRESS_STORE)).toBe('{"x":1}');
    expect(localStorage.getItem(SEEN_MARKERS_STORE)).toBe('{"y":1}');
    expect(localStorage.getItem(SETTING_REVS_STORE)).toBe('{"z":1}');
    // Whose it was goes with the rest: the next sign-in starts clean
    expect(localStorage.getItem('chronicles.owner-v1')).toBeNull();
    expect(localStorage.getItem('chronicles.wallpaper-v1')).toBeNull();
  });

  describe('may this browser move older records over? (only if it knew the account before this sign-in)', () => {
    it('a browser claimed in this sign-in may not — nor may a second tab taking the key in it', async () => {
      await claimBrowserFor('tag-a', true);
      expect(legacyMigrationAllowed()).toBe(false);
      await claimBrowserFor('tag-a', false);
      expect(legacyMigrationAllowed()).toBe(false);
    });

    it('the next real sign-in finds the mark: from then on it may, tabs included', async () => {
      await claimBrowserFor('tag-a', true);
      await claimBrowserFor('tag-a', true);
      expect(legacyMigrationAllowed()).toBe(true);
      await claimBrowserFor('tag-a', false);
      expect(legacyMigrationAllowed()).toBe(true);
    });

    it('another person signing in starts over', async () => {
      await claimBrowserFor('tag-a', true);
      await claimBrowserFor('tag-a', true);
      await claimBrowserFor('tag-b', true);
      expect(legacyMigrationAllowed()).toBe(false);
    });
  });
});
