import { create } from 'zustand';
import { DEFAULT_ACCENT_COLOR } from '../styles/accent.js';
import { resolveTheme, type ThemePreference } from '../utils/autoTheme.js';
import type { UserFieldDef, TopicCustomFields } from '../types/userFields.js';

interface UIState {
  // Sidebar
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;

  // Mobile nav drawer
  mobileNavOpen: boolean;
  setMobileNavOpen: (v: boolean) => void;

  // Search
  searchKeyword: string;
  searchDateFrom: string;
  searchDateTo: string;
  isSearchActive: boolean;
  setSearchKeyword: (keyword: string) => void;
  setSearchDateFrom: (date: string) => void;
  setSearchDateTo: (date: string) => void;
  clearSearch: () => void;

  // View mode
  viewMode: 'date' | 'all' | 'tasks' | 'favorites' | 'search';
  setViewMode: (mode: UIState['viewMode']) => void;

  // Selected date for date view
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;

  // Selected topic filter
  selectedTopicId: number | null;
  setSelectedTopicId: (id: number | null) => void;

  // Selected entry
  selectedEntryId: number | null;
  setSelectedEntryId: (id: number | null) => void;

  // Mobile editor visibility
  showMobileEditor: boolean;
  setShowMobileEditor: (show: boolean) => void;

  // Full-view editor overlay — mobile chrome hides so the overlay can fill the screen
  editorFocusMode: boolean;
  setEditorFocusMode: (v: boolean) => void;

  // Drawing / Apple Pencil
  pencilOnly: boolean;
  setPencilOnly: (v: boolean) => void;

  // Theme (runtime overrides from settings). themePreference is what the user
  // chose (Light / Dark / Auto by time of day); themeMode is the theme in effect.
  themeMode: 'light' | 'dark';
  themePreference: ThemePreference;
  accentColor: string;
  setThemeMode: (mode: 'light' | 'dark') => void;
  setThemePreference: (pref: ThemePreference) => void;
  setAccentColor: (color: string) => void;

  // Profile
  displayName: string;
  setDisplayName: (name: string) => void;

  // User-defined custom fields per topic
  topicCustomFields: TopicCustomFields;
  setTopicCustomFields: (fields: TopicCustomFields) => void;
  updateTopicFields: (topicId: number, defs: UserFieldDef[]) => void;

  // Per-topic option: hide the main text area in the entry editor (custom topics)
  topicHideText: Record<number, boolean>;
  setTopicHideText: (map: Record<number, boolean>) => void;
  updateTopicHideText: (topicId: number, hide: boolean) => void;


  // Cycle tracking
  cycleTrackingEnabled: boolean;
  setCycleTrackingEnabled: (v: boolean) => void;

  // Entry images (opt-in; imagesConfigured mirrors server-side R2 credential state)
  imagesEnabled: boolean;
  imagesConfigured: boolean;
  setImagesEnabled: (v: boolean) => void;
  setImagesConfigured: (v: boolean) => void;

  // Calendar sync
  calendarSyncEnabled: boolean;
  googleCalendarId: string;
  googleSyncToken: string;
  calendarImportMode: 'chroniclesOnly' | 'all';
  /** Apple Calendar feed: include event descriptions (stored readable on the server) — off unless turned on */
  icsIncludeDetails: boolean;
  /** Apple Calendar feed on, as this account chose it (a sealed setting) — the
   *  server saying the feed is enabled is never enough to upload it */
  icsFeedEnabled: boolean;
  setCalendarSyncEnabled: (v: boolean) => void;
  setGoogleCalendarId: (id: string) => void;
  setGoogleSyncToken: (token: string) => void;
  setCalendarImportMode: (mode: 'chroniclesOnly' | 'all') => void;
  setIcsIncludeDetails: (on: boolean) => void;
  setIcsFeedEnabled: (on: boolean) => void;
}

export { DEFAULT_ACCENT_COLOR };

export const useUIStore = create<UIState>((set) => ({
  isSidebarOpen: true,
  toggleSidebar: () => set(s => ({ isSidebarOpen: !s.isSidebarOpen })),
  sidebarCollapsed: true,
  setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),

  mobileNavOpen: false,
  setMobileNavOpen: (v) => set({ mobileNavOpen: v }),

  searchKeyword: '',
  searchDateFrom: '',
  searchDateTo: '',
  isSearchActive: false,
  setSearchKeyword: (keyword) => set({ searchKeyword: keyword, isSearchActive: keyword.length > 0 }),
  setSearchDateFrom: (date) => set({ searchDateFrom: date }),
  setSearchDateTo: (date) => set({ searchDateTo: date }),
  clearSearch: () => set({ searchKeyword: '', searchDateFrom: '', searchDateTo: '', isSearchActive: false }),

  viewMode: 'date',
  setViewMode: (mode) => set({ viewMode: mode }),

  selectedDate: new Date(),
  setSelectedDate: (date) => set({ selectedDate: date }),

  selectedTopicId: null,
  setSelectedTopicId: (id) => set({ selectedTopicId: id }),

  selectedEntryId: null,
  setSelectedEntryId: (id) => set({ selectedEntryId: id }),

  showMobileEditor: false,
  setShowMobileEditor: (show) => set({ showMobileEditor: show }),

  editorFocusMode: false,
  setEditorFocusMode: (v) => set({ editorFocusMode: v }),

  pencilOnly: true,
  setPencilOnly: (v) => set({ pencilOnly: v }),

  themeMode: 'dark',
  themePreference: 'dark',
  accentColor: DEFAULT_ACCENT_COLOR,
  setThemeMode: (mode) => set({ themeMode: mode }),
  setThemePreference: (pref) => set({ themePreference: pref, themeMode: resolveTheme(pref) }),
  setAccentColor: (color) => set({ accentColor: color }),

  displayName: '',
  setDisplayName: (name) => set({ displayName: name }),

  topicCustomFields: {},
  setTopicCustomFields: (fields) => set({ topicCustomFields: fields }),
  updateTopicFields: (topicId, defs) => set(s => ({ topicCustomFields: { ...s.topicCustomFields, [topicId]: defs } })),

  topicHideText: {},
  setTopicHideText: (map) => set({ topicHideText: map }),
  updateTopicHideText: (topicId, hide) => set(s => ({ topicHideText: { ...s.topicHideText, [topicId]: hide } })),


  cycleTrackingEnabled: true,
  setCycleTrackingEnabled: (v) => set({ cycleTrackingEnabled: v }),

  imagesEnabled: false,
  imagesConfigured: false,
  setImagesEnabled: (v) => set({ imagesEnabled: v }),
  setImagesConfigured: (v) => set({ imagesConfigured: v }),

  calendarSyncEnabled: false,
  googleCalendarId: '',
  googleSyncToken: '',
  calendarImportMode: 'chroniclesOnly',
  icsIncludeDetails: false,
  icsFeedEnabled: false,
  setCalendarSyncEnabled: (v) => set({ calendarSyncEnabled: v }),
  setGoogleCalendarId: (id) => set({ googleCalendarId: id }),
  setGoogleSyncToken: (token) => set({ googleSyncToken: token }),
  setCalendarImportMode: (mode) => set({ calendarImportMode: mode }),
  setIcsIncludeDetails: (on) => set({ icsIncludeDetails: on }),
  setIcsFeedEnabled: (on) => set({ icsFeedEnabled: on }),
}));
