import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { TopBarAction } from '@/components/organisms/TopBarAction';
import { registerTopBarSlot } from '@/stores/topBarSlotStore';

// Phones / tablets: the action goes to the top bar's slot
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => true }));

function Bar({ id }: { id: string }) {
  return <div data-testid={id} ref={registerTopBarSlot} />;
}

function Counter() {
  const [n, setN] = useState(0);
  return <button type="button" onClick={() => setN(n + 1)}>Clicked {n}</button>;
}

describe('TopBarAction', () => {
  it('follows the bar when a fresh one mounts, keeping the action (and its state) as it was', () => {
    const page = (bar: string | null) => <>{bar && <Bar key={bar} id={bar} />}<TopBarAction><Counter /></TopBarAction></>;
    const { rerender } = render(page('bar-1'));
    expect(screen.getByTestId('bar-1')).toContainElement(screen.getByRole('button'));
    fireEvent.click(screen.getByRole('button'));
    // The bar goes away (the journal's full-width editor) …
    rerender(page(null));
    // … and a new one comes back: the action moves into it, never remounted
    rerender(page('bar-2'));
    expect(screen.getByTestId('bar-2')).toContainElement(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveTextContent('Clicked 1');
  });
});
