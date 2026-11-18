import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '@shared/theme/tokens';

const createEntry = vi.fn(async () => 99);
const saveFields = vi.fn(async () => true);

vi.mock('@/hooks/useCreateEntry', () => ({ useCreateEntry: () => createEntry }));
vi.mock('@/hooks/useSaveFields', () => ({ useSaveFields: () => saveFields }));
vi.mock('@/hooks/useOpenInJournal', () => ({ useOpenInJournal: () => vi.fn() }));
vi.mock('@/hooks/useFinance', () => ({ useFinance: () => ({ records: [] }) }));
vi.mock('@/hooks/useEncryptedSetting', () => ({ useEncryptedSetting: (_k: string, d: unknown) => [d, vi.fn(), true] }));
let doseGroups: { time: string; doses: Record<string, unknown>[] }[] = [];
vi.mock('@/hooks/useTodayDoses', () => ({
  useTodayDoses: () => ({ day: new Date().toISOString().slice(0, 10), groups: doseGroups, taken: 0, isTaken: () => false, shiftDay: vi.fn(), setTaken: vi.fn() }),
}));
vi.mock('@/hooks/useRoutineChecklist', () => ({ useRoutineChecklist: () => ({ slots: [], isDone: () => false }) }));

import { DayGlance } from '@/components/organisms/DayGlance';
import { useEntriesStore } from '@/stores/entriesStore';
import { toDateStr } from '@/utils/dateUtils';

const today = toDateStr(new Date());

// jsdom's pointer events carry no coordinates: give them a MouseEvent's
if (!('PointerEvent' in window) || !new (window.PointerEvent as typeof MouseEvent)('pointermove', { clientX: 1 }).clientX) {
  (window as unknown as { PointerEvent: unknown }).PointerEvent = class extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: MouseEventInit & { pointerId?: number } = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; }
  };
}
const task = (id: number, title: string, fields: Record<string, unknown>) => ({
  id, content: `<p>${title}</p>`, isEncrypted: true, createdAt: new Date(), updatedAt: new Date(),
  metadata: { _taxonomyId: 5, _customFields: { taskDescription: title, isCompleted: false, ...fields } },
});

const renderGlance = (medsOn = false) => render(
  <ThemeProvider theme={lightTheme}><MemoryRouter>
    <DayGlance priorities={null} comingUp={null} financeOn={false} medsOn={medsOn} exerciseOn={false} />
  </MemoryRouter></ThemeProvider>,
);

describe('Your Agenda', () => {
  beforeEach(() => {
    createEntry.mockClear();
    doseGroups = [];
    saveFields.mockClear();
    useEntriesStore.setState({ allTopics: [{ id: 5, name: 'Task' }] as never, decryptedEntries: [] as never });
  });

  it('the + across from Schedule adds a task planned for the day, at the chosen time', async () => {
    renderGlance();
    fireEvent.click(screen.getByRole('button', { name: /add a task to today/i }));
    fireEvent.change(screen.getByLabelText('Task'), { target: { value: 'Call the bank' } });
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '10:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(createEntry).toHaveBeenCalled());
    expect(createEntry).toHaveBeenCalledWith(expect.objectContaining({ name: 'Task' }), 'Call the bank',
      expect.objectContaining({ scheduledDate: today, scheduledTime: '10:30', isBacklog: false, isCompleted: false }));
  });

  it('a task on the schedule has a tick to the left of its title that completes it', () => {
    useEntriesStore.setState({ decryptedEntries: [task(1, 'Write report', { scheduledDate: today, scheduledTime: '09:00' })] as never });
    renderGlance();
    const tick = screen.getByRole('checkbox', { name: 'Mark “Write report” done' });
    fireEvent.click(tick);
    expect(saveFields).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), expect.objectContaining({ isCompleted: true }));
  });

  it('a done task stays on the schedule, ticked, so it can be undone', () => {
    useEntriesStore.setState({ decryptedEntries: [task(1, 'Write report', { scheduledDate: today, scheduledTime: '09:00', isCompleted: true })] as never });
    renderGlance();
    expect(screen.getByRole('checkbox', { name: 'Mark “Write report” not done' })).toHaveAttribute('aria-checked', 'true');
  });

  it('a task with no day can be dragged onto the schedule, which plans it at that time', () => {
    useEntriesStore.setState({ decryptedEntries: [task(2, 'Tidy desk', {})] as never });
    renderGlance();
    expect(screen.getByText('1 task with no day yet')).toBeInTheDocument();
    const grip = screen.getByRole('button', { name: 'Drag “Tidy desk” onto the schedule' });
    // jsdom has no layout: give the schedule a box and drop inside it
    const hours = document.querySelector('[style*="padding-top: 7px"]') as HTMLElement;
    hours.getBoundingClientRect = () => ({ left: 0, right: 600, top: 0, bottom: 2000, width: 600, height: 2000, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerDown(grip, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(grip, { clientX: 100, clientY: 300 });
    fireEvent.pointerUp(grip, { clientX: 100, clientY: 300 });
    expect(saveFields).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }),
      expect.objectContaining({ scheduledDate: today, scheduledTime: expect.stringMatching(/^\d{2}:\d{2}$/) }));
  });

  it('a long medications list stays within the screen and scrolls, so the last dose can be ticked', () => {
    doseGroups = Array.from({ length: 30 }, (_, i) => ({
      time: `${String(6 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`,
      doses: [{ medicationPostId: i + 1, medicationName: `Med ${i + 1}`, dosage: '1 tab', time: `${String(6 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}` }],
    }));
    renderGlance(true);
    fireEvent.click(screen.getByRole('button', { name: /^Medications: 0 of 30 taken/ }));
    const dialog = screen.getByRole('dialog', { name: /Medications today/ });
    // Capped to the room on screen, the rows in a scrolling body
    expect(parseFloat(dialog.style.maxHeight)).toBeLessThanOrEqual(window.innerHeight);
    const body = dialog.querySelector('h4 ~ div:last-child') as HTMLElement;
    expect(getComputedStyle(body).overflowY).toBe('auto');
    expect(body).toContainElement(screen.getByRole('checkbox', { name: 'Mark Med 30 taken' }));
  });
});
