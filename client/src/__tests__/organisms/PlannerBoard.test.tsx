import { describe, it, expect, vi } from 'vitest';
import { renderWithTheme } from '../testUtils';
import { PlannerBoard, type PlannerCard, type PlannerLane } from '@/components/organisms/PlannerBoard';

const card = (id: number, day: string, at: number): PlannerCard => ({ id, title: `Task ${id}`, done: false, day, hours: 0.25, at });
const lane = (day: string, cards: PlannerCard[]): PlannerLane => ({ day, label: day, today: false, events: [], cards });

function render(lanes: PlannerLane[]) {
  return renderWithTheme(
    <PlannerBoard lanes={lanes} overdue={[]} open={[]} onOpen={vi.fn()} onSchedule={vi.fn()} onOpenEvent={vi.fn()} onAdd={vi.fn()} onResize={vi.fn()} />,
  );
}
/** The top of each hour line down a day, in px */
const lineTops = (day: string, container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>(`[data-day="${day}"] [data-hour-line]`)].map(el => parseFloat(el.style.top));

/** Where a task card sits: its top, height, left and width as drawn */
const placeOf = (id: number, container: HTMLElement) => {
  const el = container.querySelector<HTMLElement>(`[data-plan-card="${id}"]`)!;
  return { top: parseFloat(el.style.top), height: parseFloat(el.style.height), left: el.style.left, width: el.style.width };
};

describe('PlannerBoard', () => {
  it('keeps one hour scale on every day, however crowded', () => {
    // Five tasks at 8 AM on Monday, nothing on Tuesday
    const busy = [1, 2, 3, 4, 5].map(i => card(i, '2026-11-23', 8 * 60));
    const { container } = render([lane('2026-11-23', busy), lane('2026-11-24', [])]);
    const mon = lineTops('2026-11-23', container);
    const tue = lineTops('2026-11-24', container);
    expect(mon[1] - mon[0]).toBe(60);
    expect(mon).toEqual(tue);
  });

  it('draws a card at its time, as tall as its length', () => {
    const { container } = render([lane('2026-11-23', [{ ...card(1, '2026-11-23', 10 * 60), hours: 2 }])]);
    // 8 AM is the top of the scale: 10 AM is 120px down, less nothing; 2 hours is 120px, less 6px top and bottom
    expect(placeOf(1, container)).toMatchObject({ top: 126, height: 108 });
  });

  it('puts overlapping cards side by side, and a card on its own across the whole day', () => {
    const { container } = render([lane('2026-11-23', [
      { ...card(1, '2026-11-23', 9 * 60), hours: 2 },
      { ...card(2, '2026-11-23', 10 * 60), hours: 1 },
      { ...card(3, '2026-11-23', 14 * 60), hours: 1 },
    ])]);
    expect(placeOf(1, container)).toMatchObject({ left: 'calc(0% + 4px)', width: 'calc(50% - 8px)' });
    expect(placeOf(2, container)).toMatchObject({ left: 'calc(50% + 4px)', width: 'calc(50% - 8px)' });
    expect(placeOf(3, container)).toMatchObject({ left: 'calc(0% + 4px)', width: 'calc(100% - 8px)' });
  });
});
