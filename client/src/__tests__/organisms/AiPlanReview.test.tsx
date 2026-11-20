import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithTheme } from '../testUtils';
import { AiPlanReview } from '@/components/organisms/AiPlanReview';
import { useEntriesStore } from '@/stores/entriesStore';
import { toDateStr } from '@/utils/dateUtils';
import { addDays } from '@/utils/planner';

const ai = vi.hoisted(() => ({ aiFeatureJson: vi.fn(), aiProviderName: () => 'OpenAI' }));
vi.mock('@/services/aiAssistant', () => ai);
vi.mock('@/services/flashNotice', () => ({ showFlash: vi.fn() }));
const saves = vi.hoisted(() => ({ saveFields: vi.fn(), createEntry: vi.fn() }));
vi.mock('@/hooks/useSaveFields', () => ({ useSaveFields: () => saves.saveFields }));
vi.mock('@/hooks/useCreateEntry', () => ({ useCreateEntry: () => saves.createEntry }));
vi.mock('@/hooks/useEncryptedSetting', () => ({
  useEncryptedSetting: (key: string) => [
    key === 'planningOrder'
      ? { goals: [11, 10] } // the person's board order: the book first
      : key === 'taskTypes' ? []
        : { added: [], hidden: [], vision: 'A calm, useful life', areas: { health: { vision: 'Strong at 70' } } },
    vi.fn(), true,
  ],
}));

const item = (id: number, title: string, fields: Record<string, unknown> = {}) => ({
  id, title, fields, entry: { id, content: `<p>${title}</p>`, metadata: {} }, createdDay: '2026-11-01', created: id,
});
const plan = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('@/hooks/usePlanData', () => ({ usePlanData: () => plan.value }));

const tomorrow = addDays(toDateStr(new Date()), 1);

describe('AiPlanReview', () => {
  beforeEach(() => {
    ai.aiFeatureJson.mockReset();
    saves.saveFields.mockReset().mockResolvedValue(true);
    saves.createEntry.mockReset().mockResolvedValue(99);
    useEntriesStore.setState({
      allTopics: [{ id: 5, name: 'Event' }],
      decryptedEntries: [{
        id: 30, content: '<p>Coffee with Sam</p>', isEncrypted: true, createdAt: new Date(), updatedAt: new Date(),
        metadata: { _taxonomyId: 5, _customFields: { eventName: 'Coffee with Sam', startDate: tomorrow, startTime: '10:00', endTime: '11:00', location: 'Secret place' } },
      }],
    } as never);
    plan.value = {
      goals: [
        { ...item(10, 'Get healthy', { notes: 'Slow and steady', targetDate: '2027-01-01' }), status: 'in_progress', category: 'Health' },
        { ...item(11, 'Write the book'), status: 'new', category: '' },
      ],
      milestones: [],
      tasks: [
        { ...item(1, 'Call the dentist', { priority: 'high', notes: 'Left a voicemail' }), completed: false, goalId: 10, milestoneId: null, category: 'Health' },
        { ...item(2, 'Sort the shed', { isBacklog: true }), completed: false, goalId: null, milestoneId: null, category: '' },
      ],
    };
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('asks before sending, naming tasks, goals and visions, and Cancel sends nothing', () => {
    const onClose = vi.fn();
    renderWithTheme(<AiPlanReview onClose={onClose} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Your unencrypted data is about to be shared with OpenAI.');
    expect(screen.getByText('2 unscheduled tasks, with status and notes')).toBeInTheDocument();
    expect(screen.getByText('2 goals, with notes, in your priority order')).toBeInTheDocument();
    expect(screen.getByText(/^1 event over the next 14 days/)).toBeInTheDocument();
    expect(screen.getByText('Your vision and 1 area vision')).toBeInTheDocument();
    expect(screen.getByText('Call the dentist')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(ai.aiFeatureJson).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the plan for review and saves only what stays ticked, through the usual saves', async () => {
    const local = vi.spyOn(Storage.prototype, 'setItem');
    ai.aiFeatureJson.mockResolvedValue(JSON.stringify({
      schedule: [{ id: 1, date: tomorrow, time: '09:00', hours: 1 }, { id: 2, date: tomorrow, time: '13:00', hours: 2 }],
      newTasks: [{ title: 'Book a check-up', goalId: 10, milestoneId: null, date: '', time: '', hours: 1, why: 'Moves the goal on.' }],
    }));
    const onClose = vi.fn();
    renderWithTheme(<AiPlanReview onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(await screen.findByText('Book a check-up')).toBeInTheDocument();
    expect(ai.aiFeatureJson.mock.calls[0][0]).toBe('aiPlan');
    expect(saves.saveFields).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('Call the dentist'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply 2 changes' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());

    // The idea was planned for its day and time, and is something to do now
    expect(saves.saveFields).toHaveBeenCalledTimes(1);
    const [entry, fields] = saves.saveFields.mock.calls[0] as [{ id: number }, Record<string, unknown>];
    expect(entry.id).toBe(2);
    expect(fields).toMatchObject({ scheduledDate: tomorrow, scheduledTime: '13:00', scheduledHours: 2, isBacklog: false });
    expect(saves.createEntry).toHaveBeenCalledWith({ name: 'Task', icon: 'circle-check' }, 'Book a check-up',
      expect.objectContaining({ taskDescription: 'Book a check-up', parentGoalId: 10, scheduledDate: '' }));
    // Nothing of the request or the answer was put in browser storage
    expect(local).not.toHaveBeenCalled();
  });

  it('says so when the AI returns nothing usable', async () => {
    ai.aiFeatureJson.mockResolvedValue('{"schedule":[{"id":555,"date":"2020-01-01"}],"newTasks":[]}');
    renderWithTheme(<AiPlanReview onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(await screen.findByText('The AI had nothing to suggest this time.')).toBeInTheDocument();
    expect(saves.saveFields).not.toHaveBeenCalled();
  });

  it('sends notes, goals in the person’s board order, and an event’s name and time only', async () => {
    ai.aiFeatureJson.mockResolvedValue('{}');
    renderWithTheme(<AiPlanReview onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(ai.aiFeatureJson).toHaveBeenCalled());
    const prompt = ai.aiFeatureJson.mock.calls[0][2] as string;
    const data = JSON.parse(prompt.replace(/<\/?data>/g, '')) as Record<string, Record<string, unknown>[]>;
    expect(data.goals.map(g => g.id)).toEqual([11, 10]);
    expect(data.tasks.find(t => t.id === 1)?.notes).toBe('Left a voicemail');
    expect(data.events).toEqual([{ id: 30, date: tomorrow, title: 'Coffee with Sam', from: '10:00', to: '11:00' }]);
    expect(prompt).not.toContain('Secret place');
  });

  it('offers goal changes and event moves for review: only event moves start unticked', async () => {
    ai.aiFeatureJson.mockResolvedValue(JSON.stringify({
      goalChanges: [
        { id: 10, targetDate: '2027-03-01', why: 'More room.' },
        { id: 11, title: 'Write the book.', category: 'growth', why: 'Tidier.' },
      ],
      newMilestones: [{ title: 'Outline done', goalId: 11, startOn: '', targetDate: '2026-12-31', why: 'A first step.' }],
      eventChanges: [{ id: 30, date: tomorrow, time: '15:00', why: 'Frees the morning.' }],
    }));
    const onClose = vi.fn();
    renderWithTheme(<AiPlanReview onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(await screen.findByText('Target: Jan 1, 2027 → Mar 1, 2027')).toBeInTheDocument();
    expect(screen.getByText('Rename: “Write the book” → “Write the book.”')).toBeInTheDocument();
    expect(screen.getByText('Category: none → Growth')).toBeInTheDocument();
    expect((screen.getByLabelText('Write the book') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Coffee with Sam') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText('Get healthy') as HTMLInputElement).checked).toBe(true);

    // Take the event move too
    fireEvent.click(screen.getByLabelText('Coffee with Sam'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply 4 changes' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());

    const saved = new Map(saves.saveFields.mock.calls.map(c => [(c[0] as { id: number }).id, c[1] as Record<string, unknown>]));
    expect(saved.get(10)).toMatchObject({ targetDate: '2027-03-01', notes: 'Slow and steady' });
    // The rename rewrites the goal's first line and its name field, and files it under the area
    expect(saved.get(11)).toMatchObject({ goalObjective: 'Write the book.', goalCategory: 'Growth' });
    expect(saves.saveFields.mock.calls.find(c => (c[0] as { id: number }).id === 11)?.[2]).toBe('<p>Write the book.</p>');
    // Only the event's time moved: everything else about it is as it was
    expect(saved.get(30)).toEqual({ eventName: 'Coffee with Sam', startDate: tomorrow, startTime: '15:00', endTime: '16:00', location: 'Secret place' });
    expect(saves.createEntry).toHaveBeenCalledWith({ name: 'Milestone', icon: 'flag' }, 'Outline done',
      expect.objectContaining({ milestoneObjective: 'Outline done', parentGoalId: 11, targetDate: '2026-12-31' }));
  });
});

