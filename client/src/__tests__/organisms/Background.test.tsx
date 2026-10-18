import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '@shared/theme/tokens';
import { Background } from '@/components/organisms/Background';

describe('Background', () => {
  it('renders a plain canvas layer', () => {
    const { container } = render(<ThemeProvider theme={lightTheme}><Background /></ThemeProvider>);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toBeTruthy();
    expect(wrapper.children.length).toBe(0);
  });
});
