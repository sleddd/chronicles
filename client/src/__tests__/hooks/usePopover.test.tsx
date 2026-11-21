import { describe, it, expect } from 'vitest';
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { usePopover } from '@/hooks/usePopover';

function Demo() {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  usePopover({ open, onClose: () => setOpen(false), triggerRef: trigger, panelRef: panel });
  return (
    <>
      <button ref={trigger} type="button" onClick={() => setOpen(o => !o)}>Open</button>
      <button type="button">Elsewhere</button>
      {open && createPortal(
        <div ref={panel} role="dialog">
          <button type="button">First</button>
          <button type="button" onClick={() => setOpen(false)}>Choose</button>
        </div>,
        document.body,
      )}
    </>
  );
}

describe('usePopover', () => {
  it('focuses the first thing in the panel and Escape returns to the trigger', () => {
    render(<Demo />);
    fireEvent.click(screen.getByText('Open'));
    expect(screen.getByText('First')).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Open')).toHaveFocus();
  });

  it('closes when focus moves elsewhere, leaving focus there', () => {
    render(<Demo />);
    fireEvent.click(screen.getByText('Open'));
    act(() => { screen.getByText('Elsewhere').focus(); });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Elsewhere')).toHaveFocus();
  });

  it('a choice made inside returns focus to the trigger', () => {
    render(<Demo />);
    fireEvent.click(screen.getByText('Open'));
    act(() => { screen.getByText('Choose').focus(); });
    fireEvent.click(screen.getByText('Choose'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Open')).toHaveFocus();
  });
});
