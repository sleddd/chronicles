import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithTheme } from '../testUtils';

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => true })); // phones / tablets: the top-bar bell
vi.mock('@/contexts/EncryptionContext', () => ({ useEncryption: () => ({ isUnlocked: true }) }));
const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
const store = {
  featureFlags: { financeEnabled: true },
  allTopics: [{ id: 1, name: 'Task' }, { id: 2, name: 'Meeting' }],
  decryptedEntries: [
    { id: 70, content: '<p>File taxes</p>', metadata: { _taxonomyId: 1, _customFields: { taskDescription: 'File taxes', deadline: today, isCompleted: false } } },
    { id: 71, content: '<p>Retro</p>', metadata: { _taxonomyId: 2, _customFields: { meetingName: 'Retro', startDate: today, startTime: '23:58' } } },
  ],
};
vi.mock('@/stores/entriesStore', () => {
  const useEntriesStore = (sel: (s: unknown) => unknown) => sel(store);
  useEntriesStore.getState = () => store;
  return { useEntriesStore };
});
const saveFields = vi.fn().mockResolvedValue(true);
vi.mock('@/hooks/useSaveFields', () => ({ useSaveFields: () => saveFields }));
vi.mock('@/hooks/useOpenInJournal', () => ({ useOpenInJournal: () => vi.fn() }));
const saveBill = vi.fn().mockResolvedValue(undefined);
const electric = { id: 'b1', name: 'Electric', kind: 'bill', amountCents: 9500, frequency: 'monthly', dueDate: today, status: 'active', payments: [] };
vi.mock('@/hooks/useFinance', () => ({ useFinance: () => ({ records: [electric], save: saveBill }) }));
const doses = [
  { medicationPostId: 1, medicationName: 'Oregano oil', dosage: '1 drop', time: '00:00' },
  { medicationPostId: 2, medicationName: 'Vitamin D', dosage: '', time: '23:59' },
];
const setTaken = vi.fn().mockResolvedValue(undefined);
vi.mock('@/hooks/useTodayDoses', () => ({ useTodayDoses: () => ({ loaded: true, scheduled: doses, isTaken: () => false, setTaken }) }));
const setDone = vi.fn().mockResolvedValue(undefined);
const slots = [{ key: 'b|x|00:01', time: '00:01', routine: { id: 9, name: 'Ocean breathing', minutes: 5, items: [] } }];
vi.mock('@/hooks/useRoutineChecklist', () => ({ useRoutineChecklist: () => ({ slots, isDone: () => false, setDone }) }));

import { NotificationBell } from '@/components/organisms/NotificationBell';

describe('NotificationBell', () => {
  beforeEach(() => { setTaken.mockClear(); setDone.mockClear(); localStorage.removeItem('chronicles.reminders-dismissed-v1'); });

  it('counts what\'s due and lists it, with the rest of today', () => {
    renderWithTheme(<NotificationBell variant="bar" />);
    const bell = screen.getByRole('button', { name: /Reminders, \d+ due/ });
    fireEvent.click(bell);
    expect(screen.getByRole('dialog', { name: 'Reminders' })).toBeInTheDocument();
    expect(screen.getByText('Due now')).toBeInTheDocument();
    expect(screen.getByText('Oregano oil')).toBeInTheDocument();
    expect(screen.getByText('Ocean breathing')).toBeInTheDocument();
    expect(screen.getByText('Later today')).toBeInTheDocument();
    expect(screen.getByText('Vitamin D')).toBeInTheDocument();
  });

  it('ticks a dose or a session from the panel', async () => {
    renderWithTheme(<NotificationBell variant="bar" />);
    fireEvent.click(screen.getByRole('button', { name: /Reminders/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Take: Oregano oil at 12:00 AM' }));
    await waitFor(() => expect(setTaken).toHaveBeenCalledWith(doses[0], true));
    fireEvent.click(screen.getByRole('button', { name: 'Done: Ocean breathing at 12:01 AM' }));
    await waitFor(() => expect(setDone).toHaveBeenCalledWith(slots[0], true));
  });

  it('shows only the bell for the current layout', () => {
    renderWithTheme(<NotificationBell variant="rail" />);
    expect(screen.queryByRole('button', { name: /Reminders/ })).not.toBeInTheDocument();
  });

  it('dismisses a reminder for today without ticking it, and Dismiss all clears what\'s due', () => {
    renderWithTheme(<NotificationBell variant="bar" />);
    fireEvent.click(screen.getByRole('button', { name: /Reminders, \d+ due/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss Oregano oil at 12:00 AM for today' }));
    expect(screen.queryByText('Oregano oil')).not.toBeInTheDocument();
    expect(setTaken).not.toHaveBeenCalled();
    expect(screen.queryByText('Oregano oil')).not.toBeInTheDocument();
    // Remembered in this browser for today
    expect(JSON.parse(localStorage.getItem('chronicles.reminders-dismissed-v1')!).keys).toContain('med-1-00:00');
  });

  it('Dismiss all hides everything due', () => {
    renderWithTheme(<NotificationBell variant="bar" />);
    fireEvent.click(screen.getByRole('button', { name: /Reminders, \d+ due/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss all' }));
    expect(screen.getByText('You’re all caught up.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reminders' })).toBeInTheDocument();
    expect(screen.getByText('Vitamin D')).toBeInTheDocument(); // later today stays
    expect(screen.getByText('Retro')).toBeInTheDocument();
  });

  it('lists a task and a bill due today, and Done / Paid act on them', async () => {
    renderWithTheme(<NotificationBell variant="bar" />);
    fireEvent.click(screen.getByRole('button', { name: /Reminders, \d+ due/ }));
    expect(screen.getByText('File taxes')).toBeInTheDocument();
    expect(screen.getAllByText(/Due today/)).toHaveLength(2); // the task and the bill
    expect(screen.getByText('Electric')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Done: File taxes' }));
    await waitFor(() => expect(saveFields).toHaveBeenCalled());
    expect(saveFields.mock.calls[0][1]).toMatchObject({ isCompleted: true });
    fireEvent.click(screen.getByRole('button', { name: 'Paid: Electric' }));
    await waitFor(() => expect(saveBill).toHaveBeenCalled());
    expect(saveBill.mock.calls[0][0].payments).toHaveLength(1);
  });

  it('shows a meeting later today with Open', () => {
    renderWithTheme(<NotificationBell variant="bar" />);
    fireEvent.click(screen.getByRole('button', { name: /Reminders/ }));
    expect(screen.getByRole('button', { name: 'Open: Retro at 11:58 PM' })).toBeInTheDocument();
  });

  it('closes from the × in its head', () => {
    renderWithTheme(<NotificationBell variant="bar" />);
    fireEvent.click(screen.getByRole('button', { name: /Reminders/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Close reminders' }));
    expect(screen.queryByRole('dialog', { name: 'Reminders' })).not.toBeInTheDocument();
  });
});

