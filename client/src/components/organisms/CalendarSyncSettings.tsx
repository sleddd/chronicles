import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SettingsCard, SettingsRow } from '../molecules/SettingsCard.js';
import { ActionButton } from '../atoms/SettingsAtoms.js';
import { Toggle } from '../atoms/Toggle.js';
import { Select } from '../atoms/Select.js';
import { Spinner } from '../atoms/Spinner.js';
import { useUIStore } from '../../stores/uiStore.js';
import { useEncryption } from '../../contexts/EncryptionContext.js';
import { settings as settingsApi, calendar as calendarApi, ApiError, type CalendarStatus } from '../../services/api.js';
import {
  runCalendarSync,
  listWritableCalendars,
  invalidateCalendarStatus,
  getCalendarSyncUiState,
  subscribeCalendarSync,
  getImportedEntries,
  removeImportedEntries,
  getEventEntriesOutsideYear,
  removeEntriesLocally,
  type CalendarSyncUiState,
} from '../../services/calendarSync.js';

interface CalendarOption {
  id: string;
  summary: string;
  primary: boolean;
}

export function CalendarSyncSettings({ themeMode }: { themeMode: 'light' | 'dark' }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { encryptPost } = useEncryption();

  const calendarSyncEnabled = useUIStore(s => s.calendarSyncEnabled);
  const setCalendarSyncEnabled = useUIStore(s => s.setCalendarSyncEnabled);
  const googleCalendarId = useUIStore(s => s.googleCalendarId);
  const setGoogleCalendarId = useUIStore(s => s.setGoogleCalendarId);
  const setGoogleSyncToken = useUIStore(s => s.setGoogleSyncToken);
  const calendarImportMode = useUIStore(s => s.calendarImportMode);
  const setCalendarImportMode = useUIStore(s => s.setCalendarImportMode);

  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [statusError, setStatusError] = useState('');
  const [connectMessage, setConnectMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnectArmed, setDisconnectArmed] = useState(false);
  const [calendars, setCalendars] = useState<CalendarOption[] | null>(null);
  const [pendingCalendarId, setPendingCalendarId] = useState<string | null>(null);
  const [syncUi, setSyncUi] = useState<CalendarSyncUiState>(getCalendarSyncUiState());
  const [icsBusy, setIcsBusy] = useState(false);
  const [copied, setCopied] = useState('');
  const [importCleanupCount, setImportCleanupCount] = useState<number | null>(null);
  const [importCleanupBusy, setImportCleanupBusy] = useState(false);
  const [yearCleanupCount, setYearCleanupCount] = useState<number | null>(null);
  const [yearCleanupBusy, setYearCleanupBusy] = useState(false);
  const [yearCleanupDone, setYearCleanupDone] = useState<number | null>(null);

  const currentYear = String(new Date().getFullYear());

  const toggleColor = themeMode === 'dark' ? '#2D2C2A' : '#ecebe7';

  const refreshStatus = useCallback(() => {
    calendarApi.getStatus()
      .then(s => { setStatus(s); setStatusError(''); })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 429) {
          setStatusError('Temporarily rate-limited — wait a few minutes and reload this page');
        } else if (err instanceof ApiError && err.status === 401) {
          setStatusError('Session expired — please log in again');
        } else {
          setStatusError('Could not reach the calendar sync service — check that the server is running and reload');
        }
      });
  }, []);

  // Load status; handle the ?googleCalendar= redirect result from the OAuth flow
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const result = params.get('googleCalendar');
    if (result) {
      setConnectMessage(result === 'connected'
        ? { text: 'Google Calendar connected', error: false }
        : { text: 'Google Calendar connection failed — please try again', error: true });
      invalidateCalendarStatus();
      params.delete('googleCalendar');
      navigate({ search: params.toString() }, { replace: true });
    }
    refreshStatus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => subscribeCalendarSync(() => setSyncUi(getCalendarSyncUiState())), []);

  // Load the calendar picker options once connected
  useEffect(() => {
    if (!status?.googleConnected || !calendarSyncEnabled || calendars) return;
    listWritableCalendars()
      .then(setCalendars)
      .catch(() => setCalendars([]));
  }, [status?.googleConnected, calendarSyncEnabled, calendars]);

  const kickSync = useCallback(() => {
    void runCalendarSync({ encryptPost });
  }, [encryptPost]);

  const handleSyncToggle = async (enabled: boolean) => {
    setCalendarSyncEnabled(enabled);
    await settingsApi.upsert('calendarSyncEnabled', enabled).catch(() => {});
    if (enabled) kickSync();
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const { url } = await calendarApi.getAuthUrl();
      window.location.href = url; // full-page redirect — popups are blocked on iPad Safari
    } catch (err) {
      setConnectMessage({ text: err instanceof Error ? err.message : 'Failed to start Google sign-in', error: true });
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!disconnectArmed) { setDisconnectArmed(true); return; }
    setDisconnectArmed(false);
    await calendarApi.disconnectGoogle().catch(() => {});
    invalidateCalendarStatus();
    setCalendars(null);
    refreshStatus();
  };

  const applyCalendarChoice = async (id: string) => {
    setPendingCalendarId(null);
    setGoogleCalendarId(id);
    setGoogleSyncToken('');
    await settingsApi.upsert('googleCalendarId', id).catch(() => {});
    await settingsApi.upsert('googleSyncToken', '').catch(() => {});
    kickSync();
  };

  const handleCalendarSelect = (id: string) => {
    if (!id || id === googleCalendarId) return;
    if (googleCalendarId) {
      // Switching calendars moves all synced events — confirm inline
      setPendingCalendarId(id);
    } else {
      void applyCalendarChoice(id);
    }
  };

  const handleImportModeToggle = async (importAll: boolean) => {
    const mode = importAll ? 'all' : 'chroniclesOnly';
    setCalendarImportMode(mode);
    await settingsApi.upsert('calendarImportMode', mode).catch(() => {});
    if (importAll) {
      // Clear the incremental sync token to force a full listing — events created
      // in Google before import was enabled were already consumed by the token
      // and would otherwise never be returned again
      setGoogleSyncToken('');
      await settingsApi.upsert('googleSyncToken', '').catch(() => {});
      kickSync();
    } else {
      // Offer to clean up previously imported entries (kept in Google either way)
      const count = getImportedEntries().length;
      setImportCleanupCount(count > 0 ? count : null);
    }
  };

  const handleImportCleanup = async () => {
    setImportCleanupBusy(true);
    try {
      await removeImportedEntries();
      setImportCleanupCount(null);
    } finally {
      setImportCleanupBusy(false);
    }
  };

  const handleYearCleanupScan = () => {
    setYearCleanupDone(null);
    setYearCleanupCount(getEventEntriesOutsideYear(currentYear).length);
  };

  const handleYearCleanupConfirm = async () => {
    setYearCleanupBusy(true);
    try {
      const removed = await removeEntriesLocally(getEventEntriesOutsideYear(currentYear));
      setYearCleanupDone(removed);
      setYearCleanupCount(null);
    } finally {
      setYearCleanupBusy(false);
    }
  };

  const handleIcsToggle = async (enabled: boolean) => {
    setIcsBusy(true);
    try {
      if (enabled) {
        await calendarApi.enableIcs();
      } else {
        await calendarApi.disableIcs();
      }
      invalidateCalendarStatus();
      refreshStatus();
      if (enabled) kickSync();
    } catch { /* surfaced via status refetch */ } finally {
      setIcsBusy(false);
    }
  };

  const handleIcsRegenerate = async () => {
    setIcsBusy(true);
    try {
      await calendarApi.regenerateIcs();
      invalidateCalendarStatus();
      refreshStatus();
      kickSync();
    } catch { /* ignore */ } finally {
      setIcsBusy(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(''), 2000);
    } catch { /* clipboard unavailable */ }
  };

  const feedPath = status?.icsToken ? `/api/calendar/feed/${status.icsToken}` : '';
  const httpsUrl = feedPath ? `${window.location.origin}${feedPath}` : '';
  const webcalUrl = feedPath ? `webcal://${window.location.host}${feedPath}` : '';

  const noteStyle = { fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 };
  const msgStyle = (error: boolean) => ({ fontSize: 13, marginTop: 8, color: error ? 'var(--color-danger, #c0392b)' : 'var(--text-secondary)' });

  return (
    <SettingsCard>
      <SettingsRow
        title="Sync events & meetings"
        description="Keep Event and Meeting entries in sync with an external calendar. Synced events leave end-to-end encryption: Google stores them, and the Apple feed keeps an unencrypted copy on the Chronicles server so your calendar app can read it."
        action={<Toggle checked={calendarSyncEnabled} onChange={handleSyncToggle} activeColor={toggleColor} />}
      />
      {statusError && calendarSyncEnabled && <div style={msgStyle(true)}>{statusError}</div>}

      {calendarSyncEnabled && !statusError && (
        <>
          {/* ── Google Calendar ── */}
          <SettingsRow
            title="Google Calendar"
            description={status?.googleConnected && !syncUi.googleDisconnected
              ? `Connected as ${status.googleEmail || 'Google account'}`
              : 'Two-way sync with a Google calendar of your choice'}
            action={status?.googleConnected && !syncUi.googleDisconnected ? (
              <ActionButton onClick={handleDisconnect} onBlur={() => setDisconnectArmed(false)}>
                {disconnectArmed ? 'Confirm disconnect' : 'Disconnect'}
              </ActionButton>
            ) : (
              <ActionButton onClick={handleConnect} disabled={connecting || !status}>
                {connecting ? <Spinner size={14} /> : 'Connect Google Calendar'}
              </ActionButton>
            )}
          >
            {connectMessage && <div style={msgStyle(connectMessage.error)}>{connectMessage.text}</div>}
            {syncUi.googleDisconnected && (
              <div style={msgStyle(true)}>Google connection expired — please reconnect.</div>
            )}

            {status?.googleConnected && !syncUi.googleDisconnected && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Select
                    value={pendingCalendarId ?? googleCalendarId}
                    onChange={e => handleCalendarSelect(e.target.value)}
                    style={{ minWidth: 220 }}
                  >
                    <option value="">Choose a calendar…</option>
                    {(calendars || []).map(c => (
                      <option key={c.id} value={c.id}>{c.summary}{c.primary ? ' (primary)' : ''}</option>
                    ))}
                  </Select>
                  {calendars === null && <Spinner size={14} />}
                </div>
                {pendingCalendarId && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      Move all synced events to this calendar?
                    </span>
                    <ActionButton onClick={() => applyCalendarChoice(pendingCalendarId)}>Move</ActionButton>
                    <ActionButton onClick={() => setPendingCalendarId(null)}>Cancel</ActionButton>
                  </div>
                )}
                {!googleCalendarId && !pendingCalendarId && (
                  <div style={noteStyle}>Pick the calendar your events should sync to.</div>
                )}
              </div>
            )}
          </SettingsRow>

          {status?.googleConnected && !syncUi.googleDisconnected && (
            <SettingsRow
              title="Import Google events"
              description="Also create Chronicles entries for events added directly in the synced Google calendar — from today onward only, never past history"
              action={<Toggle checked={calendarImportMode === 'all'} onChange={handleImportModeToggle} activeColor={toggleColor} />}
            >
              {importCleanupCount !== null && (
                <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    Remove the {importCleanupCount} imported {importCleanupCount === 1 ? 'entry' : 'entries'} from
                    Chronicles? They stay in Google Calendar.
                  </span>
                  <ActionButton onClick={handleImportCleanup} disabled={importCleanupBusy}>
                    {importCleanupBusy ? <Spinner size={14} /> : 'Remove them'}
                  </ActionButton>
                  <ActionButton onClick={() => setImportCleanupCount(null)} disabled={importCleanupBusy}>
                    Keep them
                  </ActionButton>
                </div>
              )}
            </SettingsRow>
          )}

          {/* ── Apple Calendar (ICS feed) ── */}
          <SettingsRow
            title="Apple Calendar feed"
            description="Subscribe to your events from Apple Calendar (one-way: changes made in Apple Calendar don't sync back)"
            action={icsBusy
              ? <Spinner size={14} />
              : <Toggle checked={!!status?.icsEnabled} onChange={handleIcsToggle} activeColor={toggleColor} />}
          >
            {status?.icsEnabled && httpsUrl && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <code style={{ fontSize: 11, wordBreak: 'break-all', flex: 1, minWidth: 200, color: 'var(--text-secondary)' }}>
                    {webcalUrl}
                  </code>
                  <ActionButton onClick={() => copyToClipboard(webcalUrl, 'webcal')}>
                    {copied === 'webcal' ? 'Copied' : 'Copy webcal://'}
                  </ActionButton>
                  <ActionButton onClick={() => copyToClipboard(httpsUrl, 'https')}>
                    {copied === 'https' ? 'Copied' : 'Copy https://'}
                  </ActionButton>
                </div>
                <div style={noteStyle}>
                  In Apple Calendar: File → New Calendar Subscription (Mac) or Settings → Accounts → Add Subscribed
                  Calendar (iPhone/iPad), then paste the URL. Anyone with this URL can read your synced events —
                  regenerate it if it leaks.
                </div>
                <div>
                  <ActionButton onClick={handleIcsRegenerate} disabled={icsBusy}>Regenerate URL</ActionButton>
                </div>
              </div>
            )}
          </SettingsRow>

          {/* ── Cleanup ── */}
          <SettingsRow
            title="Clean up old events"
            description={`Remove Event and Meeting entries not dated in ${currentYear} from Chronicles. Google Calendar is not affected.`}
            action={
              <ActionButton onClick={handleYearCleanupScan} disabled={yearCleanupBusy}>
                Scan
              </ActionButton>
            }
          >
            {yearCleanupCount !== null && (
              <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {yearCleanupCount === 0 ? (
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    No events outside {currentYear} found.
                  </span>
                ) : (
                  <>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      Delete {yearCleanupCount} {yearCleanupCount === 1 ? 'entry' : 'entries'} dated outside {currentYear}?
                    </span>
                    <ActionButton onClick={handleYearCleanupConfirm} disabled={yearCleanupBusy}>
                      {yearCleanupBusy ? <Spinner size={14} /> : 'Delete them'}
                    </ActionButton>
                    <ActionButton onClick={() => setYearCleanupCount(null)} disabled={yearCleanupBusy}>
                      Cancel
                    </ActionButton>
                  </>
                )}
              </div>
            )}
            {yearCleanupDone !== null && (
              <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                Removed {yearCleanupDone} {yearCleanupDone === 1 ? 'entry' : 'entries'}.
              </div>
            )}
          </SettingsRow>

          {/* ── Sync status ── */}
          <SettingsRow
            title="Sync status"
            description={syncUi.lastError
              ? `Last sync failed: ${syncUi.lastError}`
              : syncUi.lastSyncAt
                ? `Last synced ${syncUi.lastSyncAt.toLocaleTimeString()}`
                : 'Not synced yet this session'}
            action={
              <ActionButton onClick={kickSync} disabled={syncUi.syncing}>
                {syncUi.syncing ? <Spinner size={14} /> : 'Sync now'}
              </ActionButton>
            }
          />
        </>
      )}
    </SettingsCard>
  );
}
