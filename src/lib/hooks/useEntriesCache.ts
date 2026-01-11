'use client';

import { create } from 'zustand';

/**
 * Client-Side Encrypted Cache for Entries
 *
 * Purpose:
 * - Reduce database operations from ~2k/day to just initial load + writes
 * - Store encrypted entries in memory (safe - data remains encrypted)
 * - Decrypt on-demand when rendering
 * - Immediate writes to DB, then update cache
 *
 * Security:
 * - All cached data is encrypted (safe to hold in memory)
 * - Registered with useSecurityClear for logout/timeout cleanup
 * - Decrypted content stays in component state (not here)
 */

export interface CustomField {
  id: string;
  entryId: string;
  encryptedData: string;
  iv: string;
}

export interface CachedEntry {
  id: string;
  encryptedContent: string;
  iv: string;
  topicId: string | null;
  customType: string | null;
  entryDate: string;
  searchTokens: string[];
  custom_fields: CustomField[] | null;
  createdAt: string;
  updatedAt: string;
  // Relationship data (for goals/milestones)
  milestoneIds?: string[];
  goalIds?: string[];
  // Favorite info (when fetched via favorites endpoint)
  favoriteId?: string;
  favoritedAt?: string;
}

export interface CachedTopic {
  id: string;
  encryptedName: string;
  iv: string;
  nameToken: string;
  color: string;
  icon: string | null;
  sortOrder: number;
}

export interface EntryFilter {
  date?: string;
  topicId?: string;
  customType?: string;
  includeTasks?: boolean;
  all?: boolean;
}

export interface CachedSettings {
  foodEnabled: boolean;
  medicationEnabled: boolean;
  goalsEnabled: boolean;
  milestonesEnabled: boolean;
  exerciseEnabled: boolean;
  allergiesEnabled: boolean;
  timezone: string;
  headerColor: string;
  backgroundImage: string;
}

const DEFAULT_SETTINGS: CachedSettings = {
  foodEnabled: false,
  medicationEnabled: false,
  goalsEnabled: false,
  milestonesEnabled: false,
  exerciseEnabled: false,
  allergiesEnabled: false,
  timezone: 'UTC',
  headerColor: '#2d2c2a',
  backgroundImage: '',
};

interface EntriesCacheStore {
  // State
  entries: Map<string, CachedEntry>;
  topics: Map<string, CachedTopic>;
  favoriteIds: Set<string>;
  settings: CachedSettings;
  isInitialized: boolean;
  isLoading: boolean;
  lastFetchTime: number | null;
  initError: string | null;

  // Actions - Initialization
  initialize: () => Promise<void>;

  // Actions - Read (from cache)
  getEntry: (id: string) => CachedEntry | undefined;
  getEntries: (filter?: EntryFilter) => CachedEntry[];
  getEntriesByType: (customType: string) => CachedEntry[];
  getEntriesByDate: (date: string, includeTasks?: boolean) => CachedEntry[];
  getEntriesByTopic: (topicId: string) => CachedEntry[];
  getFavoriteEntries: () => CachedEntry[];
  getAllTopics: () => CachedTopic[];
  getTopic: (id: string) => CachedTopic | undefined;
  isFavorite: (entryId: string) => boolean;
  getSettings: () => CachedSettings;

  // Actions - Write (update cache after successful API call)
  addEntry: (entry: CachedEntry) => void;
  updateEntry: (id: string, updates: Partial<CachedEntry>) => void;
  removeEntry: (id: string) => void;

  addTopic: (topic: CachedTopic) => void;
  updateTopic: (id: string, updates: Partial<CachedTopic>) => void;
  removeTopic: (id: string) => void;
  reorderTopics: (topics: CachedTopic[]) => void;

  addFavorite: (entryId: string) => void;
  removeFavorite: (entryId: string) => void;

  updateSettings: (updates: Partial<CachedSettings>) => void;

  // Actions - Security
  clearCache: () => void;
}

export const useEntriesCache = create<EntriesCacheStore>((set, get) => ({
  entries: new Map(),
  topics: new Map(),
  favoriteIds: new Set(),
  settings: DEFAULT_SETTINGS,
  isInitialized: false,
  isLoading: false,
  lastFetchTime: null,
  initError: null,

  initialize: async () => {
    const { isInitialized, isLoading } = get();
    if (isInitialized || isLoading) return;

    set({ isLoading: true, initError: null });

    try {
      // Parallel fetch: all entries, topics, favorites, and settings
      const [entriesRes, topicsRes, favoritesRes, settingsRes] = await Promise.all([
        fetch('/api/entries?all=true'),
        fetch('/api/topics'),
        fetch('/api/favorites'),
        fetch('/api/settings'),
      ]);

      if (!entriesRes.ok || !topicsRes.ok || !favoritesRes.ok || !settingsRes.ok) {
        throw new Error('Failed to fetch initial data');
      }

      const [entriesData, topicsData, favoritesData, settingsData] = await Promise.all([
        entriesRes.json(),
        topicsRes.json(),
        favoritesRes.json(),
        settingsRes.json(),
      ]);

      // Build entries map
      const entriesMap = new Map<string, CachedEntry>();
      for (const entry of entriesData.entries || []) {
        entriesMap.set(entry.id, entry);
      }

      // Build topics map
      const topicsMap = new Map<string, CachedTopic>();
      for (const topic of topicsData.topics || []) {
        topicsMap.set(topic.id, topic);
      }

      // Build favorites set (extract entry IDs from favorites response)
      const favSet = new Set<string>();
      for (const fav of favoritesData.favorites || []) {
        favSet.add(fav.id); // Entry ID (favorites response includes full entry)
      }

      // Merge settings with defaults
      const settings: CachedSettings = {
        ...DEFAULT_SETTINGS,
        ...settingsData.settings,
      };

      set({
        entries: entriesMap,
        topics: topicsMap,
        favoriteIds: favSet,
        settings,
        isInitialized: true,
        isLoading: false,
        lastFetchTime: Date.now(),
      });
    } catch (error) {
      console.error('Failed to initialize entries cache:', error);
      set({
        isLoading: false,
        initError: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  getEntry: (id: string) => {
    return get().entries.get(id);
  },

  getEntries: (filter?: EntryFilter) => {
    const { entries } = get();
    let result = Array.from(entries.values());

    if (!filter || filter.all) {
      // Return all entries sorted
      return result.sort((a, b) => {
        const dateComp = b.entryDate.localeCompare(a.entryDate);
        if (dateComp !== 0) return dateComp;
        return b.createdAt.localeCompare(a.createdAt);
      });
    }

    // Filter by date
    if (filter.date) {
      if (filter.includeTasks) {
        result = result.filter(
          (e) => e.entryDate === filter.date || e.customType === 'task'
        );
      } else {
        result = result.filter((e) => e.entryDate === filter.date);
      }
    }

    // Filter by topic
    if (filter.topicId) {
      result = result.filter((e) => e.topicId === filter.topicId);
    }

    // Filter by custom type
    if (filter.customType) {
      result = result.filter((e) => e.customType === filter.customType);
    }

    // Sort by date desc, then createdAt desc
    return result.sort((a, b) => {
      const dateComp = b.entryDate.localeCompare(a.entryDate);
      if (dateComp !== 0) return dateComp;
      return b.createdAt.localeCompare(a.createdAt);
    });
  },

  getEntriesByType: (customType: string) => {
    return get().getEntries({ customType });
  },

  getEntriesByDate: (date: string, includeTasks: boolean = false) => {
    return get().getEntries({ date, includeTasks });
  },

  getEntriesByTopic: (topicId: string) => {
    return get().getEntries({ topicId });
  },

  getFavoriteEntries: () => {
    const { entries, favoriteIds } = get();
    const favorites: CachedEntry[] = [];
    for (const entryId of favoriteIds) {
      const entry = entries.get(entryId);
      if (entry) {
        favorites.push(entry);
      }
    }
    // Sort by date desc
    return favorites.sort((a, b) => {
      const dateComp = b.entryDate.localeCompare(a.entryDate);
      if (dateComp !== 0) return dateComp;
      return b.createdAt.localeCompare(a.createdAt);
    });
  },

  getAllTopics: () => {
    const { topics } = get();
    return Array.from(topics.values()).sort((a, b) => a.sortOrder - b.sortOrder);
  },

  getTopic: (id: string) => {
    return get().topics.get(id);
  },

  isFavorite: (entryId: string) => {
    return get().favoriteIds.has(entryId);
  },

  addEntry: (entry: CachedEntry) => {
    set((state) => {
      const newEntries = new Map(state.entries);
      newEntries.set(entry.id, entry);
      return { entries: newEntries };
    });
  },

  updateEntry: (id: string, updates: Partial<CachedEntry>) => {
    set((state) => {
      const existing = state.entries.get(id);
      if (!existing) return state;

      const newEntries = new Map(state.entries);
      newEntries.set(id, { ...existing, ...updates });
      return { entries: newEntries };
    });
  },

  removeEntry: (id: string) => {
    set((state) => {
      const newEntries = new Map(state.entries);
      newEntries.delete(id);
      // Also remove from favorites if present
      const newFavorites = new Set(state.favoriteIds);
      newFavorites.delete(id);
      return { entries: newEntries, favoriteIds: newFavorites };
    });
  },

  addTopic: (topic: CachedTopic) => {
    set((state) => {
      const newTopics = new Map(state.topics);
      newTopics.set(topic.id, topic);
      return { topics: newTopics };
    });
  },

  updateTopic: (id: string, updates: Partial<CachedTopic>) => {
    set((state) => {
      const existing = state.topics.get(id);
      if (!existing) return state;

      const newTopics = new Map(state.topics);
      newTopics.set(id, { ...existing, ...updates });
      return { topics: newTopics };
    });
  },

  removeTopic: (id: string) => {
    set((state) => {
      const newTopics = new Map(state.topics);
      newTopics.delete(id);
      return { topics: newTopics };
    });
  },

  reorderTopics: (topics: CachedTopic[]) => {
    set(() => {
      const newTopics = new Map<string, CachedTopic>();
      for (const topic of topics) {
        newTopics.set(topic.id, topic);
      }
      return { topics: newTopics };
    });
  },

  addFavorite: (entryId: string) => {
    set((state) => {
      const newFavorites = new Set(state.favoriteIds);
      newFavorites.add(entryId);
      return { favoriteIds: newFavorites };
    });
  },

  removeFavorite: (entryId: string) => {
    set((state) => {
      const newFavorites = new Set(state.favoriteIds);
      newFavorites.delete(entryId);
      return { favoriteIds: newFavorites };
    });
  },

  getSettings: () => {
    return get().settings;
  },

  updateSettings: (updates: Partial<CachedSettings>) => {
    set((state) => ({
      settings: { ...state.settings, ...updates },
    }));
  },

  clearCache: () => {
    set({
      entries: new Map(),
      topics: new Map(),
      favoriteIds: new Set(),
      settings: DEFAULT_SETTINGS,
      isInitialized: false,
      isLoading: false,
      lastFetchTime: null,
      initError: null,
    });
  },
}));
