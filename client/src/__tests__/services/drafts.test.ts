import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { DRAFT_DAYS, flushDrafts, onFlushDrafts, readDraft, removeDraft, saveDraft, type DraftCipher } from '@/services/drafts';

/** A real AES-GCM cipher under a throwaway key, bound to its AAD like the master key's */
async function cipher(): Promise<DraftCipher> {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const enc = new TextEncoder();
  return {
    encryptBytes: async (data, aad) => {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad ?? '') }, key, data);
      return { ciphertext, iv: btoa(String.fromCharCode(...iv)) };
    },
    decryptBytes: async (ciphertext, iv, aad) => crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: Uint8Array.from(atob(iv), c => c.charCodeAt(0)), additionalData: enc.encode(aad ?? '') }, key, ciphertext),
  };
}

const rawRow = (slot: string) => new Promise<{ ciphertext: ArrayBuffer } | undefined>((resolve, reject) => {
  const open = indexedDB.open('chronicles-drafts', 1);
  open.onsuccess = () => {
    const req = open.result.transaction('drafts', 'readonly').objectStore('drafts').get(slot);
    req.onsuccess = () => { open.result.close(); resolve(req.result); };
    req.onerror = () => reject(req.error);
  };
  open.onerror = () => reject(open.error);
});

describe('sealed drafts', () => {
  let c: DraftCipher;
  beforeEach(async () => {
    c = await cipher();
    await removeDraft('quick-entry');
    await removeDraft('journal');
  });

  it('comes back as it was written', async () => {
    const value = { topicId: 4, content: '<p>half a thought</p>', fields: { severity: 6 } };
    await saveDraft(c, 'quick-entry', value, 1_000);
    expect(await readDraft(c, 'quick-entry', 2_000)).toEqual({ value, savedAt: 1_000 });
  });

  it('is stored as ciphertext only: the writing is nowhere in what the browser keeps', async () => {
    await saveDraft(c, 'quick-entry', { content: 'the secret sentence' });
    const row = await rawRow('quick-entry');
    const bytes = new TextDecoder('latin1').decode(row!.ciphertext);
    expect(bytes).not.toContain('secret sentence');
  });

  it('opens only with the key that sealed it: anyone else’s is removed, not shown', async () => {
    await saveDraft(c, 'quick-entry', { content: 'mine' });
    const other = await cipher();
    expect(await readDraft(other, 'quick-entry')).toBeNull();
    expect(await rawRow('quick-entry')).toBeUndefined();
  });

  it('is kept when the key left the tab mid-read: that is the moment drafts exist for', async () => {
    await saveDraft(c, 'quick-entry', { content: 'still here' });
    const gone = { ...c, decryptBytes: async () => { throw new Error('Encryption not unlocked'); } };
    expect(await readDraft(gone, 'quick-entry')).toBeNull();
    expect(await rawRow('quick-entry')).toBeDefined();
    expect((await readDraft<{ content: string }>(c, 'quick-entry'))!.value.content).toBe('still here');
  });

  it('is bound to its slot: moved under another, it does not open', async () => {
    await saveDraft(c, 'quick-entry', { content: 'for the quick entry' });
    const row = await rawRow('quick-entry') as Record<string, unknown>;
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('chronicles-drafts', 1);
      open.onsuccess = () => {
        const tx = open.result.transaction('drafts', 'readwrite');
        tx.objectStore('drafts').put({ ...row, slot: 'journal' });
        tx.oncomplete = () => { open.result.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });
    expect(await readDraft(c, 'journal')).toBeNull();
  });

  it(`goes after ${DRAFT_DAYS} days`, async () => {
    await saveDraft(c, 'journal', { content: 'old' }, 0);
    expect(await readDraft(c, 'journal', DRAFT_DAYS * 86_400_000 - 1)).not.toBeNull();
    expect(await readDraft(c, 'journal', DRAFT_DAYS * 86_400_000 + 1)).toBeNull();
    expect(await rawRow('journal')).toBeUndefined();
  });

  it('a new draft replaces the old one, and removing leaves nothing', async () => {
    await saveDraft(c, 'journal', { content: 'first' });
    await saveDraft(c, 'journal', { content: 'second' });
    expect((await readDraft<{ content: string }>(c, 'journal'))!.value.content).toBe('second');
    await removeDraft('journal');
    expect(await readDraft(c, 'journal')).toBeNull();
  });

  it('flushes what forms still hold before the session is ended on purpose', async () => {
    let sealed = 0;
    const off = onFlushDrafts(async () => { sealed++; });
    const offFailing = onFlushDrafts(async () => { throw new Error('locked'); });
    await flushDrafts();
    expect(sealed).toBe(1);
    off();
    offFailing();
    await flushDrafts();
    expect(sealed).toBe(1);
  });
});
