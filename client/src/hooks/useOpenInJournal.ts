import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { journalOriginState } from '../utils/topicBreadcrumb.js';
import { useUIStore } from '../stores/uiStore.js';

/**
 * Open an entry in the journal editor — the single place entries are edited.
 * List views (Health, Planning, Topics, Entertainment, …) call this on row
 * click or swipe-edit; the view it came from rides along as router state so
 * the editor's breadcrumb leads back to it.
 */
export function useOpenInJournal() {
  const navigate = useNavigate();
  const location = useLocation();
  const setSelectedEntryId = useUIStore(s => s.setSelectedEntryId);
  const setShowMobileEditor = useUIStore(s => s.setShowMobileEditor);
  const setViewMode = useUIStore(s => s.setViewMode);

  return useCallback((entryId: number) => {
    setViewMode('all'); // ensure the entry is visible in the journal list
    setSelectedEntryId(entryId);
    setShowMobileEditor(true);
    navigate('/journal', { state: journalOriginState(location.pathname, location.search) });
  }, [navigate, location.pathname, location.search, setSelectedEntryId, setShowMobileEditor, setViewMode]);
}

/**
 * Start a NEW entry for a topic in the journal editor (no inline forms on
 * list pages). Opens in edit view: full-width editor, list filtered to the
 * topic, and Save returns to the page it came from.
 */
export function useNewEntryInJournal() {
  const navigate = useNavigate();
  const location = useLocation();
  const setSelectedEntryId = useUIStore(s => s.setSelectedEntryId);
  const setShowMobileEditor = useUIStore(s => s.setShowMobileEditor);

  /** `fields` presets the new entry's custom fields (e.g. a board column's status) */
  return useCallback((topicId: number, fields?: Record<string, unknown>) => {
    setSelectedEntryId(null);
    setShowMobileEditor(true);
    navigate('/journal', { state: { newEntryTopicId: topicId, newEntryFields: fields, ...journalOriginState(location.pathname, location.search) } });
  }, [navigate, location.pathname, location.search, setSelectedEntryId, setShowMobileEditor]);
}
