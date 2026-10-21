import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WellnessPanel } from '@/components/molecules/WellnessPanel';

function setup(water = 3, sleep = 6) {
  const onWater = vi.fn();
  const onSleep = vi.fn();
  render(<WellnessPanel water={water} sleep={sleep} mood={0} flow=""
    onWater={onWater} onSleep={onSleep} onMood={vi.fn()} onFlow={vi.fn()} quad />);
  return { onWater, onSleep };
}

describe('WellnessPanel water and sleep', () => {
  it('tapping the icon adds one', () => {
    const { onWater, onSleep } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Add one glass of water' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add one hour of sleep' }));
    expect(onWater).toHaveBeenCalledWith(4);
    expect(onSleep).toHaveBeenCalledWith(7);
  });

  it('the progress rule is a slider from 0 to the goal', () => {
    const { onWater, onSleep } = setup();
    const water = screen.getByRole('slider', { name: 'Water' }) as HTMLInputElement;
    expect(water.value).toBe('3');
    expect(water.max).toBe('8');
    fireEvent.change(water, { target: { value: '6' } });
    expect(onWater).toHaveBeenCalledWith(6);
    fireEvent.change(screen.getByRole('slider', { name: 'Sleep' }), { target: { value: '0' } });
    expect(onSleep).toHaveBeenCalledWith(0);
  });

  it('past the goal the slider sits at its end and the icon still adds', () => {
    const { onWater } = setup(10);
    const water = screen.getByRole('slider', { name: 'Water' }) as HTMLInputElement;
    expect(water.value).toBe('8');
    expect(water.getAttribute('aria-valuetext')).toBe('10 glasses of water');
    fireEvent.click(screen.getByRole('button', { name: 'Add one glass of water' }));
    expect(onWater).toHaveBeenCalledWith(11);
  });
});
