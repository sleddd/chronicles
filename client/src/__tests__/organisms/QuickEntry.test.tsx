import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithTheme } from '../testUtils';
import { QuickEntry } from '@/components/organisms/QuickEntry';

const create = vi.fn(async () => ({ id: 9, createdAt: '2026-10-20T10:00:00Z' }));
vi.mock('@/services/api', () => ({ entries: { create: (...a: unknown[]) => create(...(a as [])) } }));
vi.mock('@/contexts/EncryptionContext', () => ({
  useEncryption: () => ({ encryptPost: vi.fn(), encryptNewPost: vi.fn(async () => ({ id: 9, contentEncrypted: 'c', contentIv: 'i', metadataEncrypted: 'm', metadataIv: 'mi' })) }),
}));
vi.mock('@/stores/entriesStore', () => {
  const state = { topics: [], allTopics: [{ id: 1, name: 'Journal' }], addDecryptedEntry: vi.fn() };
  const useEntriesStore = (sel: (s: typeof state) => unknown) => sel(state);
  useEntriesStore.getState = () => state;
  return { useEntriesStore };
});
vi.mock('@/stores/uiStore', () => ({ useUIStore: (sel: (s: unknown) => unknown) => sel({ topicCustomFields: {} }) }));
vi.mock('@/utils/getOrCreateJournalTopic', () => ({ getOrCreateJournalTopic: async () => 1 }));
vi.mock('@/utils/entrySave', () => ({
  hasEntryData: (content: string) => !!content,
  prepareEntryForSave: async (content: string, customFields: Record<string, unknown>) => ({ content, customFields }),
}));
vi.mock('@/components/organisms/EntryForm', () => ({
  EntryForm: ({ onContentChange, onSave }: { onContentChange: (c: string) => void; onSave: () => void }) => (
    <div>
      <button onClick={() => onContentChange('<p>Hi</p>')}>type</button>
      <button onClick={onSave}>save</button>
    </div>
  ),
}));

describe('QuickEntry', () => {
  it('saves once when Save is clicked twice quickly', async () => {
    renderWithTheme(<QuickEntry />);
    fireEvent.click(screen.getByText('type'));
    fireEvent.click(screen.getByText('save'));
    fireEvent.click(screen.getByText('save'));
    await waitFor(() => expect(create).toHaveBeenCalled());
    await new Promise(r => setTimeout(r, 30));
    expect(create).toHaveBeenCalledTimes(1);
  });
});
