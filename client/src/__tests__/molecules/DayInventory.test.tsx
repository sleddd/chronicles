import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { DayInventory, type DayInventoryValues } from '../../components/molecules/DayInventory';

const blank: DayInventoryValues = {
  sleepQuality: 0, wokeAtNight: null, dreamed: null, eating: '', workDay: 0, social: 0, procrastination: 0, stress: 0, notes: '',
};

function open(onChange: (p: Partial<DayInventoryValues>) => void, values = blank) {
  const view = render(<DayInventory values={values} onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: /your day/i }));
  return { ...view, box: screen.getByPlaceholderText('Anything else about today?') as HTMLTextAreaElement };
}

describe('DayInventory notes', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('hands the notes on once typing pauses, not on every keystroke', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const { box } = open(onChange);
    fireEvent.focus(box);
    for (const v of ['H', 'He', 'Hel', 'Hell', 'Hello']) fireEvent.change(box, { target: { value: v } });
    expect(onChange).not.toHaveBeenCalled();
    expect(box.value).toBe('Hello');
    act(() => { vi.advanceTimersByTime(800); });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ notes: 'Hello' });
  });

  it('keeps the draft while focused when an older saved value comes back', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const { box, rerender } = open(onChange);
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: 'Hello there' } });
    rerender(<DayInventory values={{ ...blank, notes: 'Hel' }} onChange={onChange} />);
    expect(box.value).toBe('Hello there');
  });

  it('sends what was typed when the box is left', () => {
    const onChange = vi.fn();
    const { box } = open(onChange);
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: 'Tired' } });
    fireEvent.blur(box);
    expect(onChange).toHaveBeenCalledWith({ notes: 'Tired' });
  });
});
