import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { EntryBreadcrumb } from '@/components/molecules/EntryBreadcrumb';
import { getEntryTrail } from '@/utils/topicBreadcrumb';
import { renderWithTheme } from '../testUtils';

describe('EntryBreadcrumb', () => {
  it('derives ancestors from the topic', () => {
    renderWithTheme(<EntryBreadcrumb trail={getEntryTrail('Recipe')} onNavigate={() => {}} />);
    expect(screen.getByLabelText('Entry location')).toBeInTheDocument();
    expect(screen.getByText('From the Kitchen')).toBeInTheDocument();
  });

  it('navigates when an ancestor crumb is clicked', () => {
    const onNavigate = vi.fn();
    renderWithTheme(<EntryBreadcrumb trail={getEntryTrail('Recipe')} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText('From the Kitchen'));
    expect(onNavigate).toHaveBeenCalledWith('/kitchen');
  });

  it('renders crumbs as non-clickable without onNavigate', () => {
    renderWithTheme(<EntryBreadcrumb trail={getEntryTrail(null)} />);
    expect(screen.getByText('Journal')).toBeDisabled();
  });
});
