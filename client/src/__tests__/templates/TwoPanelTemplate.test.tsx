import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { TwoPanelTemplate } from '@/components/templates/TwoPanelTemplate';
import { renderWithRouter as renderWithTheme } from '../testUtils';

vi.mock('@/components/organisms/Header', () => ({
  Header: () => <header data-testid="mock-header">Header</header>,
}));

vi.mock('@/components/organisms/Background', () => ({
  Background: () => <div data-testid="mock-background" />,
}));

describe('TwoPanelTemplate', () => {
  it('renders the Header', () => {
    renderWithTheme(
      <TwoPanelTemplate>
        <div>panel</div>
      </TwoPanelTemplate>
    );
    expect(screen.getByTestId('mock-header')).toBeInTheDocument();
  });

  it('renders the Background', () => {
    renderWithTheme(
      <TwoPanelTemplate>
        <div>panel</div>
      </TwoPanelTemplate>
    );
    expect(screen.getByTestId('mock-background')).toBeInTheDocument();
  });

  it('renders children in the body area', () => {
    renderWithTheme(
      <TwoPanelTemplate>
        <div data-testid="left">Left</div>
        <div data-testid="right">Right</div>
      </TwoPanelTemplate>
    );
    expect(screen.getByTestId('left')).toBeInTheDocument();
    expect(screen.getByTestId('right')).toBeInTheDocument();
  });
});
