import React from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { MemoryRouter } from 'react-router-dom';
import { lightTheme } from '@shared/theme/tokens';

/**
 * Custom render that wraps components in styled-components ThemeProvider.
 */
export function renderWithTheme(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <ThemeProvider theme={lightTheme}>{children}</ThemeProvider>;
  }
  return render(ui, { wrapper: Wrapper, ...options });
}

/**
 * Theme + in-memory router, for components that use router hooks
 * (useNavigate / useLocation) directly or through their children.
 */
export function renderWithRouter(
  ui: React.ReactElement,
  { route = '/', ...options }: Omit<RenderOptions, 'wrapper'> & { route?: string } = {}
) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <ThemeProvider theme={lightTheme}>
        <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
      </ThemeProvider>
    );
  }
  return render(ui, { wrapper: Wrapper, ...options });
}

export { lightTheme };
