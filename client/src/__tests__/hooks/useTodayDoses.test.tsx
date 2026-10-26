import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useTodayDoses } from '@/hooks/useTodayDoses';
import { doses } from '@/services/api';
import { toDateStr } from '@/utils/dateUtils';

const entries = [
  { id: 2, content: '<p>Aspirin</p>', metadata: { _taxonomyId: 9, _customFields: { medicationName: 'Aspirin', scheduleTimes: ['08:00'] } } },
];
vi.mock('@/stores/entriesStore', () => ({
  useEntriesStore: (sel: (s: unknown) => unknown) => sel({ decryptedEntries: entries, allTopics: [{ id: 9, name: 'Medication' }] }),
}));
vi.mock('@/hooks/useDoseToMeals', () => ({ useDoseToMeals: () => ({ onTaken: vi.fn(), onUntaken: vi.fn() }) }));
vi.mock('@/services/api', () => ({
  doses: {
    log: vi.fn(async (d: { scheduledTime: string }) => ({ log: { id: 'y', ...d } })),
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

  it('flips back a day, logs a missed dose for that day, and never goes past today', async () => {
    const { result } = renderHook(() => useTodayDoses(true));
    const today = toDateStr(new Date());
    const y = new Date(); y.setDate(y.getDate() - 1);
    const yesterday = toDateStr(y);
    expect(result.current.isToday).toBe(true);

    act(() => result.current.shiftDay(1));
    expect(result.current.day).toBe(today);

    act(() => result.current.shiftDay(-1));
    expect(result.current.day).toBe(yesterday);
    expect(result.current.isToday).toBe(false);
    await waitFor(() => expect(doses.getByDate).toHaveBeenCalledWith(yesterday));

    await act(() => result.current.setTaken(result.current.scheduled[0], true));
    // Ticked later, so no "taken at" time — the scheduled time stands in
    expect(doses.log).toHaveBeenCalledWith(expect.objectContaining({ date: yesterday, status: 'taken', takenAt: null }));

    act(() => result.current.shiftDay(1));
    expect(result.current.isToday).toBe(true);
  });
});
