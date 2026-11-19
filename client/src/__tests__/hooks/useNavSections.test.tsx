import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { useNavSections, resetNavSections } from '@/hooks/useNavSections';

/* A real router, so the address actually changes: a section's row opens it and keeps it open
   through the page change it starts; any other page change closes it */
function Nav() {
  const sections = useNavSections();
  const navigate = useNavigate();
  return (
    <div>
      <p data-testid="open">{['health', 'planning'].filter(k => sections.isOpen(k)).join(',') || 'none'}</p>
      <button onClick={() => { sections.openWith('health', '/health'); navigate('/health'); }}>Health row</button>
      <button onClick={() => sections.toggle('health')}>Health arrow</button>
      <button onClick={() => sections.toggle('planning')}>Planning arrow</button>
      <button onClick={() => navigate('/health/symptoms')}>Symptoms view</button>
    </div>
  );
}

const renderAt = (path: string) => render(<MemoryRouter initialEntries={[path]}><Nav /></MemoryRouter>);
const open = () => screen.getByTestId('open').textContent;

describe('useNavSections', () => {
  beforeEach(() => { localStorage.clear(); resetNavSections(); });

  it('starts closed and forgets the old remembered sections', () => {
    localStorage.setItem('nav-sections-open-v1', '{"health":true}');
    renderAt('/health');
    expect(open()).toBe('none');
    expect(localStorage.getItem('nav-sections-open-v1')).toBeNull();
  });

  it('a section’s row keeps it open through the page change it starts', () => {
    renderAt('/journal');
    fireEvent.click(screen.getByText('Health row'));
    expect(open()).toBe('health');
  });

  it('a section’s row on its own page opens it, and the next page change closes it', () => {
    renderAt('/health');
    fireEvent.click(screen.getByText('Health row'));
    expect(open()).toBe('health');
    fireEvent.click(screen.getByText('Symptoms view'));
    expect(open()).toBe('none');
  });

  it('going to a page closes a section opened by its arrow', () => {
    renderAt('/journal');
    fireEvent.click(screen.getByText('Health arrow'));
    expect(open()).toBe('health');
    fireEvent.click(screen.getByText('Symptoms view'));
    expect(open()).toBe('none');
  });

  it('stays open when the new page mounts its own nav (every page has its own rail)', () => {
    // A different component per page, as the templates do: the open section must survive the remount
    const PageA = () => <div><Nav /></div>;
    const PageB = () => <section><Nav /></section>;
    render(
      <MemoryRouter initialEntries={['/journal']}>
        <Routes>
          <Route path="/journal" element={<PageA />} />
          <Route path="/health/*" element={<PageB />} />
        </Routes>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText('Health row'));
    expect(open()).toBe('health');
    fireEvent.click(screen.getByText('Symptoms view'));
    expect(open()).toBe('none');
  });

  it('one at a time: opening another closes the first, and the arrow closes its own', () => {
    renderAt('/journal');
    fireEvent.click(screen.getByText('Health arrow'));
    fireEvent.click(screen.getByText('Planning arrow'));
    expect(open()).toBe('planning');
    fireEvent.click(screen.getByText('Planning arrow'));
    expect(open()).toBe('none');
  });
});
