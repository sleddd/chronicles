import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useKitchenData } from '@/hooks/useKitchenData';
import { useEntriesStore } from '@/stores/entriesStore';

const entry = (id: number, topic: number, fields: Record<string, unknown>) => ({
  id, content: '', isEncrypted: true, createdAt: new Date(), updatedAt: new Date(),
  metadata: { _taxonomyId: topic, _customFields: fields },
}) as any;

describe('useKitchenData', () => {
  it('reads allergies and recipes, and redoes nothing when another topic changes', () => {
    act(() => {
      useEntriesStore.getState().setTopics([
        { id: 1, name: 'Allergy' }, { id: 2, name: 'Recipes' }, { id: 3, name: 'Journal' },
      ] as any);
      useEntriesStore.getState().setDecryptedEntries([
        entry(10, 1, { allergen: 'Peanuts', reaction: 'Hives', severity: 8 }),
        entry(11, 2, { recipeName: 'Soup', ingredients: [{ name: 'Leek' }] }),
        entry(12, 3, {}),
      ]);
    });
    const { result } = renderHook(() => useKitchenData());
    expect(result.current.allergies).toEqual([{ allergen: 'Peanuts', reaction: 'Hives', severity: 8 }]);
    expect(result.current.recipes).toEqual([{ id: 11, title: 'Soup', ingredients: ['Leek'] }]);
    const before = result.current;
    act(() => {
      const [a, r] = useEntriesStore.getState().decryptedEntries;
      useEntriesStore.getState().setDecryptedEntries([a, r, entry(12, 3, { edited: true })]);
    });
    expect(result.current).toBe(before);
  });
});
