import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const state = vi.hoisted(() => ({ isAuthenticated: true, isUnlocked: true }));
const endSession = vi.hoisted(() => vi.fn());
const flushDrafts = vi.hoisted(() => vi.fn(async () => undefined));
const me = vi.hoisted(() => vi.fn(async () => ({})));
const lastRequest = vi.hoisted(() => ({ at: 0 }));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: state.isAuthenticated }) }));
vi.mock('@/contexts/EncryptionContext', () => ({ useEncryption: () => ({ isUnlocked: state.isUnlocked }) }));
vi.mock('@/hooks/useSignOut', () => ({ useEndSession: () => endSession }));
vi.mock('@/services/drafts', () => ({ flushDrafts }));
vi.mock('@/services/api', () => ({ auth: { me }, lastRequestTime: () => lastRequest.at }));

import { ACTIVITY_STORE_KEY, IDLE_NOTE, IDLE_SIGN_OUT_MS, isIdle, useIdleSignOut } from '@/hooks/useIdleSignOut';
import { ACTIVITY_EVENT, browserIsIdle, markActivity, resetActivityForTests } from '@/services/activity';

const MIN = 60_000;
const touch = () => act(() => { document.dispatchEvent(new Event('keydown')); });
const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe('isIdle', () => {
  it('goes by the latest sign of anyone, here or in another tab', () => {
    expect(isIdle(IDLE_SIGN_OUT_MS + 1, 0, 0)).toBe(true);
    expect(isIdle(IDLE_SIGN_OUT_MS, 0, 0)).toBe(false);
    expect(isIdle(20 * MIN, 0, 10 * MIN)).toBe(false);
    expect(isIdle(20 * MIN, 10 * MIN, 0)).toBe(false);
  });
});

describe('useIdleSignOut', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-15T10:00:00Z'));
    localStorage.clear();
    Object.assign(state, { isAuthenticated: true, isUnlocked: true });
    lastRequest.at = Date.now();
    endSession.mockClear(); flushDrafts.mockClear(); me.mockClear();
    // Signing in is someone being here (EncryptionContext marks it)
    resetActivityForTests();
    markActivity();
  });
  afterEach(() => { vi.useRealTimers(); });

  it('ends the session after 15 minutes with nobody there, sealing drafts first', async () => {
    renderHook(() => useIdleSignOut());
    await act(async () => { await vi.advanceTimersByTimeAsync(14 * MIN); });
    expect(endSession).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(2 * MIN); });
    await settle();
    expect(flushDrafts).toHaveBeenCalledTimes(1);
    expect(endSession).toHaveBeenCalledTimes(1);
    expect(endSession).toHaveBeenCalledWith(IDLE_NOTE);
  });

  it('someone at the page keeps it going', async () => {
    renderHook(() => useIdleSignOut());
    for (let i = 0; i < 6; i++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(10 * MIN); });
      touch();
    }
    expect(endSession).not.toHaveBeenCalled();
  });

  it('someone at ANOTHER Chronicles tab keeps this one going too', async () => {
    renderHook(() => useIdleSignOut());
    await act(async () => { await vi.advanceTimersByTimeAsync(12 * MIN); });
    localStorage.setItem(ACTIVITY_STORE_KEY, String(Date.now()));
    await act(async () => { await vi.advanceTimersByTimeAsync(12 * MIN); });
    expect(endSession).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(5 * MIN); });
    await settle();
    expect(endSession).toHaveBeenCalledTimes(1);
  });

  it('a laptop asleep for hours is signed out by the first thing that happens — the click that wakes it does not count as being there', async () => {
    renderHook(() => useIdleSignOut());
    // The clock moves on; no timer ran (the machine was asleep)
    vi.setSystemTime(new Date('2026-11-15T14:00:00Z'));
    touch();
    await settle();
    expect(endSession).toHaveBeenCalledTimes(1);
  });

  it('starting to watch is not activity: a tab that took the key from another tab doesn’t reset the clock', async () => {
    // Nobody has been here for 20 minutes (the tab that holds the key is about to sign out)
    vi.setSystemTime(new Date('2026-11-15T10:20:00Z'));
    renderHook(() => useIdleSignOut());
    expect(Number(localStorage.getItem(ACTIVITY_STORE_KEY))).toBe(new Date('2026-11-15T10:00:00Z').getTime());
    await act(async () => { await vi.advanceTimersByTimeAsync(11_000); });
    await settle();
    expect(endSession).toHaveBeenCalledTimes(1);
  });

  it('also checks when the page goes into the background (it must not stay signed in back there)', async () => {
    renderHook(() => useIdleSignOut());
    vi.setSystemTime(new Date('2026-11-15T10:20:00Z'));
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    await settle();
    expect(endSession).toHaveBeenCalledTimes(1);
  });

  it('typing with no key event (Scribble, on-screen suggestions, paste, IME) counts as being here', async () => {
    renderHook(() => useIdleSignOut());
    for (let i = 0; i < 4; i++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(10 * MIN); });
      act(() => { document.dispatchEvent(new Event(i % 2 ? 'input' : 'beforeinput')); });
    }
    expect(endSession).not.toHaveBeenCalled();
  });

  it('dictation counts as being here, though no key or pointer says so', async () => {
    renderHook(() => useIdleSignOut());
    for (let i = 0; i < 4; i++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(10 * MIN); });
      act(() => { window.dispatchEvent(new Event(ACTIVITY_EVENT)); });
    }
    expect(endSession).not.toHaveBeenCalled();
  });

  it('the browser counts as idle for a tab asked for the key, by the same clock', () => {
    expect(browserIsIdle()).toBe(false);
    vi.setSystemTime(new Date('2026-11-15T10:16:00Z'));
    expect(browserIsIdle()).toBe(true);
  });

  it('checks when the page comes back into view', async () => {
    renderHook(() => useIdleSignOut());
    vi.setSystemTime(new Date('2026-11-15T10:20:00Z'));
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    await settle();
    expect(endSession).toHaveBeenCalledTimes(1);
  });

  it('switching away and back within the time does nothing', async () => {
    renderHook(() => useIdleSignOut());
    await act(async () => { await vi.advanceTimersByTimeAsync(5 * MIN); });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    act(() => { window.dispatchEvent(new Event('focus')); });
    await settle();
    expect(endSession).not.toHaveBeenCalled();
  });

  it('ends once, however many checks fire', async () => {
    renderHook(() => useIdleSignOut());
    await act(async () => { await vi.advanceTimersByTimeAsync(30 * MIN); });
    touch(); touch();
    await settle();
    expect(endSession).toHaveBeenCalledTimes(1);
  });

  it('tells the server someone is there when nothing else has been sent for a while (reading a long entry)', async () => {
    renderHook(() => useIdleSignOut());
    for (let i = 0; i < 3; i++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(4 * MIN); });
      touch();
    }
    expect(me).toHaveBeenCalledTimes(1);
    // Not again straight away
    touch();
    expect(me).toHaveBeenCalledTimes(1);
  });

  it('does not ping while requests are going out anyway', async () => {
    renderHook(() => useIdleSignOut());
    for (let i = 0; i < 4; i++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(4 * MIN); });
      lastRequest.at = Date.now();
      touch();
    }
    expect(me).not.toHaveBeenCalled();
  });

  it('does nothing signed out, and stops watching when the session ends', async () => {
    state.isUnlocked = false;
    const { rerender, unmount } = renderHook(() => useIdleSignOut());
    await act(async () => { await vi.advanceTimersByTimeAsync(60 * MIN); });
    expect(endSession).not.toHaveBeenCalled();
    state.isUnlocked = true;
    rerender();
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(60 * MIN); });
    expect(endSession).not.toHaveBeenCalled();
  });
});
