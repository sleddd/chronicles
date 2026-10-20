import { describe, it, expect, vi } from 'vitest';

vi.mock('@/services/aiAssistant', () => ({ autoCaloriesOnSave: vi.fn(async () => null) }));
import { prepareEntryForSave } from '@/utils/entrySave';
import { medChangesOf } from '@/utils/healthChanges';

describe('prepareEntryForSave — medication changes', () => {
  it('records a medication change against how it was last saved, and leaves other topics alone', async () => {
    const before = { medicationName: 'Aspirin', dosage: '325 mg', isActive: true };
    const after = { ...before, dosage: '650 mg' };
    const saved = await prepareEntryForSave('<p>Aspirin</p>', after, 'medication', [], before);
    expect(medChangesOf(saved.customFields)).toEqual([expect.objectContaining({ kind: 'dose', from: '325 mg', to: '650 mg' })]);
    const other = await prepareEntryForSave('<p>Hi</p>', { dosage: '1' }, 'journal', [], { dosage: '2' });
    expect(other.customFields).not.toHaveProperty('_changes');
  });
});
