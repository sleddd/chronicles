import { describe, it, expect, beforeEach } from 'vitest';
import { retagBrowser, ownerMark, claimBrowserFor, wipeBrowserData, RetiredKeyError } from '@/services/browserData';
import { EGRESS_STORE } from '@/services/deviceConsent';
import { SETTING_REVS_STORE } from '@/services/settingCipher';

// After a re-encryption the account's tag (from its key) is new: this browser's
// records move with it, so the next sign-in isn't taken for a stranger's
describe('retagBrowser', () => {
  beforeEach(() => localStorage.clear());

  it('moves the owner mark, the switches and the setting revisions to the new tag, leaving other accounts alone', async () => {
    localStorage.setItem('chronicles.owner-v1', await ownerMark('OLD'));
    localStorage.setItem(EGRESS_STORE, JSON.stringify({ 'OLD|calendarSyncEnabled': true, 'OTHER|icsFeedEnabled': true }));
    localStorage.setItem(SETTING_REVS_STORE, JSON.stringify({ 'OLD|aiConfig': 4 }));
    await retagBrowser('OLD', 'NEW');
    expect(localStorage.getItem('chronicles.owner-v1')).toBe(await ownerMark('NEW'));
    expect(JSON.parse(localStorage.getItem(EGRESS_STORE)!)).toEqual({ 'NEW|calendarSyncEnabled': true, 'OTHER|icsFeedEnabled': true });
    expect(JSON.parse(localStorage.getItem(SETTING_REVS_STORE)!)).toEqual({ 'NEW|aiConfig': 4 });
  });

  it('never claims a browser marked for someone else', async () => {
    localStorage.setItem('chronicles.owner-v1', await ownerMark('SOMEONE'));
    await retagBrowser('OLD', 'NEW');
    expect(localStorage.getItem('chronicles.owner-v1')).toBe(await ownerMark('SOMEONE'));
  });
});

// A re-key is for when someone may hold the old key. A server can still hand
// out an old wrap of it (an old passkey's secret never changes), so the old
// key must never be installed in this browser again
describe('a key the journal has left', () => {
  beforeEach(() => localStorage.clear());

  it('is refused at sign-in after the re-key, before anything is wiped or claimed', async () => {
    localStorage.setItem('chronicles.owner-v1', await ownerMark('OLD'));
    await retagBrowser('OLD', 'NEW');
    await expect(claimBrowserFor('OLD')).rejects.toBeInstanceOf(RetiredKeyError);
    // Still the new key's browser: nothing was wiped, nothing re-claimed
    expect(localStorage.getItem('chronicles.owner-v1')).toBe(await ownerMark('NEW'));
    // The new key signs in as before
    expect(await claimBrowserFor('NEW')).toBe(false);
  });

  it('stays refused after the browser is wiped (Sign out, or someone else signing in)', async () => {
    localStorage.setItem('chronicles.owner-v1', await ownerMark('OLD'));
    await retagBrowser('OLD', 'NEW');
    await wipeBrowserData();
    await expect(claimBrowserFor('OLD')).rejects.toBeInstanceOf(RetiredKeyError);
  });

  it('a key that was never retired is claimed as usual', async () => {
    expect(await claimBrowserFor('FRESH')).toBe(true);
  });
});
