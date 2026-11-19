import { describe, it, expect } from 'vitest';
import { shelfTokenFrom, followedShelvesOf, withFollowed, withoutFollowed, withTitle, isFollowing } from '@/utils/followedShelves';

const T = 'abcdefghijklmnopqrstuvwxyz012345';
const U = 'ZYXWVUTSRQPONMLKJIHGFEDCBA_-9876';

describe('followedShelves', () => {
  it('reads a token from a link or on its own', () => {
    expect(shelfTokenFrom(`https://mydailychronicles.com/public-shelf/${T}`)).toBe(T);
    expect(shelfTokenFrom(`  https://x.test/public-shelf/${T}?page=2 `)).toBe(T);
    expect(shelfTokenFrom(`/public-shelf/${T}#top`)).toBe(T);
    expect(shelfTokenFrom(T)).toBe(T);
    expect(shelfTokenFrom('https://x.test/share/abc')).toBeNull();
    expect(shelfTokenFrom('not a link')).toBeNull();
    expect(shelfTokenFrom('')).toBeNull();
  });

  it('follows once, newest first, and unfollows', () => {
    const now = new Date('2026-11-19T10:00:00Z');
    let list = withFollowed([], T, 'Olivia’s shelf', now);
    list = withFollowed(list, U, 'Sam’s shelf', now);
    expect(list.map(s => s.token)).toEqual([U, T]);
    expect(withFollowed(list, T, 'again')).toBe(list);
    expect(isFollowing(list, T)).toBe(true);
    expect(withoutFollowed(list, T).map(s => s.token)).toEqual([U]);
  });

  it('keeps titles current and leaves the list alone when unchanged', () => {
    const list = withFollowed([], T, 'Old');
    expect(withTitle(list, T, 'Old')).toBe(list);
    expect(withTitle(list, T, 'New')[0].title).toBe('New');
  });

  it('drops malformed and repeated rows', () => {
    expect(followedShelvesOf([{ token: T, title: 'A' }, { token: T, title: 'B' }, { token: 'bad' }, null, 'x'])).toEqual([
      { token: T, title: 'A', followedAt: '' },
    ]);
    expect(followedShelvesOf('nope')).toEqual([]);
  });
});
