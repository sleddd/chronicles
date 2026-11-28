import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const state = vi.hoisted(() => ({ changes: [] as { id: number; kind: string; extra: Record<string, unknown> | null }[] }));
vi.mock('@/services/api', () => ({
  assistantChanges: { list: vi.fn(async () => ({ changes: state.changes, more: false })) },
}));

import { AppDeletionsNotice } from '@/components/organisms/AppDeletionsNotice';

const show = () => render(<MemoryRouter><AppDeletionsNotice /></MemoryRouter>);

describe('AppDeletionsNotice', () => {
  beforeEach(() => { try { window.localStorage?.clear(); } catch { /* none here */ } state.changes = []; });

  it('says nothing when the app deleted nothing (its overwrites don’t count)', async () => {
    state.changes = [{ id: 3, kind: 'entry', extra: null }, { id: 2, kind: 'dose', extra: { date: '2026-11-27' } }];
    show();
    await Promise.resolve(); await Promise.resolve();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('counts the entries the app deleted, and stays dismissed until it deletes another', async () => {
    state.changes = [{ id: 9, kind: 'entry', extra: { deleted: true } }, { id: 8, kind: 'entry', extra: { deleted: true } }, { id: 7, kind: 'entry', extra: null }];
    const { unmount } = show();
    expect(await screen.findByText(/deleted 2 entries/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    unmount();
    const again = show();
    await Promise.resolve(); await Promise.resolve();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    again.unmount();
    state.changes = [{ id: 12, kind: 'entry', extra: { deleted: true } }, ...state.changes];
    show();
    expect(await screen.findByText(/deleted 3 entries/)).toBeInTheDocument();
  });
});
