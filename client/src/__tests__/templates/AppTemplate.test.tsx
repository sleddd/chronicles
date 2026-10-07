import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { AppTemplate } from '@/components/templates/AppTemplate';
import { renderWithRouter as renderWithTheme } from '../testUtils';

vi.mock('@/components/organisms/Header', () => ({
  Header: () => <header data-testid="mock-header">Header</header>,
}));

vi.mock('@/components/organisms/Sidebar', () => ({
  Sidebar: () => <aside data-testid="mock-sidebar">Sidebar</aside>,
}));

vi.mock('@/components/organisms/Background', () => ({
  Background: () => <div data-testid="mock-background" />,
}));

vi.mock('@/stores/uiStore', () => ({
  useUIStore: vi.fn((selector: (s: any) => any) =>
    selector({ backgroundImage: '' })
  ),
}));

describe('AppTemplate', () => {
  it('renders the Header', () => {
    renderWithTheme(
      <AppTemplate>
        <div>content</div>
      </AppTemplate>
    );
    expect(screen.getByTestId('mock-header')).toBeInTheDocument();
  });

  it('renders the Sidebar by default', () => {
    renderWithTheme(
      <AppTemplate>
        <div>content</div>
      </AppTemplate>
    );
    expect(screen.getByTestId('mock-sidebar')).toBeInTheDocument();
  });

  it('hides the Sidebar when hideSidebar is true', () => {
    renderWithTheme(
      <AppTemplate hideSidebar>
        <div>content</div>
      </AppTemplate>
    );
    expect(screen.queryByTestId('mock-sidebar')).not.toBeInTheDocument();
  });

  it('renders the Background', () => {
    renderWithTheme(
      <AppTemplate>
        <div>content</div>
      </AppTemplate>
    );
    expect(screen.getByTestId('mock-background')).toBeInTheDocument();
  });

  it('renders children in the main content area', () => {
    renderWithTheme(
      <AppTemplate>
        <div data-testid="app-child">App content</div>
      </AppTemplate>
    );
    expect(screen.getByTestId('app-child')).toBeInTheDocument();
  });

  it('renders a main element', () => {
    renderWithTheme(
      <AppTemplate>
        <div>content</div>
      </AppTemplate>
    );
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('passes transparentContent without crashing', () => {
    renderWithTheme(
      <AppTemplate transparentContent>
        <div data-testid="transparent">transparent content</div>
      </AppTemplate>
    );
    expect(screen.getByTestId('transparent')).toBeInTheDocument();
  });
});
