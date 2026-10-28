import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, act, waitFor } from '@testing-library/react';
import { renderWithTheme } from '../testUtils';

let heard: ((text: string) => void) | null = null;
const dictation = { isSupported: true, isListening: false, interimText: '', error: null, startListening: vi.fn(), stopListening: vi.fn() };
vi.mock('@/hooks/useDictation', () => ({
  useDictation: ({ onFinalResult }: { onFinalResult: (t: string) => void }) => { heard = onFinalResult; return dictation; },
}));
const saveCommand = vi.fn().mockResolvedValue({ id: 42, estimated: false });
vi.mock('@/hooks/useSaveCommand', () => ({ useSaveCommand: () => saveCommand, JOURNAL_PLACEHOLDER_ID: -1 }));
const setTaken = vi.fn().mockResolvedValue(undefined);
const taken = new Set<string>();
const scheduledDoses = [
  { medicationPostId: 70, medicationName: 'Oregano oil', dosage: '', time: '08:00' },
  { medicationPostId: 70, medicationName: 'Oregano oil', dosage: '', time: '20:00' },
];
vi.mock('@/hooks/useTodayDoses', () => ({
  DOSES_CHANGED: 'chronicles:doses-changed',
  useTodayDoses: () => ({ loaded: true, scheduled: scheduledDoses, isTaken: (d: { time: string }) => taken.has(d.time), setTaken }),
}));
const setDone = vi.fn().mockResolvedValue(undefined);
const breathing = { id: 80, name: 'Ocean breathing', items: [] };
vi.mock('@/hooks/useRoutineChecklist', () => ({
  useRoutineChecklist: () => ({
    routines: [breathing],
    slots: [{ routine: breathing, time: '19:00', key: 'b2' }, { routine: breathing, time: '07:00', key: 'b1' }],
    isDone: (s: { key: string }) => s.key === 'b1',
    setDone,
  }),
}));
let aiReady = false;
vi.mock('@/hooks/useAiReady', () => ({ useAiReady: () => aiReady }));
const openInJournal = vi.fn();
vi.mock('@/hooks/useOpenInJournal', () => ({ useOpenInJournal: () => openInJournal }));
const storeState = {
  addDecryptedEntry: () => {},
  topics: [{ id: 1, name: 'Task' }, { id: 3, name: 'Mantra' }, { id: 4, name: 'Goal' }, { id: 11, name: 'Meals' }, { id: 12, name: 'Shopping List' }],
  decryptedEntries: [
    { id: 50, content: '<p>Chronicles</p>', createdAt: '2026-10-01', metadata: { _taxonomyId: 4, _customFields: { goalObjective: 'Chronicles' } } },
    { id: 90, content: "<p>My to do's</p>", createdAt: '2026-10-20', metadata: { _taxonomyId: 1, _customFields: {
      taskDescription: "My to do's", taskFormat: 'list',
      checklist: [{ id: 'c1', text: 'Laundry', done: false }, { id: 'c2', text: 'Dishes', done: false }],
    } } },
    { id: 91, content: '<p>Shopping list created on Oct 25</p>', createdAt: '2026-10-25', metadata: { _taxonomyId: 12, _customFields: {
      items: [{ id: 's1', name: 'Raspberries', category: 'other', checked: false }],
    } } },
  ],
};
vi.mock('@/stores/entriesStore', () => {
  const useEntriesStore = (sel: (s: unknown) => unknown) => sel(storeState);
  useEntriesStore.getState = () => storeState;
  return { useEntriesStore };
});
const encryptNewPost = vi.fn().mockResolvedValue({ id: 99, contentEncrypted: 'c', contentIv: 'i', metadataEncrypted: 'm', metadataIv: 'v' });
vi.mock('@/contexts/EncryptionContext', () => ({ useEncryption: () => ({ encryptNewPost }) }));
const createEntry = vi.fn().mockResolvedValue({ id: 99, createdAt: '2026-10-27T10:00:00Z' });
vi.mock('@/services/api', () => ({ entries: { create: (...a: unknown[]) => createEntry(...a) }, doses: { logAsNeeded: vi.fn(), remove: vi.fn() } }));
vi.mock('@/utils/getOrCreateJournalTopic', () => ({ getOrCreateTopic: vi.fn().mockResolvedValue(13) }));
const saveFields = vi.fn().mockResolvedValue(true);
vi.mock('@/hooks/useSaveFields', () => ({ useSaveFields: () => saveFields }));

import { VoiceCommand, useVoiceSession } from '@/components/organisms/VoiceCommand';

/* The dashboard's wiring: a Voice button that opens the panel and starts the mic in one tap */
function Harness() {
  const voice = useVoiceSession();
  return (
    <>
      <button type="button" onClick={() => (voice.open ? voice.close() : voice.openAndListen())}>Voice</button>
      {voice.open && <VoiceCommand session={voice} />}
    </>
  );
}
const openVoice = () => {
  renderWithTheme(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Voice' }));
};

describe('VoiceCommand', () => {
  beforeEach(() => { saveCommand.mockClear(); openInJournal.mockClear(); dictation.startListening.mockClear(); dictation.stopListening.mockClear(); });

  it('opens and starts listening in one tap, and closing stops it', () => {
    openVoice();
    expect(dictation.startListening).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('region', { name: 'Voice command' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close voice command' }));
    expect(dictation.stopListening).toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: 'Voice command' })).not.toBeInTheDocument();
  });

  it('shows what it heard as an editable sentence and a preview, then saves it', async () => {
    openVoice();
    act(() => heard!('add task call the dentist'));
    act(() => heard!('high priority'));
    expect(screen.getByLabelText('What you said')).toHaveValue('add task call the dentist high priority');
    expect(screen.getByText('Task')).toBeInTheDocument();
    expect(screen.getByText(/High priority/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveCommand).toHaveBeenCalledWith({ id: 1, name: 'Task' }, 'Call the dentist | priority: high', {}));
    expect(await screen.findByText('Saved to Task.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(openInJournal).toHaveBeenCalledWith(42);
  });

  it('saves straight away on "… and save", and on "save" said on its own', async () => {
    openVoice();
    act(() => heard!('add mantra I am enough and save'));
    await waitFor(() => expect(saveCommand).toHaveBeenCalledWith({ id: 3, name: 'Mantra' }, 'I am enough', {}));
    saveCommand.mockClear();
    act(() => heard!('add task water the plants'));
    act(() => heard!('save'));
    await waitFor(() => expect(saveCommand).toHaveBeenCalledWith({ id: 1, name: 'Task' }, 'Water the plants', {}));
  });

  it('lets the sentence be fixed by hand before saving', async () => {
    openVoice();
    fireEvent.change(screen.getByLabelText('What you said'), { target: { value: 'add mantra breathe' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveCommand).toHaveBeenCalledWith({ id: 3, name: 'Mantra' }, 'Breathe', {}));
  });

  it('links a task to a goal said by name, and saves the link', async () => {
    openVoice();
    act(() => heard!('add task fix the delete option part of chronicles'));
    expect(screen.getByText(/Part of goal: Chronicles/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveCommand).toHaveBeenCalledWith(
      { id: 1, name: 'Task' }, 'Fix the delete option', { extraFields: { parentGoalId: 50 } },
    ));
  });

  it('says so when no goal has that name', () => {
    openVoice();
    act(() => heard!('add task tidy desk part of spring cleaning'));
    expect(screen.getByText(/No goal or milestone called “spring cleaning”/)).toBeInTheDocument();
  });

  it('saves "add todo list …" as a to-do list with its items', async () => {
    openVoice();
    act(() => heard!('add todo list title my list first item laundry second item dishes'));
    expect(screen.getByText(/2 items: Laundry, Dishes/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveCommand).toHaveBeenCalled());
    const [topic, text, opts] = saveCommand.mock.calls[0];
    expect(topic).toEqual({ id: 1, name: 'Task' });
    expect(text).toBe('My list');
    expect(opts.extraFields.taskFormat).toBe('list');
    expect(opts.extraFields.checklist.map((i: { text: string; done: boolean }) => [i.text, i.done])).toEqual([['Laundry', false], ['Dishes', false]]);
  });

  it('asks the AI for a meal\'s nutrients when In-App AI is set up, and says so', async () => {
    aiReady = true;
    saveCommand.mockResolvedValueOnce({ id: 7, estimated: true });
    openVoice();
    act(() => heard!('log meal breakfast eggs and toast'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveCommand).toHaveBeenCalledWith({ id: 11, name: 'Meals' }, 'Eggs and toast | meal: breakfast', { estimateNutrition: true }));
    expect(await screen.findByText('Saved to Meals with AI nutrient estimates.')).toBeInTheDocument();
    aiReady = false;
  });

  it('"mark oregano oil taken" ticks today\'s next untaken dose, with Undo', async () => {
    taken.clear(); taken.add('08:00'); setTaken.mockClear();
    const changed = vi.fn();
    window.addEventListener('chronicles:doses-changed', changed);
    openVoice();
    act(() => heard!('mark oregano oil taken'));
    await waitFor(() => expect(setTaken).toHaveBeenCalledWith(scheduledDoses[1], true));
    expect(saveCommand).not.toHaveBeenCalled();
    expect(await screen.findByText(/Marked Oregano oil \(8:00 PM\) taken\./)).toBeInTheDocument();
    expect(changed).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(setTaken).toHaveBeenCalledWith(scheduledDoses[1], false));
    window.removeEventListener('chronicles:doses-changed', changed);
  });

  it('says so when every dose is already ticked', async () => {
    taken.clear(); taken.add('08:00'); taken.add('20:00'); setTaken.mockClear();
    openVoice();
    act(() => heard!('I took my oregano oil'));
    expect(await screen.findByText('All of today’s Oregano oil doses are already ticked.')).toBeInTheDocument();
    expect(setTaken).not.toHaveBeenCalled();
  });

  it('"mark exercise ocean breathing" ticks the next session not done yet', async () => {
    setDone.mockClear();
    openVoice();
    act(() => heard!('mark exercise ocean breathing'));
    await waitFor(() => expect(setDone).toHaveBeenCalledWith(expect.objectContaining({ key: 'b2' }), true));
    expect(await screen.findByText(/Marked Ocean breathing \(7:00 PM\) done\./)).toBeInTheDocument();
  });

  it('says when nothing has that name', async () => {
    openVoice();
    act(() => heard!('mark juggling done'));
    expect(await screen.findByText(/Nothing on your medications or exercise schedule called “juggling”/)).toBeInTheDocument();
  });

  it('"cross laundry off to-do list titled my to do\'s" ticks that item, with Undo', async () => {
    saveFields.mockClear();
    openVoice();
    act(() => heard!("Cross laundry off to-do list titled my to do's"));
    await waitFor(() => expect(saveFields).toHaveBeenCalled());
    const [entry, cf] = saveFields.mock.calls[0];
    expect(entry.id).toBe(90);
    expect(cf.checklist).toEqual([{ id: 'c1', text: 'Laundry', done: true }, { id: 'c2', text: 'Dishes', done: false }]);
    expect(await screen.findByText("Crossed Laundry off My to do's.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(saveFields).toHaveBeenCalledTimes(2));
    expect(saveFields.mock.calls[1][1].checklist[0].done).toBe(false);
  });

  it('"cross raspberries off active shopping list" ticks it on the newest open list', async () => {
    saveFields.mockClear();
    openVoice();
    act(() => heard!('cross raspberries off active shopping list'));
    await waitFor(() => expect(saveFields).toHaveBeenCalled());
    const [entry, cf] = saveFields.mock.calls[0];
    expect(entry.id).toBe(91);
    expect(cf.items[0]).toMatchObject({ name: 'Raspberries', checked: true });
  });

  it('adds an item to a list said by name', async () => {
    saveFields.mockClear();
    openVoice();
    act(() => heard!("add vacuum to my to do's"));
    await waitFor(() => expect(saveFields).toHaveBeenCalled());
    expect(saveFields.mock.calls[0][1].checklist.map((i: { text: string }) => i.text)).toEqual(['Laundry', 'Dishes', 'Vacuum']);
    expect(await screen.findByText("Added Vacuum to My to do's.")).toBeInTheDocument();
  });

  it('treats "add … to …" as an ordinary save when no list has that name', async () => {
    saveFields.mockClear();
    openVoice();
    act(() => heard!('add task send the report to the board'));
    await waitFor(() => expect(screen.getByLabelText('What you said')).toHaveValue('add task send the report to the board'));
    expect(saveFields).not.toHaveBeenCalled();
  });

  it('"add priority call the bank" adds to the current priorities list', async () => {
    saveFields.mockClear();
    storeState.topics.push({ id: 13, name: 'Priorities' });
    storeState.decryptedEntries.push({ id: 95, content: '<p>Priorities: 10/26/2026</p>', createdAt: '2026-10-26', metadata: { _taxonomyId: 13, _customFields: {
      priorities: [{ id: 'p1', text: 'Pay rent', done: false }],
    } } } as never);
    openVoice();
    act(() => heard!('add priority call the bank'));
    await waitFor(() => expect(saveFields).toHaveBeenCalled());
    expect(saveFields.mock.calls[0][0].id).toBe(95);
    expect(saveFields.mock.calls[0][1].priorities.map((i: { text: string }) => i.text)).toEqual(['Pay rent', 'Call the bank']);
    expect(await screen.findByText('Added Call the bank to your priorities.')).toBeInTheDocument();
    storeState.topics.pop();
    storeState.decryptedEntries.pop();
  });

  it('starts a priorities list when there is none', async () => {
    createEntry.mockClear();
    openVoice();
    act(() => heard!('add priority call the bank'));
    await waitFor(() => expect(createEntry).toHaveBeenCalled());
    const metadata = encryptNewPost.mock.calls.at(-1)![1];
    expect(metadata._customFields.priorities.map((i: { text: string }) => i.text)).toEqual(['Call the bank']);
    expect(encryptNewPost.mock.calls.at(-1)![0]).toMatch(/^<p>Priorities: \d\d\/\d\d\/\d{4}<\/p>$/);
  });
});

