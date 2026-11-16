import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary.js';
import { isReservedImportColumn } from '../../utils/csv.js';
import { latestOpenList } from '../../utils/kitchen.js';

const Boom = (): never => { throw new Error('secret entry text'); };

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('ErrorBoundary', () => {
  it('shows a way on instead of a blank page, without the error text', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary fallback="page" resetKey="/dashboard" links={[{ to: '/settings', label: 'Settings' }]}><Boom /></ErrorBoundary>);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Reload')).toBeTruthy();
    expect(screen.getByText('Settings').getAttribute('href')).toBe('/settings');
    expect(document.body.textContent).not.toContain('secret entry text');
  });

  it('a floating extra that fails is just not shown', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(<div><ErrorBoundary fallback="none"><Boom /></ErrorBoundary><p>page</p></div>);
    expect(container.textContent).toBe('page');
  });

  it('tries again at another address', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = render(<ErrorBoundary fallback="page" resetKey="/a"><Boom /></ErrorBoundary>);
    expect(screen.queryByRole('alert')).toBeTruthy();
    rerender(<ErrorBoundary fallback="page" resetKey="/b"><p>fine</p></ErrorBoundary>);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('fine')).toBeTruthy();
  });
});

describe('an import cannot put text where the app keeps a list', () => {
  it('leaves out columns named like a list field', () => {
    for (const name of ['items', 'scheduleTimes', 'ScheduleTimes', 'repeatDays', 'checklist', 'steps', '__proto__']) {
      expect(isReservedImportColumn(name)).toBe(true);
    }
    expect(isReservedImportColumn('Author')).toBe(false);
    expect(isReservedImportColumn('severity')).toBe(false);
  });

  it('a shopping list whose items are not a list reads as empty, not an error', () => {
    const entry = { id: 1, content: '', createdAt: new Date(), updatedAt: new Date(), isEncrypted: true, metadata: { _taxonomyId: 5, _customFields: { items: 'x' } } };
    expect(latestOpenList([entry as never], 5)?.id).toBe(1);
  });
});
