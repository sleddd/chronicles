import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { renderWithTheme } from '../testUtils';
import { FollowedShelves } from '@/components/organisms/FollowedShelves';

const T = 'abcdefghijklmnopqrstuvwxyz012345';
const MINE = 'ZYXWVUTSRQPONMLKJIHGFEDCBA_-9876';
const DEMO = 'demoshelfdemoshelfdemoshelf12345';

const setting = vi.hoisted(() => ({ value: [] as unknown, save: vi.fn() }));
vi.mock('@/hooks/useEncryptedSetting', () => ({
  useEncryptedSetting: () => [setting.value, setting.save, true],
}));
const api = vi.hoisted(() => ({ peek: vi.fn(), mine: vi.fn() }));
vi.mock('@/services/api', () => ({
  publicShelf: api,
  ApiError: class extends Error { constructor(public status: number, m: string) { super(m); } },
}));

const page = (title: string) => ({ title, items: [], page: 1, pages: 1, total: 0, updatedAt: '' });
const render = (props: Parameters<typeof FollowedShelves>[0] = {}) =>
  renderWithTheme(<MemoryRouter><FollowedShelves {...props} /></MemoryRouter>);

describe('FollowedShelves', () => {
  beforeEach(() => {
    setting.value = [];
    setting.save.mockReset().mockResolvedValue(undefined);
    api.peek.mockReset();
    api.mine.mockReset().mockResolvedValue({ publicShelf: null });
  });

  it('follows a pasted link, saving the shelf with its title', async () => {
    api.peek.mockResolvedValue(page('Sam’s shelf'));
    render();
    fireEvent.change(screen.getByLabelText('Public shelf link'), { target: { value: `https://x.test/public-shelf/${T}` } });
    fireEvent.click(screen.getByRole('button', { name: 'Follow' }));
    await waitFor(() => expect(setting.save).toHaveBeenCalled());
    expect(setting.save.mock.calls[0][0]).toEqual([expect.objectContaining({ token: T, title: 'Sam’s shelf' })]);
    expect(await screen.findByText('Following Sam’s shelf.')).toBeInTheDocument();
  });

  it('refuses something that isn’t a shelf link', () => {
    render();
    fireEvent.change(screen.getByLabelText('Public shelf link'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Follow' }));
    expect(screen.getByText(/doesn’t look like a public shelf link/)).toBeInTheDocument();
    expect(setting.save).not.toHaveBeenCalled();
  });

  it('won’t follow your own shelf (asked of the server at the time)', async () => {
    api.mine.mockResolvedValue({ publicShelf: { token: MINE } });
    render({ incoming: MINE });
    expect(await screen.findByText('That’s your own shelf.')).toBeInTheDocument();
    expect(setting.save).not.toHaveBeenCalled();
  });

  it('a stale copy of another account’s shelf doesn’t block following it', async () => {
    api.mine.mockResolvedValue({ publicShelf: { token: MINE } });
    api.peek.mockResolvedValue(page('Demo shelf'));
    render({ ownToken: DEMO, incoming: DEMO });
    expect(await screen.findByText('Following Demo shelf.')).toBeInTheDocument();
    expect(setting.save.mock.calls[0][0]).toEqual([expect.objectContaining({ token: DEMO })]);
  });

  it('lists followed shelves and unfollows one', async () => {
    setting.value = [{ token: T, title: 'Sam’s shelf', followedAt: '' }];
    api.peek.mockResolvedValue(page('Sam’s shelf'));
    render();
    expect(await screen.findByRole('heading', { name: 'Sam’s shelf' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Unfollow' }));
    await waitFor(() => expect(setting.save).toHaveBeenCalledWith([]));
  });
});
