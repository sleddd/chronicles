import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { ViewHeader } from '@/components/molecules/ViewHeader';
import { renderWithTheme } from '../testUtils';

describe('ViewHeader', () => {
  it('renders the title', () => {
    renderWithTheme(<ViewHeader title="Settings" />);
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('renders a subtitle after the title', () => {
    renderWithTheme(<ViewHeader title="Health" subtitle="Meals" />);
    expect(screen.getByText('Health')).toBeInTheDocument();
    expect(screen.getByText('Meals')).toBeInTheDocument();
  });

  it('renders right slot content', () => {
    renderWithTheme(
      <ViewHeader title="Settings" right={<span data-testid="right">Action</span>} />,
    );
    expect(screen.getByTestId('right')).toBeInTheDocument();
  });
});
