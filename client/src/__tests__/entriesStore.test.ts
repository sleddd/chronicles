import { describe, it, expect, beforeEach } from 'vitest';
import { useEntriesStore } from '../stores/entriesStore.js';
import type { DecryptedPost, EncryptedPost } from '@shared/crypto/types';
import type { Topic } from '../types/topics.js';

// Reset store state before each test
beforeEach(() => {
  useEntriesStore.getState().clearAll();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDecrypted(overrides: Partial<DecryptedPost> = {}): DecryptedPost {
  return {
    id: 1,
    content: 'Hello world',
    metadata: {},
    isEncrypted: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeEncrypted(overrides: Partial<EncryptedPost> = {}): EncryptedPost {
  return {
    id: 1,
    contentEncrypted: 'enc',
    contentIv: 'iv',
    metadataEncrypted: 'menc',
    metadataIv: 'miv',
    isEncrypted: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeTopic(overrides: Partial<Topic> = {}): Topic {
  return { id: 1, name: 'Journal', icon: null, color: null, ...overrides };
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe('entriesStore – initial state', () => {
  it('starts with empty arrays and loading flags false', () => {
    const state = useEntriesStore.getState();
    expect(state.rawEntries).toEqual([]);
    expect(state.decryptedEntries).toEqual([]);
    expect(state.allTopics).toEqual([]);
    expect(state.topics).toEqual([]);
    expect(state.featureFlags).toEqual({});
    expect(state.isInitialized).toBe(false);
    expect(state.isLoading).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

describe('entriesStore – entries', () => {
  it('setRawEntries populates rawEntries', () => {
    const encrypted = [makeEncrypted({ id: 1 }), makeEncrypted({ id: 2 })];
    useEntriesStore.getState().setRawEntries(encrypted);
    expect(useEntriesStore.getState().rawEntries).toHaveLength(2);
  });

  it('setDecryptedEntries populates and sets isInitialized', () => {
    const decrypted = [makeDecrypted({ id: 1 })];
    useEntriesStore.getState().setDecryptedEntries(decrypted);

    const state = useEntriesStore.getState();
    expect(state.decryptedEntries).toHaveLength(1);
    expect(state.isInitialized).toBe(true);
  });

  it('addDecryptedEntry prepends entry', () => {
    useEntriesStore.getState().setDecryptedEntries([makeDecrypted({ id: 1 })]);
    useEntriesStore.getState().addDecryptedEntry(makeDecrypted({ id: 2, content: 'New' }));

    const entries = useEntriesStore.getState().decryptedEntries;
    expect(entries).toHaveLength(2);
    expect(entries[0].id).toBe(2); // prepended
    expect(entries[1].id).toBe(1);
  });

  it('updateDecryptedEntry modifies existing entry', () => {
    useEntriesStore.getState().setDecryptedEntries([
      makeDecrypted({ id: 1, content: 'Original' }),
      makeDecrypted({ id: 2, content: 'Other' }),
    ]);

    useEntriesStore.getState().updateDecryptedEntry(1, { content: 'Updated' });

    const entries = useEntriesStore.getState().decryptedEntries;
    expect(entries.find(e => e.id === 1)?.content).toBe('Updated');
    expect(entries.find(e => e.id === 2)?.content).toBe('Other');
  });

  it('updateDecryptedEntry does not affect non-matching entries', () => {
    useEntriesStore.getState().setDecryptedEntries([makeDecrypted({ id: 1 })]);
    useEntriesStore.getState().updateDecryptedEntry(999, { content: 'No match' });
    expect(useEntriesStore.getState().decryptedEntries[0].content).toBe('Hello world');
  });

  it('removeEntry removes from both decrypted and raw', () => {
    useEntriesStore.getState().setRawEntries([makeEncrypted({ id: 1 }), makeEncrypted({ id: 2 })]);
    useEntriesStore.getState().setDecryptedEntries([makeDecrypted({ id: 1 }), makeDecrypted({ id: 2 })]);

    useEntriesStore.getState().removeEntry(1);

    expect(useEntriesStore.getState().rawEntries).toHaveLength(1);
    expect(useEntriesStore.getState().rawEntries[0].id).toBe(2);
    expect(useEntriesStore.getState().decryptedEntries).toHaveLength(1);
    expect(useEntriesStore.getState().decryptedEntries[0].id).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Topics
// ---------------------------------------------------------------------------

describe('entriesStore – topics', () => {
  it('setTopics stores allTopics and treats unset feature flags as enabled', () => {
    const topicsList = [makeTopic({ id: 1, name: 'Journal' }), makeTopic({ id: 2, name: 'Meals' })];
    useEntriesStore.getState().setTopics(topicsList);

    const state = useEntriesStore.getState();
    expect(state.allTopics).toHaveLength(2);
    // No flags saved yet → every feature counts as on
    expect(state.topics.map(t => t.name)).toEqual(['Journal', 'Meals']);
  });

  it('setFeatureFlags hides only topics whose flag is explicitly false', () => {
    const topicsList = [
      makeTopic({ id: 1, name: 'Journal' }),
      makeTopic({ id: 2, name: 'Meals' }),
      makeTopic({ id: 3, name: 'Medication' }),
    ];
    useEntriesStore.getState().setTopics(topicsList);
    expect(useEntriesStore.getState().topics.map(t => t.name)).toEqual(['Journal', 'Meals', 'Medication']);

    useEntriesStore.getState().setFeatureFlags({ foodEnabled: false });
    expect(useEntriesStore.getState().topics.map(t => t.name)).toEqual(['Journal', 'Medication']);

    useEntriesStore.getState().setFeatureFlags({ foodEnabled: false, medicationEnabled: false });
    expect(useEntriesStore.getState().topics.map(t => t.name)).toEqual(['Journal']);

    useEntriesStore.getState().setFeatureFlags({ foodEnabled: true, medicationEnabled: true });
    expect(useEntriesStore.getState().topics.map(t => t.name)).toEqual(['Journal', 'Meals', 'Medication']);
  });

  it('non-gated topics are always visible regardless of flags', () => {
    useEntriesStore.getState().setTopics([makeTopic({ id: 1, name: 'CustomTopic' })]);
    expect(useEntriesStore.getState().topics).toHaveLength(1);
    expect(useEntriesStore.getState().topics[0].name).toBe('CustomTopic');
  });
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('entriesStore – loading state', () => {
  it('setLoading toggles isLoading', () => {
    useEntriesStore.getState().setLoading(true);
    expect(useEntriesStore.getState().isLoading).toBe(true);
    useEntriesStore.getState().setLoading(false);
    expect(useEntriesStore.getState().isLoading).toBe(false);
  });

  it('setInitialized sets isInitialized', () => {
    useEntriesStore.getState().setInitialized(true);
    expect(useEntriesStore.getState().isInitialized).toBe(true);
    useEntriesStore.getState().setInitialized(false);
    expect(useEntriesStore.getState().isInitialized).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// clearAll
// ---------------------------------------------------------------------------

describe('entriesStore – clearAll', () => {
  it('resets all state to initial values', () => {
    useEntriesStore.getState().setRawEntries([makeEncrypted()]);
    useEntriesStore.getState().setDecryptedEntries([makeDecrypted()]);
    useEntriesStore.getState().setTopics([makeTopic()]);
    useEntriesStore.getState().setFeatureFlags({ foodEnabled: true });
    useEntriesStore.getState().setLoading(true);

    useEntriesStore.getState().clearAll();

    const state = useEntriesStore.getState();
    expect(state.rawEntries).toEqual([]);
    expect(state.decryptedEntries).toEqual([]);
    expect(state.allTopics).toEqual([]);
    expect(state.topics).toEqual([]);
    expect(state.featureFlags).toEqual({});
    expect(state.isInitialized).toBe(false);
    expect(state.isLoading).toBe(false);
  });
});
