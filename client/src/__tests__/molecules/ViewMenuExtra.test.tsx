import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithTheme } from '../testUtils';
import { ViewMenu } from '@/components/molecules/ViewMenu';

describe('ViewMenu with controls of the page', () => {
  it('opens to them above its items, as a dialog', () => {
    const onSelect = vi.fn();
    renderWithTheme(
      <ViewMenu label="View options" items={[{ label: 'Save view', icon: 'bookmark', onSelect }]}
        extra={<label>Type <select aria-label="Type"><option>All</option></select></label>} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'View options' }));
    expect(screen.getByRole('dialog', { name: 'View options' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Type' })).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save view' }));
    expect(onSelect).toHaveBeenCalled();
  });

  it('shows with only its controls, and stays hidden with nothing', () => {
    const { rerender } = renderWithTheme(<ViewMenu label="View options" items={[]} extra={<span>Group</span>} />);
    expect(screen.getByRole('button', { name: 'View options' })).toBeTruthy();
    rerender(<ViewMenu label="View options" items={[]} />);
    expect(screen.queryByRole('button', { name: 'View options' })).toBeNull();
  });
});
