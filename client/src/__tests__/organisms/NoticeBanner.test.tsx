import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const state = vi.hoisted(() => ({ notice: null as null | { message: string; linkUrl: string | null; updatedAt: string } }));
vi.mock('@/services/api', () => ({ notice: { get: vi.fn(async () => ({ notice: state.notice })) } }));

import { NoticeBanner } from '@/components/organisms/NoticeBanner';

describe('NoticeBanner', () => {
  beforeEach(() => { try { window.localStorage?.clear(); } catch { /* none in this environment */ } state.notice = null; });

  it('shows nothing when no notice is on', async () => {
    render(<NoticeBanner />);
    await Promise.resolve();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the notice, hides it when dismissed, and shows a changed one again', async () => {
    state.notice = { message: 'We are investigating a security issue.', linkUrl: 'https://example.com', updatedAt: '2026-10-18T00:00:00Z' };
    const { unmount } = render(<NoticeBanner />);
    expect(await screen.findByText('We are investigating a security issue.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Learn more' })).toHaveAttribute('href', 'https://example.com');
    fireEvent.click(screen.getByLabelText('Dismiss notice'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    unmount();
    state.notice = { ...state.notice, message: 'Update: fixed.', updatedAt: '2026-10-19T00:00:00Z' };
    render(<NoticeBanner />);
    expect(await screen.findByText('Update: fixed.')).toBeInTheDocument();
  });

  it('never renders a link that is not https://', async () => {
    state.notice = { message: 'Heads up.', linkUrl: 'javascript:alert(1)', updatedAt: '2026-10-20T00:00:00Z' };
    render(<NoticeBanner />);
    expect(await screen.findByText('Heads up.')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
