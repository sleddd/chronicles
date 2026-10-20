import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useTodayDoses } from '@/hooks/useTodayDoses';

const entries = [
  { id: 2, content: '<p>Aspirin</p>', metadata: { _taxonomyId: 9, _customFields: { medicationName: 'Aspirin', scheduleTimes: ['08:00'] } } },
];
vi.mock('@/stores/entriesStore', () => ({
  useEntriesStore: (sel: (s: unknown) => unknown) => sel({ decryptedEntries: entries, allTopics: [{ id: 9, name: 'Medication' }] }),
}));
vi.mock('@/hooks/useDoseToMeals', () => ({ useDoseToMeals: () => ({ onTaken: vi.fn(), onUntaken: vi.fn() }) }));
vi.mock('@/services/api', () => ({
  doses: {
    // An extra aspirin taken as needed at 8:00 must not tick the scheduled 8:00 dose
    getByDate: vi.fn(async () => ({ logs: [{ id: 'x', medicationPostId: 2, scheduledTime: '08:00:41', status: 'taken', takenAt: '8:00 AM', date: '', createdAt: '', asNeeded: true }] })),
  },
}));

describe('useTodayDoses', () => {
  it('never counts an as-needed dose as a scheduled one', async () => {
    const { result } = renderHook(() => useTodayDoses(true));
    await waitFor(() => expect(result.current.total).toBe(1));
    await new Promise(r => setTimeout(r, 20));
    expect(result.current.taken).toBe(0);
  });
});
