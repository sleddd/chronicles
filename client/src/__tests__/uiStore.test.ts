import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from '../stores/uiStore.js';

// Reset store state before each test
beforeEach(() => {
  useUIStore.setState({
    isSidebarOpen: true,
    searchKeyword: '',
    searchDateFrom: '',
    searchDateTo: '',
    isSearchActive: false,
    viewMode: 'date',
    selectedTopicId: null,
    selectedEntryId: null,
    showMobileEditor: false,
    themeMode: 'light',
    accentColor: '#00b4d8',
    backgroundImage: '',
    backgroundOpacity: 0.7,
  });
});

describe('uiStore – initial state', () => {
  it('has expected defaults', () => {
    const state = useUIStore.getState();
    expect(state.isSidebarOpen).toBe(true);
    expect(state.searchKeyword).toBe('');
    expect(state.searchDateFrom).toBe('');
    expect(state.searchDateTo).toBe('');
    expect(state.isSearchActive).toBe(false);
    expect(state.viewMode).toBe('date');
    expect(state.selectedTopicId).toBeNull();
    expect(state.selectedEntryId).toBeNull();
    expect(state.showMobileEditor).toBe(false);
    expect(state.themeMode).toBe('light');
    expect(state.accentColor).toBe('#00b4d8');
    expect(state.backgroundImage).toBe('');
    expect(state.backgroundOpacity).toBe(0.7);
  });
});

describe('uiStore – sidebar', () => {
  it('toggleSidebar flips isSidebarOpen', () => {
    expect(useUIStore.getState().isSidebarOpen).toBe(true);
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().isSidebarOpen).toBe(false);
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().isSidebarOpen).toBe(true);
  });
});

describe('uiStore – search', () => {
  it('setSearchKeyword updates keyword and activates search', () => {
    useUIStore.getState().setSearchKeyword('hello');
    const state = useUIStore.getState();
    expect(state.searchKeyword).toBe('hello');
    expect(state.isSearchActive).toBe(true);
  });

  it('setSearchKeyword with empty string deactivates search', () => {
    useUIStore.getState().setSearchKeyword('hello');
    useUIStore.getState().setSearchKeyword('');
    expect(useUIStore.getState().isSearchActive).toBe(false);
  });

  it('setSearchDateFrom updates date', () => {
    useUIStore.getState().setSearchDateFrom('2026-01-01');
    expect(useUIStore.getState().searchDateFrom).toBe('2026-01-01');
  });

  it('setSearchDateTo updates date', () => {
    useUIStore.getState().setSearchDateTo('2026-12-31');
    expect(useUIStore.getState().searchDateTo).toBe('2026-12-31');
  });

  it('clearSearch resets all search fields', () => {
    useUIStore.getState().setSearchKeyword('test');
    useUIStore.getState().setSearchDateFrom('2026-01-01');
    useUIStore.getState().setSearchDateTo('2026-12-31');
    useUIStore.getState().clearSearch();

    const state = useUIStore.getState();
    expect(state.searchKeyword).toBe('');
    expect(state.searchDateFrom).toBe('');
    expect(state.searchDateTo).toBe('');
    expect(state.isSearchActive).toBe(false);
  });
});

describe('uiStore – view mode', () => {
  it('setViewMode changes view mode', () => {
    useUIStore.getState().setViewMode('all');
    expect(useUIStore.getState().viewMode).toBe('all');

    useUIStore.getState().setViewMode('tasks');
    expect(useUIStore.getState().viewMode).toBe('tasks');

    useUIStore.getState().setViewMode('favorites');
    expect(useUIStore.getState().viewMode).toBe('favorites');

    useUIStore.getState().setViewMode('search');
    expect(useUIStore.getState().viewMode).toBe('search');

    useUIStore.getState().setViewMode('date');
    expect(useUIStore.getState().viewMode).toBe('date');
  });
});

describe('uiStore – topic filter', () => {
  it('setSelectedTopicId updates selection', () => {
    useUIStore.getState().setSelectedTopicId(5);
    expect(useUIStore.getState().selectedTopicId).toBe(5);
  });

  it('setSelectedTopicId can be set to null', () => {
    useUIStore.getState().setSelectedTopicId(5);
    useUIStore.getState().setSelectedTopicId(null);
    expect(useUIStore.getState().selectedTopicId).toBeNull();
  });
});

describe('uiStore – selected entry', () => {
  it('setSelectedEntryId updates selection', () => {
    useUIStore.getState().setSelectedEntryId(42);
    expect(useUIStore.getState().selectedEntryId).toBe(42);
  });

  it('setSelectedEntryId can be set to null', () => {
    useUIStore.getState().setSelectedEntryId(42);
    useUIStore.getState().setSelectedEntryId(null);
    expect(useUIStore.getState().selectedEntryId).toBeNull();
  });
});

describe('uiStore – mobile editor', () => {
  it('setShowMobileEditor toggles visibility', () => {
    useUIStore.getState().setShowMobileEditor(true);
    expect(useUIStore.getState().showMobileEditor).toBe(true);
    useUIStore.getState().setShowMobileEditor(false);
    expect(useUIStore.getState().showMobileEditor).toBe(false);
  });
});

describe('uiStore – theme', () => {
  it('setAccentColor updates accent color', () => {
    useUIStore.getState().setAccentColor('#00ff00');
    expect(useUIStore.getState().accentColor).toBe('#00ff00');
  });

  it('setThemeMode switches between light and dark', () => {
    useUIStore.getState().setThemeMode('dark');
    expect(useUIStore.getState().themeMode).toBe('dark');
    useUIStore.getState().setThemeMode('light');
    expect(useUIStore.getState().themeMode).toBe('light');
  });

  it('setBackgroundImage updates image', () => {
    useUIStore.getState().setBackgroundImage('mountains.jpg');
    expect(useUIStore.getState().backgroundImage).toBe('mountains.jpg');
  });

  it('setBackgroundOpacity updates opacity', () => {
    useUIStore.getState().setBackgroundOpacity(0.5);
    expect(useUIStore.getState().backgroundOpacity).toBe(0.5);
  });
});
