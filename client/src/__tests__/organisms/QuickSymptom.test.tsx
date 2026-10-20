import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { QuickSymptom, QuickChange } from '@/components/organisms/HealthQuickLog';
import { renderWithTheme } from '../testUtils';

const create = vi.fn();
const addDecryptedEntry = vi.fn();
const openNew = vi.fn();

vi.mock('@/contexts/EncryptionContext', () => ({
  useEncryption: () => ({
    encryptNewPost: vi.fn(async () => ({ id: 7, contentEncrypted: 'c', contentIv: 'i', metadataEncrypted: 'm', metadataIv: 'j' })),
    encryptPost: vi.fn(),
  }),
}));
vi.mock('@/stores/entriesStore', () => {
  const state = { allTopics: [{ id: 3, name: 'Symptom' }, { id: 4, name: 'Changes' }], setTopics: vi.fn(), addDecryptedEntry: (e: unknown) => addDecryptedEntry(e) };
  const useEntriesStore = (sel: (s: typeof state) => unknown) => sel(state);
  useEntriesStore.getState = () => state;
  return { useEntriesStore };
});
vi.mock('@/services/api', () => ({
  entries: { create: (b: unknown) => create(b) },
  topics: { create: vi.fn() },
}));
vi.mock('@/hooks/useEncryptedSetting', () => ({
  useEncryptedSetting: () => [{ added: ['Hives'], hidden: ['Cough'] }, vi.fn(), true],
}));
vi.mock('@/hooks/useOpenInJournal', () => ({ useNewEntryInJournal: () => openNew }));
vi.mock('@/hooks/useAiReady', () => ({ useAiReady: () => false }));
vi.mock('@/components/organisms/FoodLog', () => ({ useFoodLogActions: () => ({}) }));

describe('QuickSymptom', () => {
  beforeEach(() => {
    create.mockReset().mockResolvedValue({ id: 7, createdAt: '2026-10-19T12:00:00Z' });
    addDecryptedEntry.mockReset();
  });

  it('logs tapped chips with severity and notes as a Symptom entry', async () => {
    renderWithTheme(<QuickSymptom />);
    expect(screen.getByRole('button', { name: 'Log symptom' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Hives' })).toBeInTheDocument(); // your own chip
    expect(screen.queryByRole('button', { name: 'Cough' })).toBeNull(); // hidden built-in
    fireEvent.click(screen.getByRole('button', { name: 'Flare day' }));
    fireEvent.click(screen.getByRole('button', { name: 'Runny nose' }));
    expect(screen.getByLabelText('Symptom')).toHaveValue('Flare day, Runny nose');
    fireEvent.click(screen.getByRole('radio', { name: 'Severity 7' }));
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'After lunch' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log symptom' }));

    await waitFor(() => expect(addDecryptedEntry).toHaveBeenCalled());
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ taxonomyIds: [3] }));
    const entry = addDecryptedEntry.mock.calls[0][0];
    expect(entry.content).toBe('<p>Flare day, Runny nose</p>');
    expect(entry.metadata._customFields).toMatchObject({ symptomName: 'Flare day, Runny nose', severity: 7, notes: 'After lunch' });
    expect(entry.metadata._customFields.occurredDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(await screen.findByText('Logged Flare day, Runny nose')).toBeInTheDocument();
    expect(screen.getByLabelText('Symptom')).toHaveValue(''); // cleared for the next one
  });

  it('opens the full form in the journal with what is filled in', async () => {
    renderWithTheme(<QuickSymptom />);
    fireEvent.click(screen.getByRole('button', { name: 'Headache' }));
    fireEvent.click(screen.getByRole('button', { name: 'More details' }));
    await waitFor(() => expect(openNew).toHaveBeenCalledWith(3, expect.objectContaining({ symptomName: 'Headache', severity: 5 })));
  });

  it('Log a change saves what changed and when to the Changes topic', async () => {
    renderWithTheme(<QuickChange />);
    expect(screen.getByRole('button', { name: 'Log change' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('What changed?'), { target: { value: 'Cut out dairy' } });
    fireEvent.change(screen.getByLabelText('When did it change?'), { target: { value: '2026-10-10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log change' }));
    await waitFor(() => expect(addDecryptedEntry).toHaveBeenCalled());
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ taxonomyIds: [4] }));
    expect(addDecryptedEntry.mock.calls[0][0].metadata._customFields).toEqual({ changeWhat: 'Cut out dairy', changeDate: '2026-10-10', notes: '' });
  });
});
