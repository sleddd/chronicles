import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { useRef } from 'react';
import { useScrollMemory } from '@/hooks/useScrollMemory';

function Page({ ready = true }: { ready?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useScrollMemory(ref, 'test', ready);
  return <div ref={ref} data-testid="page" style={{ height: 100, overflowY: 'auto' }}><div style={{ height: 5000 }} /></div>;
}

describe('useScrollMemory', () => {
  beforeEach(() => { sessionStorage.clear(); window.history.replaceState(null, '', '/dashboard'); });

  it('left for the journal, the place is kept and put back on return (once)', () => {
    const first = render(<Page />);
    const page = first.getByTestId('page');
    page.scrollTop = 640;
    page.dispatchEvent(new Event('scroll'));
    window.history.replaceState(null, '', '/journal');
    first.unmount();
    expect(sessionStorage.getItem('scroll-memory:test')).toBe('640');

    window.history.replaceState(null, '', '/dashboard');
    const again = render(<Page />);
    expect(again.getByTestId('page').scrollTop).toBe(640);
    expect(sessionStorage.getItem('scroll-memory:test')).toBeNull();
  });

  it('left for anywhere else, the page opens at the top next time', () => {
    const first = render(<Page />);
    const page = first.getByTestId('page');
    page.scrollTop = 640;
    page.dispatchEvent(new Event('scroll'));
    window.history.replaceState(null, '', '/settings');
    first.unmount();
    expect(sessionStorage.getItem('scroll-memory:test')).toBeNull();
  });
});
