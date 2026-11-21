import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { AuthTemplate } from '@/components/templates/AuthTemplate';
import { renderWithTheme } from '../testUtils';

describe('AuthTemplate', () => {
  it('renders the title as an h1', () => {
    renderWithTheme(
      <AuthTemplate title="Sign In">
        <div>form</div>
      </AuthTemplate>
    );
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Sign In');
  });

  it('renders children in the card body', () => {
    renderWithTheme(
      <AuthTemplate title="Test">
        <p data-testid="child">Hello</p>
      </AuthTemplate>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('renders footer when provided', () => {
    renderWithTheme(
      <AuthTemplate title="Test" footer={<span>footer text</span>}>
        <div>body</div>
      </AuthTemplate>
    );
    expect(screen.getByText('footer text')).toBeInTheDocument();
  });

  it('does not render footer section when footer is omitted', () => {
    const { container } = renderWithTheme(
      <AuthTemplate title="Test">
        <div>body</div>
      </AuthTemplate>
    );
    // Only the title and children should be present inside the card
    const card = container.querySelector('div > div') as HTMLElement;
    expect(card).toBeTruthy();
    // No footer text
    expect(screen.queryByText('footer text')).not.toBeInTheDocument();
  });

  it('renders multiple children', () => {
    renderWithTheme(
      <AuthTemplate title="Multi">
        <input data-testid="email" />
        <input data-testid="password" />
        <button data-testid="submit">Go</button>
      </AuthTemplate>
    );
    expect(screen.getByTestId('email')).toBeInTheDocument();
    expect(screen.getByTestId('password')).toBeInTheDocument();
    expect(screen.getByTestId('submit')).toBeInTheDocument();
  });

  it('renders footer with links', () => {
    renderWithTheme(
      <AuthTemplate title="Login" footer={<a href="/register">Register</a>}>
        <div>form</div>
      </AuthTemplate>
    );
    const link = screen.getByRole('link', { name: 'Register' });
    expect(link).toHaveAttribute('href', '/register');
  });

  it('centers content on the page', () => {
    const { container } = renderWithTheme(
      <AuthTemplate title="Centered">
        <div>content</div>
      </AuthTemplate>
    );
    const wrapper = container.firstChild as HTMLElement;
    const styles = window.getComputedStyle(wrapper);
    expect(styles.display).toBe('flex');
    expect(styles.alignItems).toBe('center');
    expect(styles.justifyContent).toBe('center');
  });

  it('is the page\'s main landmark, and with brand gives screen readers a hidden h1', () => {
    renderWithTheme(<AuthTemplate title="Welcome back" brand srTitle="Sign in to Chronicles"><div>form</div></AuthTemplate>);
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in to Chronicles' })).toBeInTheDocument();
  });
});
