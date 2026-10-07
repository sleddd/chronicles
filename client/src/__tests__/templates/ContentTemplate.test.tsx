import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { ContentTemplate } from '@/components/templates/ContentTemplate';
import { renderWithRouter as renderWithTheme } from '../testUtils';

vi.mock('@/components/organisms/Header', () => ({
  Header: () => <header data-testid="mock-header">Header</header>,
}));

vi.mock('@/components/organisms/Sidebar', () => ({
  Sidebar: () => <aside data-testid="mock-sidebar">Sidebar</aside>,
}));

vi.mock('@/components/organisms/MobileChrome', () => ({
  MobileChrome: () => <div data-testid="mock-mobile-chrome" />,
}));

vi.mock('@/components/organisms/Background', () => ({
  Background: () => <div data-testid="mock-background" />,
}));

vi.mock('@/stores/uiStore', () => ({
  useUIStore: vi.fn((selector: (s: any) => any) =>
    selector({ backgroundImage: '' })
  ),
}));

describe('ContentTemplate', () => {
  it('renders the Header', () => {
    renderWithTheme(
      <ContentTemplate>
        <div>content</div>
      </ContentTemplate>
    );
    expect(screen.getByTestId('mock-header')).toBeInTheDocument();
  });

  it('renders the Background', () => {
    renderWithTheme(
      <ContentTemplate>
        <div>content</div>
      </ContentTemplate>
    );
    expect(screen.getByTestId('mock-background')).toBeInTheDocument();
  });

  it('renders children in the main content area', () => {
    renderWithTheme(
      <ContentTemplate>
        <p data-testid="main-child">Main content</p>
      </ContentTemplate>
    );
    expect(screen.getByTestId('main-child')).toBeInTheDocument();
  });

  it('renders the nav sidebar by default', () => {
    renderWithTheme(
      <ContentTemplate>
        <div>content</div>
      </ContentTemplate>
    );
    expect(screen.getByTestId('mock-sidebar')).toBeInTheDocument();
  });

  it('hides the nav sidebar when hideSidebar is set', () => {
    renderWithTheme(
      <ContentTemplate hideSidebar>
        <div>content</div>
      </ContentTemplate>
    );
    expect(screen.queryByTestId('mock-sidebar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-mobile-chrome')).not.toBeInTheDocument();
  });

  it('renders multiple children', () => {
    renderWithTheme(
      <ContentTemplate>
        <div data-testid="child1">First</div>
        <div data-testid="child2">Second</div>
      </ContentTemplate>
    );
    expect(screen.getByTestId('child1')).toBeInTheDocument();
    expect(screen.getByTestId('child2')).toBeInTheDocument();
  });

  it('renders a main element for the content area', () => {
    renderWithTheme(
      <ContentTemplate>
        <div>main content</div>
      </ContentTemplate>
    );
    expect(screen.getByRole('main')).toBeInTheDocument();
  });
});
