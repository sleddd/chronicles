import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// A reversible stand-in for the master key (the real cipher is tested in services/drafts)
const cipher = vi.hoisted(() => ({
  isUnlocked: true,
  encryptBytes: async (data: ArrayBuffer) => ({ ciphertext: data.slice(0), iv: 'iv' }),
  decryptBytes: async (data: ArrayBuffer) => data,
}));
vi.mock('@/contexts/EncryptionContext', () => ({ useEncryption: () => cipher }));

import { useSealedDraft } from '@/hooks/useSealedDraft';
import { flushDrafts, readDraft, removeDraft, saveDraft } from '@/services/drafts';

const stored = async () => { const d = await readDraft<{ value: { text: string }; older?: { value: { text: string } } }>(cipher, 'slot'); return d ? { value: d.value.value, older: d.value.older?.value } : null; };
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

describe('useSealedDraft', () => {
  beforeEach(async () => { cipher.isUnlocked = true; await removeDraft('slot'); });
  afterEach(() => { vi.useRealTimers(); });

  it('seals what is typed a moment after the pause, and removes it once nothing is unsaved', async () => {
    const { rerender } = renderHook(({ text }) => useSealedDraft('slot', () => (text ? { text } : null), [text]), { initialProps: { text: '' } });
    await wait(50);
    rerender({ text: 'half a thou' });
    rerender({ text: 'half a thought' });
    expect(await stored()).toBeNull(); // not on every keystroke
    await wait(2200);
    expect((await stored())?.value).toEqual({ text: 'half a thought' });
    rerender({ text: '' }); // saved as an entry, or emptied
    await wait(2200);
    expect(await stored()).toBeNull();
  }, 15_000);

  it('offers a draft found from before, and new typing never costs it: both are kept', async () => {
    await saveDraft(cipher, 'slot', { value: { text: 'from yesterday' } }, Date.now() - 60_000);
    const { result, rerender, unmount } = renderHook(({ text }) => useSealedDraft<{ text: string }>('slot', () => (text ? { text } : null), [text]), { initialProps: { text: '' } });
    await waitFor(() => expect(result.current.found?.value).toEqual({ text: 'from yesterday' }));
    // The person ignores the offer and writes something else, then walks away
    rerender({ text: 'something new' });
    await wait(2200);
    expect(await stored()).toEqual({ value: { text: 'something new' }, older: { text: 'from yesterday' } });
    unmount();

    // Next time the new writing is offered first, then the one from yesterday
    const again = renderHook(({ text }) => useSealedDraft<{ text: string }>('slot', () => (text ? { text } : null), [text]), { initialProps: { text: '' } });
    await waitFor(() => expect(again.result.current.found?.value).toEqual({ text: 'something new' }));
    act(() => { again.result.current.discard(); });
    expect(again.result.current.found?.value).toEqual({ text: 'from yesterday' });
    await wait(50);
    expect(await stored()).toEqual({ value: { text: 'from yesterday' }, older: undefined });
    act(() => { again.result.current.taken(); });
    expect(again.result.current.found).toBeNull();
  }, 15_000);

  it('a save followed by leaving the page at once leaves no draft of the saved entry', async () => {
    const { rerender, unmount } = renderHook(({ text }) => useSealedDraft('slot', () => (text ? { text } : null), [text]), { initialProps: { text: '' } });
    await wait(50);
    rerender({ text: 'written, then saved' });
    await wait(2200);
    expect((await stored())?.value).toEqual({ text: 'written, then saved' });
    // Saved (nothing unsaved any more) and the form unmounts before the two seconds are up
    rerender({ text: '' });
    unmount();
    await wait(100);
    expect(await stored()).toBeNull();
  }, 10_000);

  it('unsaved writing is sealed when the form goes away before the pause is up', async () => {
    const { rerender, unmount } = renderHook(({ text }) => useSealedDraft('slot', () => (text ? { text } : null), [text]), { initialProps: { text: '' } });
    await wait(50);
    rerender({ text: 'typed, then navigated away' });
    unmount();
    await wait(100);
    expect((await stored())?.value).toEqual({ text: 'typed, then navigated away' });
  });

  it('clear() removes the draft at once after a save, keeping one still on offer', async () => {
    await saveDraft(cipher, 'slot', { value: { text: 'offered' } }, Date.now() - 60_000);
    const { result, rerender } = renderHook(({ text }) => useSealedDraft<{ text: string }>('slot', () => (text ? { text } : null), [text]), { initialProps: { text: '' } });
    await waitFor(() => expect(result.current.found).not.toBeNull());
    rerender({ text: 'new entry' });
    await wait(2200);
    act(() => { result.current.clear(); });
    await wait(50);
    expect(await stored()).toEqual({ value: { text: 'offered' }, older: undefined });
    // …and with nothing on offer it goes entirely
    act(() => { result.current.discard(); });
    await wait(50);
    rerender({ text: '' });
    act(() => { result.current.clear(); });
    await wait(50);
    expect(await stored()).toBeNull();
  }, 10_000);

  it('Discard throws the found draft away', async () => {
    await saveDraft(cipher, 'slot', { value: { text: 'unwanted' } });
    const { result } = renderHook(() => useSealedDraft<{ text: string }>('slot', () => null, []));
    await waitFor(() => expect(result.current.found).not.toBeNull());
    act(() => { result.current.discard(); });
    expect(result.current.found).toBeNull();
    await wait(50);
    expect(await stored()).toBeNull();
  });

  it('seals at once when the session is about to be ended on purpose', async () => {
    const { rerender } = renderHook(({ text }) => useSealedDraft('slot', () => (text ? { text } : null), [text]), { initialProps: { text: '' } });
    await wait(50);
    rerender({ text: 'typed just before 15 minutes away' });
    await act(async () => { await flushDrafts(); });
    expect((await stored())?.value).toEqual({ text: 'typed just before 15 minutes away' });
  });

  it('does nothing without the key', async () => {
    cipher.isUnlocked = false;
    const { result, rerender } = renderHook(({ text }) => useSealedDraft('slot', () => (text ? { text } : null), [text]), { initialProps: { text: '' } });
    rerender({ text: 'typed while signed out' });
    await wait(2200);
    expect(result.current.found).toBeNull();
    expect(await stored()).toBeNull();
  }, 10_000);
});
