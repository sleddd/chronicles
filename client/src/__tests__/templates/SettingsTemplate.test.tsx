import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { SettingsTemplate } from '@/components/templates/SettingsTemplate';
import { renderWithRouter as renderWithTheme } from '../testUtils';

vi.mock('@/components/organisms/Header', () => ({
  Header: () => <header data-testid="mock-header">Header</header>,
}));

vi.mock('@/components/organisms/Background', () => ({
  Background: () => <div data-testid="mock-background" />,
}));

describe('SettingsTemplate', () => {
  it('renders the Header', () => {
    renderWithTheme(
      <SettingsTemplate title="Settings">
        <div>body</div>
      </SettingsTemplate>
    );
    expect(screen.getByTestId('mock-header')).toBeInTheDocument();
  });

  it('renders the Background', () => {
    renderWithTheme(
      <SettingsTemplate title="Settings">
        <div>body</div>
      </SettingsTemplate>
    );
    expect(screen.getByTestId('mock-background')).toBeInTheDocument();
  });

  it('renders the page title as an h1', () => {
    renderWithTheme(
      <SettingsTemplate title="Settings">
        <div>body</div>
      </SettingsTemplate>
    );
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Settings');
  });

  it('renders children inside the content area', () => {
    renderWithTheme(
      <SettingsTemplate title="Prefs">
        <div data-testid="settings-child">Timezone</div>
      </SettingsTemplate>
    );
    expect(screen.getByTestId('settings-child')).toBeInTheDocument();
  });

  it('does not render title heading when title is empty', () => {
    renderWithTheme(
      <SettingsTemplate title="">
        <div>body</div>
      </SettingsTemplate>
    );
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('renders multiple children', () => {
    renderWithTheme(
      <SettingsTemplate title="Settings">
        <section data-testid="section1">Account</section>
        <section data-testid="section2">Theme</section>
      </SettingsTemplate>
    );
    expect(screen.getByTestId('section1')).toBeInTheDocument();
    expect(screen.getByTestId('section2')).toBeInTheDocument();
  });
});
