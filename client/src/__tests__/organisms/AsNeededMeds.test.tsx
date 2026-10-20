import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { AsNeededMeds } from '@/components/organisms/AsNeededMeds';
import { renderWithTheme } from '../testUtils';

const getByDate = vi.fn();
const logAsNeeded = vi.fn();
const remove = vi.fn();

vi.mock('@/services/api', () => ({
  doses: {
    getByDate: (d: string) => getByDate(d),
    logAsNeeded: (x: unknown) => logAsNeeded(x),
    remove: (id: string) => remove(id),
  },
}));

const entries = [
  { id: 1, content: '<p>Aspirin</p>', metadata: { _taxonomyId: 9, _customFields: { medicationName: 'Aspirin', dosage: '325 mg', frequency: 'as_needed' } } },
  { id: 2, content: '<p>Metformin</p>', metadata: { _taxonomyId: 9, _customFields: { medicationName: 'Metformin', frequency: 'twice_daily', scheduleTimes: ['08:00'] } } },
  { id: 3, content: '<p>Old</p>', metadata: { _taxonomyId: 9, _customFields: { medicationName: 'Old', frequency: 'as_needed', isActive: false } } },
];
vi.mock('@/stores/entriesStore', () => ({
  useEntriesStore: (sel: (s: unknown) => unknown) => sel({ decryptedEntries: entries, allTopics: [{ id: 9, name: 'Medication' }] }),
}));

const dose = (id: string, med: number, time: string, asNeeded = true) =>
  ({ id, medicationPostId: med, scheduledTime: time, status: 'taken', takenAt: null, date: '2026-10-19', createdAt: '', asNeeded });

describe('AsNeededMeds', () => {
  beforeEach(() => {
    getByDate.mockReset().mockResolvedValue({ logs: [dose('a', 1, '08:10:04'), dose('s', 2, '08:00', false)] });
    logAsNeeded.mockReset().mockImplementation(async ({ medicationPostId }: { medicationPostId: number }) => ({ log: dose('n', medicationPostId, '14:05:31') }));
    remove.mockReset().mockResolvedValue({ deleted: true });
  });

  it('lists only active as-needed medications, with today’s doses', async () => {
    renderWithTheme(<AsNeededMeds />);
    expect(await screen.findByText('8:10 AM')).toBeInTheDocument();
    expect(screen.getByText('Aspirin')).toBeInTheDocument();
    expect(screen.queryByText('Metformin')).toBeNull(); // scheduled
    expect(screen.queryByText('Old')).toBeNull(); // not taking any more
    expect(screen.getByText('1× today')).toBeInTheDocument();
  });

  it('logs another dose each time, and removes one logged by mistake', async () => {
    renderWithTheme(<AsNeededMeds />);
    await screen.findByText('8:10 AM');
    fireEvent.click(screen.getByRole('button', { name: 'Take one Aspirin' }));
    await screen.findByText('2:05 PM');
    expect(logAsNeeded).toHaveBeenCalledWith(expect.objectContaining({ medicationPostId: 1 }));
    expect(screen.getByText('2× today')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove the 8:10 AM dose of Aspirin' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('a'));
    expect(within(screen.getByLabelText('Aspirin doses today')).queryByText('8:10 AM')).toBeNull();
    expect(screen.getByText('1× today')).toBeInTheDocument();
  });

  it('puts a dose back if removing it fails', async () => {
    remove.mockRejectedValue(new Error('offline'));
    renderWithTheme(<AsNeededMeds />);
    await screen.findByText('8:10 AM');
    fireEvent.click(screen.getByRole('button', { name: 'Remove the 8:10 AM dose of Aspirin' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t remove that dose');
    expect(screen.getByText('8:10 AM')).toBeInTheDocument();
  });
});
