import { create } from 'zustand';
import type { DecryptedPost, EncryptedPost } from '@shared/crypto/types';
import type { Topic } from '../types/topics.js';

/** Maps feature flag keys to the topic names they control. */
const FEATURE_TOPIC_MAP: Record<string, string[]> = {
  foodEnabled: ['Meals'],
  medicationEnabled: ['Medication', 'Symptom'],
  goalsEnabled: ['Goal'],
  milestonesEnabled: ['Milestone'],
  exerciseEnabled: ['Exercise', 'Exercise Routine', 'Exercise Schedule', 'Routine', 'Training Plan'],
  allergiesEnabled: ['Allergy'],
};

/** Set of all topic names gated by a feature flag. */
const GATED_TOPIC_NAMES = new Set(Object.values(FEATURE_TOPIC_MAP).flat());

function filterTopics(allTopics: Topic[], featureFlags: Record<string, boolean>): Topic[] {
  return allTopics.filter(topic => {
    // Topics not gated by any feature flag are always shown
    if (!GATED_TOPIC_NAMES.has(topic.name)) return true;
    // Only hide a topic when its flag is explicitly set to false — undefined means "not configured yet, show it"
    return Object.entries(FEATURE_TOPIC_MAP).some(
      ([flag, names]) => names.includes(topic.name) && featureFlags[flag] !== false
    );
  });
}

interface EntriesState {
  // Raw encrypted entries from server
  rawEntries: EncryptedPost[];
  // Decrypted entries (in memory only)
  decryptedEntries: DecryptedPost[];
  // All topics (unfiltered)
  allTopics: Topic[];
  // Topics filtered by feature flags
  topics: Topic[];
  // Feature flags from settings
  featureFlags: Record<string, boolean>;
  // Loading state
  isInitialized: boolean;
  isLoading: boolean;

  // Actions
  setRawEntries: (entries: EncryptedPost[]) => void;
  setDecryptedEntries: (entries: DecryptedPost[]) => void;
  setTopics: (topics: Topic[]) => void;
  setFeatureFlags: (flags: Record<string, boolean>) => void;
  addDecryptedEntry: (entry: DecryptedPost) => void;
  updateDecryptedEntry: (id: number, updates: Partial<DecryptedPost>) => void;
  removeEntry: (id: number) => void;
  setInitialized: (initialized: boolean) => void;
  setLoading: (loading: boolean) => void;
  clearAll: () => void;
}

export const useEntriesStore = create<EntriesState>((set, get) => ({
  rawEntries: [],
  decryptedEntries: [],
  allTopics: [],
  topics: [],
  featureFlags: {},
  isInitialized: false,
  isLoading: false,

  setRawEntries: (entries) => set({ rawEntries: entries }),
  setDecryptedEntries: (entries) => set({ decryptedEntries: entries, isInitialized: true }),
  setTopics: (topics) => set({ allTopics: topics, topics: filterTopics(topics, get().featureFlags) }),
  setFeatureFlags: (flags) => set({ featureFlags: flags, topics: filterTopics(get().allTopics, flags) }),
  addDecryptedEntry: (entry) => set(s => ({
    decryptedEntries: [entry, ...s.decryptedEntries],
  })),
  updateDecryptedEntry: (id, updates) => set(s => ({
    decryptedEntries: s.decryptedEntries.map(e => e.id === id ? { ...e, ...updates } : e),
  })),
  removeEntry: (id) => set(s => ({
    decryptedEntries: s.decryptedEntries.filter(e => e.id !== id),
    rawEntries: s.rawEntries.filter(e => e.id !== id),
  })),
  setInitialized: (initialized) => set({ isInitialized: initialized }),
  setLoading: (loading) => set({ isLoading: loading }),
  clearAll: () => set({
    rawEntries: [],
    decryptedEntries: [],
    allTopics: [],
    topics: [],
    featureFlags: {},
    isInitialized: false,
    isLoading: false,
  }),
}));
