import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithTheme } from '../testUtils';
import { PillButton } from '@/components/atoms/PillButton';

describe('PillButton solid', () => {
  it('marks itself so the photo glass leaves it filled, and only the solid one', () => {
    renderWithTheme(<><PillButton $variant="solid">New task</PillButton><PillButton>Save</PillButton></>);
    expect(screen.getByRole('button', { name: 'New task' }).hasAttribute('data-solid')).toBe(true);
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('data-solid')).toBe(false);
  });
});
