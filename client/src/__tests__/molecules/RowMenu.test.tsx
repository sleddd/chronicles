import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithTheme } from '../testUtils';
import { RowMenu } from '@/components/molecules/FinanceParts';

describe('RowMenu', () => {
  it('opens, runs an item and closes', () => {
    const pause = vi.fn();
    renderWithTheme(<RowMenu label="More actions for Rent" items={[{ label: 'Pause', onSelect: pause }]} />);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Rent' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Pause' }));
    expect(pause).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('asks for a second click before a confirmed item runs', () => {
    const del = vi.fn();
    renderWithTheme(<RowMenu label="More" items={[{ label: 'Delete', danger: true, confirmLabel: 'Click again to delete', onSelect: del }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(del).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Click again to delete' }));
    expect(del).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape and on an outside click', () => {
    renderWithTheme(<div><RowMenu label="More" items={[{ label: 'Pause', onSelect: () => {} }]} /><p>outside</p></div>);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.mouseDown(screen.getByText('outside'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
