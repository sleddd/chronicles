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
  it('water and sleep have only their tap icons: no figure, + / − or slider', () => {
    setup();
    expect(screen.queryByRole('button', { name: /one glass of water|one hour of sleep/ })).toBeNull();
    expect(screen.queryByLabelText('3 glasses of water')).toBeNull();
    expect(screen.queryByRole('slider')).toBeNull();
  });

  it('sleep is eight night icons, a tap setting the hours', () => {
    const { onSleep } = setup(3, 6);
    const hours = screen.getAllByRole('button', { name: /^Hour \d of 8$/ });
    expect(hours).toHaveLength(8);
    expect(hours.filter(h => h.getAttribute('aria-pressed') === 'true')).toHaveLength(6);
    fireEvent.click(screen.getByRole('button', { name: 'Hour 8 of 8' }));
    expect(onSleep).toHaveBeenCalledWith(8);
    fireEvent.click(screen.getByRole('button', { name: 'Hour 6 of 8' }));
    expect(onSleep).toHaveBeenCalledWith(5);
  });

  it('water is a row of glasses, one per glass of the goal; sleep keeps its slider', () => {
    const { onWater, onSleep } = setup();
    const glasses = screen.getAllByRole('button', { name: /^Glass \d of 8$/ });
    expect(glasses).toHaveLength(8);
    expect(glasses.map(g => g.getAttribute('aria-pressed'))).toEqual(['true', 'true', 'true', 'false', 'false', 'false', 'false', 'false']);
    fireEvent.click(screen.getByRole('button', { name: 'Glass 6 of 8' }));
    expect(onWater).toHaveBeenCalledWith(6);
  });

  it('tapping the last full glass again takes it away', () => {
    const { onWater } = setup(3);
    fireEvent.click(screen.getByRole('button', { name: 'Glass 3 of 8' }));
    expect(onWater).toHaveBeenCalledWith(2);
    fireEvent.click(screen.getByRole('button', { name: 'Glass 1 of 8' }));
    expect(onWater).toHaveBeenCalledWith(1);
  });

  it('past the goal every glass shows as drunk, with no count', () => {
    setup(10);
    expect(screen.getAllByRole('button', { name: /^Glass \d of 8$/ }).every(g => g.getAttribute('aria-pressed') === 'true')).toBe(true);
    expect(screen.queryByText('+2')).toBeNull();
  });
});

describe('WellnessPanel mood', () => {
  it('the faces run worst to happiest; Calm, Stressed and Sick report 6, 7 and 8', () => {
    const onMood = vi.fn();
    render(<WellnessPanel water={0} sleep={0} mood={7} flow=""
      onWater={vi.fn()} onSleep={vi.fn()} onMood={onMood} onFlow={vi.fn()} quad />);
    const faces = screen.getAllByRole('button', { name: /^Mood: / }).map(b => b.getAttribute('aria-label'));
    expect(faces).toEqual(['Mood: Sick', 'Mood: Very low', 'Mood: Stressed', 'Mood: Low', 'Mood: Okay', 'Mood: Calm', 'Mood: Good', 'Mood: Great']);
    expect(screen.getByRole('button', { name: 'Mood: Stressed' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Mood: Sick' }));
    expect(onMood).toHaveBeenCalledWith(8);
    fireEvent.click(screen.getByRole('button', { name: 'Mood: Stressed' }));
    expect(onMood).toHaveBeenCalledWith(0);
    fireEvent.click(screen.getByRole('button', { name: 'Mood: Great' }));
    expect(onMood).toHaveBeenCalledWith(5);
    fireEvent.click(screen.getByRole('button', { name: 'Mood: Very low' }));
    expect(onMood).toHaveBeenCalledWith(1);
  });
});
