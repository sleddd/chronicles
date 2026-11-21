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
  [...container.querySelectorAll<HTMLElement>(`[data-day="${day}"] i`)].map(el => parseFloat(el.style.top));

describe('PlannerBoard', () => {
  it('a crowded hour stretches only its own day', () => {
    // Five tasks at 8 AM on Monday, nothing on Tuesday
    const busy = [1, 2, 3, 4, 5].map(i => card(i, '2026-11-23', 8 * 60));
    const { container } = render([lane('2026-11-23', busy), lane('2026-11-24', [])]);
    const mon = lineTops('2026-11-23', container);
    const tue = lineTops('2026-11-24', container);
    // Tuesday keeps the plain scale: 9 AM an hour (60px) under 8 AM
    expect(tue[1] - tue[0]).toBe(60);
    // Monday's 8 AM grew to hold its five cards
    expect(mon[1] - mon[0]).toBeGreaterThan(60);
  });

  it('labels the hours on a day whose scale no longer lines up with the left', () => {
    const busy = [1, 2, 3, 4, 5].map(i => card(i, '2026-11-23', 8 * 60));
    const { container } = render([lane('2026-11-23', busy), lane('2026-11-24', [])]);
    const monday = container.querySelector('[data-day="2026-11-23"]')!;
    const tuesday = container.querySelector('[data-day="2026-11-24"]')!;
    expect(monday.querySelectorAll('[data-lane-hour]').length).toBeGreaterThan(0);
    expect(tuesday.querySelectorAll('[data-lane-hour]').length).toBe(0);
  });
});
