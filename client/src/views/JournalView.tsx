import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import styled, { css, keyframes } from 'styled-components';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import { Icon } from '../../../design-system/components/core/Icon.jsx';
import { AppTemplate } from '../components/templates/AppTemplate.js';
import { JournalTemplate, SidePanel, EditorPanel, MobileBackButton } from '../components/templates/JournalTemplate.js';
import { LoadingCenter } from '../components/atoms/LoadingCenter.js';
import { EmptyEditor } from '../components/atoms/EmptyEditor.js';
import { SidePadding } from '../components/atoms/SidePadding.js';
import { QuickEntryCard } from '../components/atoms/QuickEntryCard.js';
import { ViewTabs } from '../components/organisms/ViewTabs.js';
import { QuickEntry } from '../components/organisms/QuickEntry.js';
import { EntryList } from '../components/organisms/EntryList.js';
import { EntryForm } from '../components/organisms/EntryForm.js';
import type { DictationControls } from '../components/organisms/Editor.js';
import { SearchPanel } from '../components/organisms/SearchPanel.js';
import { MiniCalendar } from '../components/organisms/MiniCalendar.js';
import { UnlockDialog } from '../components/organisms/UnlockDialog.js';
import { ShareModal } from '../components/organisms/ShareModal.js';
import { ConfirmDialog } from '../components/molecules/ConfirmDialog.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { useAuth } from '../contexts/AuthContext.js';
import { useEncryption } from '../contexts/EncryptionContext.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { useUIStore } from '../stores/uiStore.js';
import { entries as entriesApi, topics as topicsApi, settings as settingsApi, retryDelayMs } from '../services/api.js';
import { loadAiConfig, autoCaloriesOnSave } from '../services/aiAssistant.js';
import { uploadEntryImage, bestEffortDeleteImages, collectImageKeys, loadImageStorageConfig, type EntryImage } from '../services/imageStorage.js';
import { filterDeletableImageKeys } from '../utils/entryActions.js';
import { getOrCreateJournalTopic } from '../utils/getOrCreateJournalTopic.js';
import { stripHtml, summarizeUserFields, builtinEntryName } from '../utils/stripHtml.js';
import type { RecipeFieldValues } from '../types/fields.js';
import { recipeShareHtml } from '../utils/recipeShareHtml.js';
import { toDateStr } from '../utils/dateUtils.js';
import type { EncryptedPost } from '@shared/crypto/types';
import { featureFlagsFrom } from '../utils/featureFlags.js';
import { defaultShoppingListTitle } from '../utils/kitchen.js';

const NewEntryDateNote = styled.div`
  margin: 16px 20px 0;
  padding: 6px 0;
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-accent);
`;

const DateFilterBar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 14px 20px;
  background: transparent;
  border: none;
  border-top: 1px solid var(--rule, ${({ theme }) => theme.colors.border});
  border-bottom: 1px solid var(--rule, ${({ theme }) => theme.colors.border});
  border-radius: 0;
  font-family: var(--mono, ${({ theme }) => theme.fontFamily.mono});
  font-size: 10.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-3, ${({ theme }) => theme.colors.text});
`;

const DateFilterClear = styled.button`
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  font-family: var(--mono, ${({ theme }) => theme.fontFamily.mono});
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-3, ${({ theme }) => theme.colors.text});
  background: transparent;
  border: 1px solid var(--rule, ${({ theme }) => theme.colors.border});
  border-radius: var(--r-sm, 2px);
  cursor: pointer;
  &:hover { background: var(--paper-hover); }
`;

const editorExpandIn = keyframes`
  from { opacity: 0.6; transform: scale(0.985); }
  to   { opacity: 1;   transform: scale(1); }
`;

/* Wraps the editor panel content; clicking into the entry text expands it
   to a full-screen focus overlay, collapsed again on save/Escape/close. */
const EditorFocusWrap = styled.div<{ $expanded?: boolean }>`
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;

  ${({ $expanded }) => $expanded && css`
    position: fixed;
    inset: 0;
    z-index: 100;
    background: var(--bg-app);
    animation: ${editorExpandIn} 160ms ease-out;
  `}
`;

const EditorCollapseBtn = styled.button`
  position: absolute;
  top: 14px;
  right: 18px;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  transition: color 120ms ease;
  &:hover { color: var(--text-primary); }
`;

/* DS rail search — pill-shaped, icon + input, sunken fill. */
const SearchBlock = styled.div`
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
`;

const SearchPill = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: var(--r-full, 999px);
  background: var(--bg-sunken);
`;

const SearchPillInput = styled.input`
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  outline: none;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-primary);
  &::placeholder { color: var(--text-tertiary); }
`;

/** Compact change-detection signature for the entry's image set. */
const imagesSig = (imgs: EntryImage[], featured: string | null) =>
  JSON.stringify([imgs.map(i => i.key), featured]);

export function JournalView() {
  const { encryptionData } = useAuth();
  const { isUnlocked, isRestoring, unlock, decryptPosts, encryptPost, encryptBytes, decryptBytes } = useEncryption();
  const {
    decryptedEntries, setDecryptedEntries, setRawEntries,
    topics, setTopics, setFeatureFlags, isInitialized, setLoading, isLoading,
    addDecryptedEntry, updateDecryptedEntry, removeEntry,
  } = useEntriesStore();
  const selectedEntryId = useUIStore(s => s.selectedEntryId);
  const setSelectedEntryId = useUIStore(s => s.setSelectedEntryId);
  const showMobileEditor = useUIStore(s => s.showMobileEditor);
  const setShowMobileEditor = useUIStore(s => s.setShowMobileEditor);
  const viewMode = useUIStore(s => s.viewMode);
  const setViewMode = useUIStore(s => s.setViewMode);
  const topicCustomFields = useUIStore(s => s.topicCustomFields);
  const setAccentColor = useUIStore(s => s.setAccentColor);
  const setThemeMode = useUIStore(s => s.setThemeMode);
  const setBackgroundImage = useUIStore(s => s.setBackgroundImage);
  const setBackgroundOpacity = useUIStore(s => s.setBackgroundOpacity);
  const setTopicCustomFields = useUIStore(s => s.setTopicCustomFields);
  const searchKeyword = useUIStore(s => s.searchKeyword);
  const setSearchKeyword = useUIStore(s => s.setSearchKeyword);
  const imagesEnabled = useUIStore(s => s.imagesEnabled);
  const imagesConfigured = useUIStore(s => s.imagesConfigured);
  const setImagesEnabled = useUIStore(s => s.setImagesEnabled);
  const setImagesConfigured = useUIStore(s => s.setImagesConfigured);
  const imagesReady = imagesEnabled && imagesConfigured;
  const navigate = useNavigate();

  const entryDates = useMemo(() => {
    const set = new Set<string>();
    for (const e of decryptedEntries) {
      const d = e.createdAt instanceof Date ? e.createdAt : new Date(e.createdAt as unknown as string);
      set.add(toDateStr(d));
    }
    return set;
  }, [decryptedEntries]);

  const selectedDate = useUIStore(s => s.selectedDate);
  const setSelectedDate = useUIStore(s => s.setSelectedDate);
  const [calendarExpanded, setCalendarExpanded] = useState(false);
  const [editorExpanded, setEditorExpanded] = useState(false);
  const [editorContent, setEditorContent] = useState('');
  const [editorTopicId, setEditorTopicId] = useState<number | null>(null);
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({});
  const [widgetType, setWidgetType] = useState<string | null>(null);
  const [entryImages, setEntryImages] = useState<EntryImage[]>([]);
  const [featuredKey, setFeaturedKey] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const loadedStateRef = useRef({ content: '', customFields: '{}', images: imagesSig([], null) });
  const dictationControlRef = useRef<DictationControls | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  // Set when arriving from the calendar's "Add" button — the next created entry is dated to this day (YYYY-MM-DD)
  const [pendingEntryDate, setPendingEntryDate] = useState<string | null>(null);
  // On arrival the entry-load effect may still run once with a stale selectedEntryId from the store;
  // this flag makes that first run skip clearing the pending date
  const calendarArrivalRef = useRef(false);
  const location = useLocation();

  useEffect(() => {
    const state = location.state as { newEntryDate?: string; from?: string } | null;
    if (state?.newEntryDate) {
      const dateStr = state.newEntryDate;
      calendarArrivalRef.current = true;
      setSelectedEntryId(null);
      setPendingEntryDate(dateStr);
      setSelectedDate(new Date(dateStr + 'T00:00:00'));
      setViewMode('date');
      setShowMobileEditor(true);
      // Keep the origin view so the breadcrumb can still lead back to it
      navigate(location.pathname, { replace: true, state: state.from ? { from: state.from } : null });
    }
  }, [location.state]);

  const isWellnessEntry = useMemo(() => {
    if (!editorTopicId) return false;
    return topics.find(t => t.id === editorTopicId)?.name?.toLowerCase() === 'wellness';
  }, [editorTopicId, topics]);

  // Recipes share their formatted fields (name, ingredients, method) — and are
  // exempt from the images-block-share rule since the photo itself never leaves
  const isRecipeEntry = useMemo(() => {
    if (!editorTopicId) return false;
    const name = topics.find(t => t.id === editorTopicId)?.name?.toLowerCase();
    return name === 'recipe' || name === 'recipes';
  }, [editorTopicId, topics]);

  // Wellness auto-save: saves without closing the editor
  const wellnessAutoDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wellnessAutoSaveDoRef = useRef<() => Promise<void>>(async () => {});
  wellnessAutoSaveDoRef.current = async () => {
    if (!editorTopicId) return;
    const metadata: Record<string, unknown> = { _taxonomyId: editorTopicId };
    if (widgetType) metadata._widgetType = widgetType;
    if (Object.keys(customFields).length > 0) metadata._customFields = customFields;
    if (entryImages.length > 0) {
      metadata._images = entryImages;
      if (featuredKey) metadata._featuredKey = featuredKey;
    }
    const hasText = !!stripHtml(editorContent).trim();
    let finalContent = editorContent;
    if (!hasText) {
      const w = (customFields.waterGlasses as number) || 0;
      const g = (customFields.waterGoal as number) || 8;
      const m = (customFields.moodScore as number) || 0;
      const s = (customFields.sleepHours as number) || 0;
      const parts = [w > 0 ? `${w}/${g} glasses` : '', m > 0 ? `Mood ${m}/5` : '', s > 0 ? `${s}h sleep` : ''].filter(Boolean);
      finalContent = `<p>${parts.join(' · ') || 'Wellness check-in'}</p>`;
    }
    try {
      const encrypted = await encryptPost(finalContent, metadata);
      if (selectedEntryId) {
        await entriesApi.update(selectedEntryId, {
          contentEncrypted: encrypted.contentEncrypted, contentIv: encrypted.contentIv,
          metadataEncrypted: encrypted.metadataEncrypted, metadataIv: encrypted.metadataIv,
          taxonomyIds: [editorTopicId],
        });
        updateDecryptedEntry(selectedEntryId, { content: finalContent, metadata });
      } else {
        const result = await entriesApi.create({
          contentEncrypted: encrypted.contentEncrypted, contentIv: encrypted.contentIv,
          metadataEncrypted: encrypted.metadataEncrypted, metadataIv: encrypted.metadataIv,
          isEncrypted: true, taxonomyIds: [editorTopicId],
        });
        addDecryptedEntry({ id: result.id as number, content: finalContent, metadata, isEncrypted: true,
          createdAt: new Date(result.createdAt as string), updatedAt: new Date((result.updatedAt || result.createdAt) as string) });
        setSelectedEntryId(result.id as number);
      }
    } catch (err) { console.error('Wellness auto-save failed:', err); }
  };

  const scheduleWellnessAutoSave = useCallback(() => {
    if (wellnessAutoDebounceRef.current) clearTimeout(wellnessAutoDebounceRef.current);
    wellnessAutoDebounceRef.current = setTimeout(() => { wellnessAutoSaveDoRef.current(); }, 600);
  }, []);

  // Auto-save: fires 3s after user stops editing, saves in place without closing the editor
  const autoSaveDoRef = useRef<() => Promise<void>>(async () => {});
  autoSaveDoRef.current = async () => {
    const currentContent = editorContent;
    const currentFields = JSON.stringify(customFields);
    const currentImages = imagesSig(entryImages, featuredKey);
    if (
      currentContent === loadedStateRef.current.content &&
      currentFields === loadedStateRef.current.customFields &&
      currentImages === loadedStateRef.current.images
    ) return;
    const hasText = !!stripHtml(currentContent).trim();
    const hasDrawing = currentContent.includes('data-type="drawing"');
    const hasFieldData = Object.keys(customFields).length > 0;
    if (!hasText && !hasDrawing && entryImages.length === 0 && !hasFieldData) return;

    let effectiveTopicId = editorTopicId;
    if (!effectiveTopicId) {
      effectiveTopicId = await getOrCreateJournalTopic();
      setEditorTopicId(effectiveTopicId);
    }
    const metadata: Record<string, unknown> = {};
    if (effectiveTopicId) metadata._taxonomyId = effectiveTopicId;
    if (widgetType) metadata._widgetType = widgetType;
    if (Object.keys(customFields).length > 0) metadata._customFields = customFields;
    if (entryImages.length > 0) {
      metadata._images = entryImages;
      if (featuredKey) metadata._featuredKey = featuredKey;
    }
    try {
      const encrypted = await encryptPost(currentContent, metadata);
      if (selectedEntryId) {
        await entriesApi.update(selectedEntryId, {
          contentEncrypted: encrypted.contentEncrypted, contentIv: encrypted.contentIv,
          metadataEncrypted: encrypted.metadataEncrypted, metadataIv: encrypted.metadataIv,
          taxonomyIds: effectiveTopicId ? [effectiveTopicId] : [],
        });
        updateDecryptedEntry(selectedEntryId, { content: currentContent, metadata });
      } else {
        const result = await entriesApi.create({
          contentEncrypted: encrypted.contentEncrypted, contentIv: encrypted.contentIv,
          metadataEncrypted: encrypted.metadataEncrypted, metadataIv: encrypted.metadataIv,
          isEncrypted: true, taxonomyIds: effectiveTopicId ? [effectiveTopicId] : [],
          ...(pendingEntryDate ? { createdAt: new Date(pendingEntryDate + 'T12:00:00').toISOString() } : {}),
        });
        const newId = result.id as number;
        addDecryptedEntry({ id: newId, content: currentContent, metadata, isEncrypted: true,
          createdAt: new Date(result.createdAt as string), updatedAt: new Date((result.updatedAt || result.createdAt) as string) });
        setPendingEntryDate(null);
        setSelectedEntryId(newId);
      }
      loadedStateRef.current = { content: currentContent, customFields: currentFields, images: currentImages };
      setLastSavedAt(new Date());
    } catch (err) { console.error('Auto-save failed:', err); }
  };

  useEffect(() => {
    const timer = setTimeout(() => { autoSaveDoRef.current(); }, 3000);
    return () => clearTimeout(timer);
  }, [editorContent, customFields, entryImages, featuredKey]);

  useEffect(() => {
    if (!editorExpanded) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setEditorExpanded(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editorExpanded]);

  /* Mirror the expanded state into uiStore so AppTemplate hides the mobile
     chrome — otherwise the fixed overlay is trapped in MainColumn's transform
     containing block and sits behind/beside the mobile nav. */
  useEffect(() => {
    const { setEditorFocusMode, setMobileNavOpen } = useUIStore.getState();
    setEditorFocusMode(editorExpanded);
    if (editorExpanded) setMobileNavOpen(false);
    return () => setEditorFocusMode(false);
  }, [editorExpanded]);

  const handleUnlock = useCallback(async (password: string, remember = false) => {
    if (!encryptionData?.kekSalt || !encryptionData?.encryptedMasterKey || !encryptionData?.kekWrapIv) {
      throw new Error('Missing encryption data');
    }
    await unlock(password, encryptionData.kekSalt, encryptionData.encryptedMasterKey, encryptionData.kekWrapIv, encryptionData.kekIterations, remember);
  }, [encryptionData, unlock]);

  useEffect(() => {
    if (!isUnlocked || isInitialized) return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    const load = async () => {
      setLoading(true);
      try {
        const [rawEntries, topicsData, settingsData] = await Promise.all([
          entriesApi.getAll(), topicsApi.getAll(), settingsApi.getAll(),
        ]);
        // Apply saved theme settings
        const settingsMap: Record<string, unknown> = {};
        for (const s of settingsData) settingsMap[s.key] = s.value;
        if (typeof settingsMap.accentColor === 'string') setAccentColor(settingsMap.accentColor);
        if (settingsMap.themeMode === 'light' || settingsMap.themeMode === 'dark') setThemeMode(settingsMap.themeMode);
        if (typeof settingsMap.backgroundImage === 'string') setBackgroundImage(settingsMap.backgroundImage);
        if (typeof settingsMap.backgroundOpacity === 'string') setBackgroundOpacity(parseFloat(settingsMap.backgroundOpacity as string));
        if (settingsMap.topicCustomFields && typeof settingsMap.topicCustomFields === 'object' && !Array.isArray(settingsMap.topicCustomFields)) {
          setTopicCustomFields(settingsMap.topicCustomFields as import('../types/userFields.js').TopicCustomFields);
        }
        if (settingsMap.topicHideText && typeof settingsMap.topicHideText === 'object' && !Array.isArray(settingsMap.topicHideText)) {
          useUIStore.getState().setTopicHideText(settingsMap.topicHideText as Record<number, boolean>);
        }
        // Editor-affecting settings the shared init hook loads — must load here
        // too or wellness period/flow and calendar-sync fields vanish when the
        // app initializes via /journal
        if (typeof settingsMap.cycleTrackingEnabled === 'boolean') useUIStore.getState().setCycleTrackingEnabled(settingsMap.cycleTrackingEnabled);
        if (typeof settingsMap.calendarSyncEnabled === 'boolean') useUIStore.getState().setCalendarSyncEnabled(settingsMap.calendarSyncEnabled);
        if (typeof settingsMap.displayName === 'string') useUIStore.getState().setDisplayName(settingsMap.displayName);
        // Entry images are opt-in (default false); credentials are a master-key-encrypted setting
        if (typeof settingsMap.imagesEnabled === 'boolean') setImagesEnabled(settingsMap.imagesEnabled);
        loadImageStorageConfig(settingsMap.imageStorageConfig, decryptBytes)
          .then(setImagesConfigured)
          .catch(() => setImagesConfigured(false));
        // AI provider credentials — also a master-key-encrypted setting
        void loadAiConfig(settingsMap.aiConfig, decryptBytes);
        // Feature flags (must be set before setTopics so filtering works);
        // never-saved flags default to enabled, same as useInitializeData
        setFeatureFlags(featureFlagsFrom(settingsMap));
        setTopics(topicsData);
        const encrypted: EncryptedPost[] = rawEntries.map(e => ({
          id: e.id as number,
          contentEncrypted: (e.contentEncrypted as string) || null,
          contentIv: (e.contentIv as string) || null,
          metadataEncrypted: (e.metadataEncrypted as string) || null,
          metadataIv: (e.metadataIv as string) || null,
          isEncrypted: e.isEncrypted as boolean,
          content: e.content as string | undefined,
          metadata: e.metadata as Record<string, unknown> | undefined,
          createdAt: new Date(e.createdAt as string),
          updatedAt: new Date((e.updatedAt || e.createdAt) as string),
        }));
        setRawEntries(encrypted);

        // Decrypt entries individually — skip ones that fail
        const decrypted: import('@shared/crypto/types').DecryptedPost[] = [];
        for (const entry of encrypted) {
          try {
            const d = await decryptPosts([entry]);
            decrypted.push(...d);
          } catch (err) {
            console.warn(`Skipping entry ${entry.id} — decryption failed:`, err);
            // Add a placeholder so we don't lose it
            decrypted.push({
              id: entry.id,
              content: '[Decryption failed]',
              metadata: {},
              isEncrypted: entry.isEncrypted,
              createdAt: entry.createdAt,
              updatedAt: entry.updatedAt,
            });
          }
        }
        setDecryptedEntries(decrypted);
        setLoading(false);
      } catch (err) {
        // Transient failure (rate limit, server restart, network): keep the
        // loading state and retry with backoff (honoring Retry-After) rather
        // than showing an empty journal, which reads as data loss
        const delay = retryDelayMs(err, attempt++);
        console.error(`Failed to load, retrying in ${Math.round(delay / 1000)}s:`, err);
        if (!cancelled) retryTimer = setTimeout(load, delay);
      }
    };
    load();
    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
    };
  }, [isUnlocked, isInitialized]);

  useEffect(() => {
    if (selectedEntryId) {
      const entry = decryptedEntries.find(e => e.id === selectedEntryId);
      if (entry) {
        const meta = entry.metadata as Record<string, unknown>;
        const cf = meta?._customFields as Record<string, unknown> ?? {};
        setEditorContent(entry.content);
        const imgs = Array.isArray(meta?._images) ? (meta._images as EntryImage[]) : [];
        const feat = typeof meta?._featuredKey === 'string' ? (meta._featuredKey as string) : null;
        setEditorTopicId(meta?._taxonomyId as number | null ?? null);
        setCustomFields(cf);
        setWidgetType(meta?._widgetType as string | null ?? null);
        setEntryImages(imgs);
        setFeaturedKey(feat);
        setImageError('');
        setShowMobileEditor(true);
        loadedStateRef.current = { content: entry.content, customFields: JSON.stringify(cf), images: imagesSig(imgs, feat) };
        setLastSavedAt(null);
        if (calendarArrivalRef.current) calendarArrivalRef.current = false;
        else setPendingEntryDate(null);
      }
    } else {
      setEditorContent('');
      setEditorTopicId(null);
      setCustomFields({});
      setWidgetType(null);
      setEntryImages([]);
      setFeaturedKey(null);
      setImageError('');
      loadedStateRef.current = { content: '', customFields: '{}', images: imagesSig([], null) };
      setLastSavedAt(null);
      calendarArrivalRef.current = false;
    }
  }, [selectedEntryId, decryptedEntries]);

  const handleSave = useCallback(async () => {
    const hasDrawing = editorContent.includes('data-type="drawing"');
    const hasText = !!stripHtml(editorContent).trim();
    const userFieldDefs = editorTopicId != null ? (topicCustomFields[editorTopicId] ?? []) : [];
    const userFieldValues = (customFields._userFields as Record<string, unknown>) ?? {};
    const hasFieldValues = userFieldDefs.length > 0 && summarizeUserFields(userFieldDefs, userFieldValues) !== '';
    const hasFieldData = Object.keys(customFields).length > 0;
    if (!hasText && !hasDrawing && !hasFieldValues && !hasFieldData && entryImages.length === 0) return;
    let finalContent = editorContent;
    setIsSaving(true); setSaveStatus('');

    // Resolve effective topic — fall back to "Journal" if none selected
    let effectiveTopicId = editorTopicId;
    if (!effectiveTopicId) {
      effectiveTopicId = await getOrCreateJournalTopic();
      setEditorTopicId(effectiveTopicId);
    }

    try {
      // AI assistant: fill blank calories on Meals/Exercise entries, or refresh
      // an earlier AI estimate whose inputs changed. A failed estimate never
      // blocks the save.
      let fieldsToSave = customFields;
      const topicName = topics.find(t => t.id === effectiveTopicId)?.name.toLowerCase();
      // A shopping list saved without a title gets a dated one
      if (!hasText && !hasDrawing && topicName === 'shopping list') {
        finalContent = `<p>${defaultShoppingListTitle()}</p>`;
        setEditorContent(finalContent);
      }
      const calorieKind = topicName === 'meals' ? 'food' : topicName === 'exercise' ? 'exercise' : null;
      if (calorieKind) {
        const estimated = await autoCaloriesOnSave(calorieKind, stripHtml(finalContent), customFields).catch(() => null);
        if (estimated) { fieldsToSave = estimated; setCustomFields(estimated); }
      }

      const metadata: Record<string, unknown> = {};
      if (effectiveTopicId) metadata._taxonomyId = effectiveTopicId;
      if (widgetType) metadata._widgetType = widgetType;
      if (Object.keys(fieldsToSave).length > 0) metadata._customFields = fieldsToSave;
      if (entryImages.length > 0) {
        metadata._images = entryImages;
        if (featuredKey) metadata._featuredKey = featuredKey;
      }
      const encrypted = await encryptPost(finalContent, metadata);

      // Saving keeps the entry open — the editor stays put with a saved status
      if (selectedEntryId) {
        await entriesApi.update(selectedEntryId, {
          contentEncrypted: encrypted.contentEncrypted, contentIv: encrypted.contentIv,
          metadataEncrypted: encrypted.metadataEncrypted, metadataIv: encrypted.metadataIv,
          taxonomyIds: effectiveTopicId ? [effectiveTopicId] : [],
        });
        updateDecryptedEntry(selectedEntryId, { content: finalContent, metadata });
      } else {
        const result = await entriesApi.create({
          contentEncrypted: encrypted.contentEncrypted, contentIv: encrypted.contentIv,
          metadataEncrypted: encrypted.metadataEncrypted, metadataIv: encrypted.metadataIv,
          isEncrypted: true, taxonomyIds: effectiveTopicId ? [effectiveTopicId] : [],
          ...(pendingEntryDate ? { createdAt: new Date(pendingEntryDate + 'T12:00:00').toISOString() } : {}),
        });
        addDecryptedEntry({ id: result.id as number, content: finalContent, metadata, isEncrypted: true,
          createdAt: new Date(result.createdAt as string), updatedAt: new Date((result.updatedAt || result.createdAt) as string) });
        setPendingEntryDate(null);
        setSelectedEntryId(result.id as number);
      }
      loadedStateRef.current = { content: finalContent, customFields: JSON.stringify(fieldsToSave), images: imagesSig(entryImages, featuredKey) };
      setLastSavedAt(new Date());
    } catch (err) { console.error('Save failed:', err); setSaveStatus('Save failed'); }
    finally { setIsSaving(false); }
  }, [editorContent, selectedEntryId, editorTopicId, widgetType, customFields, topics, topicCustomFields, entryImages, featuredKey, pendingEntryDate, encryptPost, setSelectedEntryId, setShowMobileEditor]);

  /** Persist the image set into an existing entry's encrypted metadata.
   *  Rebuilds from the store entry (mirrors handleBookmark) so it is safe to
   *  call from upload completions that may race with autosave. */
  const persistImages = useCallback(async (entryId: number, imgs: EntryImage[], featKey: string | null) => {
    const entry = useEntriesStore.getState().decryptedEntries.find(e => e.id === entryId);
    if (!entry) return;
    const meta = { ...(entry.metadata as Record<string, unknown>) };
    if (imgs.length > 0) {
      meta._images = imgs;
      if (featKey && imgs.some(i => i.key === featKey)) meta._featuredKey = featKey;
      else delete meta._featuredKey;
    } else {
      delete meta._images;
      delete meta._featuredKey;
    }
    try {
      const encrypted = await encryptPost(entry.content, meta);
      await entriesApi.update(entryId, {
        contentEncrypted: encrypted.contentEncrypted, contentIv: encrypted.contentIv,
        metadataEncrypted: encrypted.metadataEncrypted, metadataIv: encrypted.metadataIv,
        taxonomyIds: meta._taxonomyId ? [meta._taxonomyId as number] : [],
      });
      updateDecryptedEntry(entryId, { metadata: meta });
      loadedStateRef.current.images = imagesSig(imgs, featKey);
    } catch (err) {
      console.error('Image metadata save failed:', err);
      setImageError('Failed to save images to the entry');
    }
  }, [encryptPost, updateDecryptedEntry]);

  const handleImagesSelected = useCallback(async (files: File[]) => {
    setImageError('');
    const remaining = 7 - entryImages.length;
    let selected = files;
    if (files.length > remaining) {
      setImageError(remaining <= 0
        ? 'This entry already has the maximum of 7 images'
        : `Only ${remaining} more image${remaining === 1 ? '' : 's'} can be added (max 7 per entry)`);
      selected = files.slice(0, Math.max(0, remaining));
    }
    if (selected.length === 0) return;

    setImageUploading(true);
    const uploaded: EntryImage[] = [];
    try {
      for (const file of selected) {
        uploaded.push(await uploadEntryImage(file, encryptBytes));
      }
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'Image upload failed');
    } finally {
      setImageUploading(false);
    }
    if (uploaded.length === 0) return;

    const nextImages = [...entryImages, ...uploaded];
    // The first image of an entry is featured by default (unstarring later is respected)
    const nextFeatured = entryImages.length === 0 && !featuredKey ? nextImages[0].key : featuredKey;
    setEntryImages(nextImages);
    setFeaturedKey(nextFeatured);
    // Autosave may have created the entry mid-upload — read the current id
    // from the store, never the closure
    const currentId = useUIStore.getState().selectedEntryId;
    if (currentId) await persistImages(currentId, nextImages, nextFeatured);
    // New entries: the autosave effect (which watches entryImages) persists them
  }, [entryImages, featuredKey, encryptBytes, persistImages]);

  /** Attach images picked from the library — no upload, the objects already
   *  exist in the bucket; only this entry's metadata gains references. */
  const handleExistingImagesSelected = useCallback(async (picked: EntryImage[]) => {
    setImageError('');
    const nextImages = [...entryImages];
    for (const img of picked) {
      if (nextImages.length >= 7) break;
      if (!nextImages.some(i => i.key === img.key)) nextImages.push(img);
    }
    if (nextImages.length === entryImages.length) return;
    // The first image of an entry is featured by default (matches upload)
    const nextFeatured = entryImages.length === 0 && !featuredKey ? nextImages[0].key : featuredKey;
    setEntryImages(nextImages);
    setFeaturedKey(nextFeatured);
    const currentId = useUIStore.getState().selectedEntryId;
    if (currentId) await persistImages(currentId, nextImages, nextFeatured);
    // New entries: the autosave effect (which watches entryImages) persists them
  }, [entryImages, featuredKey, persistImages]);

  const handleImageRemoved = useCallback(async (key: string) => {
    const img = entryImages.find(i => i.key === key);
    if (!img) return;
    const nextImages = entryImages.filter(i => i.key !== key);
    // Deleting the featured image promotes the next first image to the hero
    const nextFeatured = featuredKey === key ? (nextImages[0]?.key ?? null) : featuredKey;
    setEntryImages(nextImages);
    setFeaturedKey(nextFeatured);
    const currentId = useUIStore.getState().selectedEntryId;
    if (currentId) await persistImages(currentId, nextImages, nextFeatured);
    // Only delete from R2 when no other entry uses this image (library reuse)
    const deletable = filterDeletableImageKeys([img.key, img.thumbKey], currentId ? [currentId] : []);
    if (deletable.length > 0) void bestEffortDeleteImages(deletable);
  }, [entryImages, featuredKey, persistImages]);

  const handleSetFeatured = useCallback(async (key: string | null) => {
    setFeaturedKey(key);
    const currentId = useUIStore.getState().selectedEntryId;
    if (currentId) await persistImages(currentId, entryImages, key);
  }, [entryImages, persistImages]);

  const handleDelete = useCallback(async () => {
    if (!selectedEntryId) return;
    try {
      // Collect R2 keys before the entry (and its metadata) disappears —
      // objects still referenced by other entries stay in the bucket
      const entry = useEntriesStore.getState().decryptedEntries.find(e => e.id === selectedEntryId);
      const imageKeys = entry ? filterDeletableImageKeys(collectImageKeys([entry]), [selectedEntryId]) : [];
      await entriesApi.delete(selectedEntryId);
      removeEntry(selectedEntryId);
      if (imageKeys.length > 0) void bestEffortDeleteImages(imageKeys);
      setSelectedEntryId(null); setEditorContent(''); setEditorTopicId(null); setCustomFields({}); setWidgetType(null);
      setEntryImages([]); setFeaturedKey(null); setImageError('');
      setShowMobileEditor(false);
      setEditorExpanded(false);
    } catch (err) { console.error('Delete failed:', err); }
  }, [selectedEntryId]);

  /** Recipe view: append the recipe's ingredients to the most recent shopping
   *  list (creating one if none exists), cross-link both entries, then jump
   *  to the shopping lists view. */
  const handleAddToShoppingList = useCallback(async (recipe: RecipeFieldValues) => {
    try {
      const slTopic = topics.find(t => ['shopping list', 'shopping lists'].includes(t.name.toLowerCase()));
      if (!slTopic) return;
      const newItems = (recipe.ingredients ?? [])
        .filter(i => i.name.trim())
        .map(i => ({
          id: crypto.randomUUID(),
          name: [i.amount?.trim(), i.name.trim()].filter(Boolean).join(' '),
          category: 'other' as const,
          checked: false,
        }));
      if (newItems.length === 0) return;

      const target = useEntriesStore.getState().decryptedEntries
        .filter(e => (e.metadata as Record<string, unknown>)?._taxonomyId === slTopic.id)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

      let listId: number;
      if (target) {
        const meta = { ...(target.metadata as Record<string, unknown>) };
        const cf = { ...((meta._customFields as Record<string, unknown>) ?? {}) };
        cf.items = [...(Array.isArray(cf.items) ? (cf.items as unknown[]) : []), ...newItems];
        const linked = Array.isArray(cf.linkedRecipeIds) ? (cf.linkedRecipeIds as number[]) : [];
        if (selectedEntryId && !linked.includes(selectedEntryId)) cf.linkedRecipeIds = [...linked, selectedEntryId];
        meta._customFields = cf;
        const encrypted = await encryptPost(target.content, meta);
        await entriesApi.update(target.id, {
          contentEncrypted: encrypted.contentEncrypted, contentIv: encrypted.contentIv,
          metadataEncrypted: encrypted.metadataEncrypted, metadataIv: encrypted.metadataIv,
          taxonomyIds: [slTopic.id],
        });
        updateDecryptedEntry(target.id, { content: target.content, metadata: meta });
        listId = target.id;
      } else {
        const content = '<p>Groceries</p>';
        const metadata: Record<string, unknown> = {
          _taxonomyId: slTopic.id,
          _customFields: { items: newItems, notes: '', linkedRecipeIds: selectedEntryId ? [selectedEntryId] : [] },
        };
        const encrypted = await encryptPost(content, metadata);
        const result = await entriesApi.create({
          contentEncrypted: encrypted.contentEncrypted, contentIv: encrypted.contentIv,
          metadataEncrypted: encrypted.metadataEncrypted, metadataIv: encrypted.metadataIv,
          taxonomyIds: [slTopic.id],
        });
        addDecryptedEntry({
          id: result.id as number, content, metadata, isEncrypted: true,
          createdAt: new Date(result.createdAt as string),
          updatedAt: new Date((result.updatedAt || result.createdAt) as string),
        });
        listId = result.id as number;
      }

      // Link the shopping list back onto the recipe (autosave persists it)
      if (selectedEntryId) {
        const cur = Array.isArray(customFields.linkedShoppingListIds) ? (customFields.linkedShoppingListIds as number[]) : [];
        if (!cur.includes(listId)) setCustomFields({ ...customFields, linkedShoppingListIds: [...cur, listId] });
      }

      navigate('/shopping');
    } catch (err) { console.error('Add to shopping list failed:', err); }
  }, [topics, selectedEntryId, customFields, encryptPost, updateDecryptedEntry, addDecryptedEntry, navigate]);

  const handleNew = () => {
    // Discarding a never-saved entry: clean up any already-uploaded R2 objects
    if (!selectedEntryId && entryImages.length > 0) {
      void bestEffortDeleteImages(entryImages.flatMap(i => [i.key, i.thumbKey]));
    }
    setSelectedEntryId(null); setEditorContent(''); setEditorTopicId(null); setCustomFields({}); setWidgetType(null);
    setEntryImages([]); setFeaturedKey(null); setImageError('');
    setLastSavedAt(null);
    setPendingEntryDate(null);
    setShowMobileEditor(false);
    setEditorExpanded(false);
  };

  const handleMobileBack = () => {
    setShowMobileEditor(false);
    setEditorExpanded(false);
  };

  // Keep a fresh ref to handleSave so the global keydown listener never captures a stale version
  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  // Global keyboard shortcuts — read store directly to avoid stale refs
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S or Cmd+S → save current entry
      if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSaveRef.current();
        return;
      }
      // Ctrl+N or Cmd+N → new entry
      if (e.key === 'n' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setSelectedEntryId(null); setEditorContent(''); setEditorTopicId(null); setCustomFields({}); setWidgetType(null);
        setEntryImages([]); setFeaturedKey(null); setImageError('');
        setShowMobileEditor(true);
        return;
      }
      // Shift+N (when not in editable) → new entry
      if (e.key === 'N' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = (e.target as HTMLElement)?.tagName;
        const editable = (e.target as HTMLElement)?.isContentEditable;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || editable) return;
        e.preventDefault();
        setSelectedEntryId(null); setEditorContent(''); setEditorTopicId(null); setCustomFields({}); setWidgetType(null);
        setEntryImages([]); setFeaturedKey(null); setImageError('');
        setShowMobileEditor(true);
        return;
      }
      // Ctrl+D / Cmd+D → delete selected entry with confirmation
      if (e.key === 'd' && (e.ctrlKey || e.metaKey)) {
        const currentId = useUIStore.getState().selectedEntryId;
        if (!currentId) return;
        e.preventDefault();
        setPendingDeleteId(currentId);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  /** Toggle bookmark on the currently open entry (from EntryForm toolbar) */
  const handleBookmark = useCallback(async () => {
    if (!selectedEntryId) return;
    const entry = decryptedEntries.find(e => e.id === selectedEntryId);
    if (!entry) return;

    const newFavorite = !((entry.metadata as Record<string, unknown>)?._customFields as Record<string, unknown>)?._isFavorite;
    const updatedCustomFields = { ...customFields, _isFavorite: newFavorite };

    // Optimistic update in store + form state — spread the existing metadata
    // so images, featured key, and widget type survive the bookmark toggle
    setCustomFields(updatedCustomFields);
    const updatedMeta: Record<string, unknown> = { ...(entry.metadata as Record<string, unknown>) };
    if (editorTopicId) updatedMeta._taxonomyId = editorTopicId;
    updatedMeta._customFields = updatedCustomFields;
    updateDecryptedEntry(selectedEntryId, { metadata: updatedMeta });

    // Persist to server
    try {
      const encrypted = await encryptPost(editorContent, updatedMeta);
      await entriesApi.update(selectedEntryId, {
        contentEncrypted: encrypted.contentEncrypted, contentIv: encrypted.contentIv,
        metadataEncrypted: encrypted.metadataEncrypted, metadataIv: encrypted.metadataIv,
        taxonomyIds: editorTopicId ? [editorTopicId] : [],
      });
    } catch (err) { console.error('Bookmark save failed:', err); }
  }, [selectedEntryId, decryptedEntries, customFields, editorContent, editorTopicId, encryptPost]);

  /** Toggle bookmark on a card in the list (persist immediately) */
  const handleBookmarkFromCard = useCallback(async (entryId: number, isFavorite: boolean) => {
    const entry = decryptedEntries.find(e => e.id === entryId);
    if (!entry) return;

    const meta = entry.metadata as Record<string, unknown>;
    const existingFields = (meta?._customFields as Record<string, unknown>) || {};
    const updatedFields = { ...existingFields, _isFavorite: isFavorite };
    const updatedMeta = { ...meta, _customFields: updatedFields };

    // Persist to server
    try {
      const encrypted = await encryptPost(entry.content, updatedMeta);
      await entriesApi.update(entryId, {
        contentEncrypted: encrypted.contentEncrypted, contentIv: encrypted.contentIv,
        metadataEncrypted: encrypted.metadataEncrypted, metadataIv: encrypted.metadataIv,
      });
    } catch (err) { console.error('Bookmark save failed:', err); }
    // Store is already updated optimistically by EntryList
  }, [decryptedEntries, encryptPost]);

  const handleQuickCreate = useCallback(async (content: string, topicId: number | null) => {
    try {
      const metadata: Record<string, unknown> = {};
      if (topicId) metadata._taxonomyId = topicId;
      const encrypted = await encryptPost(content, metadata);
      const result = await entriesApi.create({
        contentEncrypted: encrypted.contentEncrypted, contentIv: encrypted.contentIv,
        metadataEncrypted: encrypted.metadataEncrypted, metadataIv: encrypted.metadataIv,
        isEncrypted: true, taxonomyIds: topicId ? [topicId] : [],
      });
      addDecryptedEntry({ id: result.id as number, content, metadata, isEncrypted: true,
        createdAt: new Date(result.createdAt as string), updatedAt: new Date((result.updatedAt || result.createdAt) as string) });
    } catch (err) { console.error('Quick create failed:', err); }
  }, [encryptPost]);

  if (encryptionData?.encryptionEnabled && !isUnlocked && !isRestoring) {
    return (<><AppTemplate><EmptyEditor>Unlock your journal to view entries</EmptyEditor></AppTemplate><UnlockDialog onUnlock={handleUnlock} /></>);
  }

  if (isLoading || (isRestoring && !isUnlocked)) {
    return (<AppTemplate><LoadingCenter><Spinner size={40} /></LoadingCenter></AppTemplate>);
  }

  return (
    <AppTemplate transparentContent hideAccentStripe>
      <JournalTemplate
        sidePanel={
          <SidePanel hiddenMobile={showMobileEditor}>
            <SearchBlock>
              <SearchPill>
                <Icon name="search" size={14} strokeWidth={2} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                <SearchPillInput
                  placeholder="Search or filter"
                  value={searchKeyword}
                  onChange={e => setSearchKeyword(e.target.value)}
                />
                {searchKeyword && (
                  <FontAwesomeIcon
                    icon={faXmark}
                    style={{ cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 12 }}
                    onClick={() => setSearchKeyword('')}
                  />
                )}
              </SearchPill>
            </SearchBlock>
            <ViewTabs
              onDateTabClick={() => setCalendarExpanded(prev => !prev)}
              onTodayClick={() => setCalendarExpanded(false)}
              onNewEntry={() => {
                setSelectedEntryId(null);
                setShowMobileEditor(true);
              }}
            />
            {viewMode === 'date' && (
              <DateFilterBar>
                {selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                <DateFilterClear onClick={() => { setViewMode('all'); setCalendarExpanded(false); }}>
                  <FontAwesomeIcon icon={faXmark} size="xs" /> Clear
                </DateFilterClear>
              </DateFilterBar>
            )}
            {viewMode === 'date' && calendarExpanded && (
              <MiniCalendar
                selectedDate={selectedDate}
                onSelectDate={(date) => { setSelectedDate(date); setCalendarExpanded(false); }}
                entryDates={entryDates}
              />
            )}
            {viewMode === 'search' && <SearchPanel />}
            <QuickEntryCard>
              <QuickEntry onCreateEntry={handleQuickCreate} />
            </QuickEntryCard>
            <EntryList onToggleBookmark={handleBookmarkFromCard} />
          </SidePanel>
        }
        editorPanel={
          <EditorPanel visibleMobile={showMobileEditor}>
            <MobileBackButton onClick={handleMobileBack} />
            <EditorFocusWrap
              $expanded={editorExpanded}
              onFocus={e => { if ((e.target as HTMLElement).closest?.('.tiptap')) setEditorExpanded(true); }}
              onPointerDown={e => { if ((e.target as HTMLElement).closest?.('.tiptap')) setEditorExpanded(true); }}
            >
            {editorExpanded && (
              <EditorCollapseBtn title="Collapse" onClick={() => setEditorExpanded(false)} type="button">
                <Icon name="x" size={18} strokeWidth={2} />
              </EditorCollapseBtn>
            )}
            {pendingEntryDate && selectedEntryId === null && (
              <NewEntryDateNote>
                New entry for {new Date(pendingEntryDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </NewEntryDateNote>
            )}
            <EntryForm
              entryId={selectedEntryId}
              content={editorContent}
              onContentChange={setEditorContent}
              topicId={editorTopicId}
              onTopicChange={setEditorTopicId}
              topics={topics}
              customFields={customFields}
              onCustomFieldsChange={setCustomFields}
              onSave={handleSave}
              onAutoSave={isWellnessEntry ? scheduleWellnessAutoSave : undefined}
              onDelete={selectedEntryId ? handleDelete : undefined}
              onNew={handleNew}
              onBookmark={handleBookmark}
              originPath={(location.state as { from?: string } | null)?.from}
              onNavigate={path => {
                // The Journal crumb returns to the entry list — on mobile
                // that means closing the editor so the list is full-width
                if (path === '/journal') handleMobileBack();
                navigate(path);
              }}
              onShare={entryImages.length > 0 && !isRecipeEntry ? undefined : () => setShareOpen(true)}
              onAddToShoppingList={handleAddToShoppingList}
              onAddToMenu={() => navigate('/menu')}
              onBack={handleMobileBack}
              isEditing={selectedEntryId !== null}
              isSaving={isSaving}
              saveStatus={saveStatus}
              lastSavedAt={lastSavedAt}
              dictationControlRef={dictationControlRef}
              images={entryImages}
              featuredKey={featuredKey}
              onImagesSelected={handleImagesSelected}
              onExistingImagesSelected={handleExistingImagesSelected}
              onImageRemoved={handleImageRemoved}
              onSetFeatured={handleSetFeatured}
              imageUploading={imageUploading}
              imageError={imageError}
              imagesReady={imagesReady}
            />
            </EditorFocusWrap>
          </EditorPanel>
        }
      />

      {shareOpen && selectedEntryId && (entryImages.length === 0 || isRecipeEntry) && (
        <ShareModal
          entryId={selectedEntryId}
          entryContent={
            /* Recipes share their full formatted fields; other field-only
               entries (e.g. events) fall back to their name field */
            isRecipeEntry
              ? recipeShareHtml({ servings: '', prepTime: '', cookTime: '', cuisine: '', ingredients: [], instructions: '', linkedShoppingListIds: [], ...(customFields as Partial<RecipeFieldValues>) } as RecipeFieldValues)
              : stripHtml(editorContent).trim()
                ? editorContent
                : `<p>${builtinEntryName(customFields)
                    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`
          }
          onClose={() => setShareOpen(false)}
        />
      )}

      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="Delete Entry"
        message="Are you sure you want to delete this entry? This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          if (pendingDeleteId) {
            const entry = useEntriesStore.getState().decryptedEntries.find(e => e.id === pendingDeleteId);
            const imageKeys = entry ? filterDeletableImageKeys(collectImageKeys([entry]), [pendingDeleteId]) : [];
            entriesApi.delete(pendingDeleteId).then(() => {
              useEntriesStore.getState().removeEntry(pendingDeleteId);
              if (imageKeys.length > 0) void bestEffortDeleteImages(imageKeys);
              useUIStore.getState().setSelectedEntryId(null);
              useUIStore.getState().setShowMobileEditor(false);
              setEditorContent(''); setEditorTopicId(null); setCustomFields({});
              setEntryImages([]); setFeaturedKey(null); setImageError('');
              setEditorExpanded(false);
            }).catch(err => console.error('Delete failed:', err));
          }
          setPendingDeleteId(null);
        }}
        onCancel={() => setPendingDeleteId(null)}
      />
    </AppTemplate>
  );
}
