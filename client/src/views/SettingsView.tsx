import { useState, useEffect, useRef, Fragment } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown, faChevronUp, faChevronLeft } from '@fortawesome/free-solid-svg-icons';
import { SettingsTemplate } from '../components/templates/SettingsTemplate.js';
import { SettingsCard, SettingsRow } from '../components/molecules/SettingsCard.js';
import {
  HeaderRow, Title, SectionTitle, SectionDescription, DangerTitle,
  CollapsibleHeader, CollapsibleTitle, CollapsibleDesc, CollapsibleBody,
  PrivacyCard, DangerCard, PasswordForm, SessionsList, SessionItem,
  ColorSection, ColorSectionTitle, ColorSectionDesc,
} from '../components/molecules/SettingsSection.js';
import { ActionButton, SignOutButton, BackLink } from '../components/atoms/SettingsAtoms.js';
import { Toggle } from '../components/atoms/Toggle.js';
import { Select } from '../components/atoms/Select.js';
import { PasswordInput } from '../components/atoms/PasswordInput.js';
import { TextInput } from '../components/atoms/TextInput.js';
import { Button } from '../components/atoms/Button.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { FormField } from '../components/molecules/FormField.js';
import { BackgroundPicker } from '../components/molecules/BackgroundPicker.js';
import { SessionRow } from '../components/molecules/SessionRow.js';
import { RecoveryKeyDisplay } from '../components/molecules/RecoveryKeyDisplay.js';
import { CalendarSyncSettings } from '../components/organisms/CalendarSyncSettings.js';
import { ImageStorageSettings } from '../components/organisms/ImageStorageSettings.js';
import { AiSettings } from '../components/organisms/AiSettings.js';
import { UnlockDialog } from '../components/organisms/UnlockDialog.js';
import { EmptyState } from '../components/atoms/EmptyState.js';
import { useInitializeData } from '../hooks/useInitializeData.js';
import { useAuth } from '../contexts/AuthContext.js';
import { useEncryption } from '../contexts/EncryptionContext.js';
import { useUIStore } from '../stores/uiStore.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { useNavigate } from 'react-router-dom';
import { auth as authApi, settings as settingsApi, sessions as sessionsApi, topics as topicsApi, entries as entriesApi, ApiError } from '../services/api.js';
import { seedTestData } from '../utils/seedTestData.js';
import { stripHtml } from '../utils/stripHtml.js';

function parseCsvRow(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

function splitCsvLines(text: string): string[] {
  const lines: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && i + 1 < text.length && text[i + 1] === '\n') i++;
      if (current.trim()) lines.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) lines.push(current);
  return lines;
}

const TIMEZONES = [
  { value: 'Pacific/Honolulu', label: 'Hawaii (HST)' },
  { value: 'America/Anchorage', label: 'Alaska (AKST)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PST)' },
  { value: 'America/Denver', label: 'Mountain Time (MST)' },
  { value: 'America/Chicago', label: 'Central Time (CST)' },
  { value: 'America/New_York', label: 'Eastern Time (EST)' },
  { value: 'America/Sao_Paulo', label: 'São Paulo (BRT)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET)' },
  { value: 'Europe/Moscow', label: 'Moscow (MSK)' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)' },
  { value: 'Asia/Kolkata', label: 'India (IST)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEDT)' },
  { value: 'Pacific/Auckland', label: 'Auckland (NZDT)' },
  { value: 'UTC', label: 'UTC' },
];

const FEATURES = [
  { key: 'foodEnabled', title: 'Meals', description: 'Track meals and nutrition' },
  { key: 'medicationEnabled', title: 'Medication', description: 'Track medications and health' },
  { key: 'goalsEnabled', title: 'Goal', description: 'Set and track goals' },
  { key: 'milestonesEnabled', title: 'Milestone', description: 'Break goals into milestones' },
  { key: 'exerciseEnabled', title: 'Exercise', description: 'Log workouts and fitness' },
  { key: 'allergiesEnabled', title: 'Allergy and Sensitivities', description: 'Track allergies and reactions' },
  { key: 'entertainmentEnabled', title: 'Entertainment', description: 'Track music, books, and TV/movies' },
  { key: 'inspirationEnabled', title: 'Inspiration', description: 'Save research, ideas, and quotes' },
];

/* ── View ── */

export function SettingsView() {
  const { user, logout, encryptionData } = useAuth();
  const { lock, rewrapMasterKey, generateRecoveryKey, encryptPost } = useEncryption();
  // Same unlock gate as every other view — Settings exposes encrypted-at-rest
  // preferences and master-key operations, so it locks with the journal
  const { needsUnlock, handleUnlock } = useInitializeData();
  const clearAll = useEntriesStore(s => s.clearAll);
  const addDecryptedEntry = useEntriesStore(s => s.addDecryptedEntry);
  const decryptedEntries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const setTopics = useEntriesStore(s => s.setTopics);
  const seedTopics = useEntriesStore(s => s.topics);
  const setFeatureFlags = useEntriesStore(s => s.setFeatureFlags);
  const accentColor = useUIStore(s => s.accentColor);
  const setAccentColor = useUIStore(s => s.setAccentColor);
  const themeMode = useUIStore(s => s.themeMode);
  const setThemeMode = useUIStore(s => s.setThemeMode);
  const backgroundImage = useUIStore(s => s.backgroundImage);
  const setBackgroundImage = useUIStore(s => s.setBackgroundImage);
  const backgroundOpacity = useUIStore(s => s.backgroundOpacity);
  const setBackgroundOpacity = useUIStore(s => s.setBackgroundOpacity);
  const navigate = useNavigate();

  // How to Use
  const [showHowToUse, setShowHowToUse] = useState(false);

  // Display name
  const displayName = useUIStore(s => s.displayName);
  const setDisplayName = useUIStore(s => s.setDisplayName);
  const [editingDisplayName, setEditingDisplayName] = useState(false);
  const [draftDisplayName, setDraftDisplayName] = useState('');
  const [displayNameSaving, setDisplayNameSaving] = useState(false);

  // Email
  const [editingEmail, setEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailMessage, setEmailMessage] = useState('');
  const [emailError, setEmailError] = useState(false);

  // Timezone
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);

  // Weather
  const weatherEnabled = useUIStore(s => s.weatherEnabled);
  const setWeatherEnabled = useUIStore(s => s.setWeatherEnabled);
  const weatherCity = useUIStore(s => s.weatherCity);
  const setWeatherCity = useUIStore(s => s.setWeatherCity);
  const [weatherCityDraft, setWeatherCityDraft] = useState('');
  const [weatherCitySaving, setWeatherCitySaving] = useState(false);

  // Cycle tracking
  const cycleTrackingEnabled = useUIStore(s => s.cycleTrackingEnabled);
  const setCycleTrackingEnabled = useUIStore(s => s.setCycleTrackingEnabled);
  const handleCycleTrackingToggle = async (enabled: boolean) => {
    setCycleTrackingEnabled(enabled);
    await settingsApi.upsert('cycleTrackingEnabled', enabled).catch(() => {});
  };

  // Password
  const [showPassword, setShowPassword] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMessage, setPwMessage] = useState('');
  const [pwError, setPwError] = useState(false);

  // Sessions
  const [showSessions, setShowSessions] = useState(false);
  const [sessionList, setSessionList] = useState<{ id: number; deviceInfo: string | null; ipAddress: string | null; lastActiveAt: string; isCurrent: boolean }[]>([]);

  // 2FA
  const [totpEnabled, setTotpEnabled] = useState(() => !!(user as unknown as { totpEnabled?: boolean })?.totpEnabled);
  const [twoFAStep, setTwoFAStep] = useState<'idle' | 'qr' | 'confirm' | 'codes'>('idle');
  const [twoFASecret, setTwoFASecret] = useState('');
  const [twoFAQrUrl, setTwoFAQrUrl] = useState('');
  const [twoFACode, setTwoFACode] = useState('');
  const [twoFABackupCodes, setTwoFABackupCodes] = useState<string[]>([]);
  const [twoFALoading, setTwoFALoading] = useState(false);
  const [twoFAError, setTwoFAError] = useState('');
  const [disabling2FA, setDisabling2FA] = useState(false);
  const [disable2FAPassword, setDisable2FAPassword] = useState('');
  const [disable2FAError, setDisable2FAError] = useState('');

  // Recovery key regeneration
  const [showRecoveryKey, setShowRecoveryKey] = useState(false);
  const [recoveryKeyPw, setRecoveryKeyPw] = useState('');
  const [recoveryKeyLoading, setRecoveryKeyLoading] = useState(false);
  const [recoveryKeyError, setRecoveryKeyError] = useState('');
  const [generatedRecoveryKey, setGeneratedRecoveryKey] = useState('');

  // Features
  const [features, setFeatures] = useState<Record<string, boolean>>({});

  // Seeding
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState('');
  const [seedingEntries, setSeedingEntries] = useState(false);
  const [seedEntriesResult, setSeedEntriesResult] = useState('');
  const [seedConfirmArmed, setSeedConfirmArmed] = useState(false);

  // Load settings
  useEffect(() => {
    settingsApi.getAll().then(settings => {
      const map: Record<string, unknown> = {};
      for (const s of settings) map[s.key] = s.value;
      if (typeof map.timezone === 'string') setTimezone(map.timezone);
      if (map.themeMode === 'light' || map.themeMode === 'dark') setThemeMode(map.themeMode);
      if (typeof map.accentColor === 'string') setAccentColor(map.accentColor);
      if (typeof map.backgroundImage === 'string') setBackgroundImage(map.backgroundImage);
      if (typeof map.backgroundOpacity === 'string') setBackgroundOpacity(parseFloat(map.backgroundOpacity as string));
      const f: Record<string, boolean> = {};
      for (const feat of FEATURES) {
        // Unset flags default to enabled, matching useInitializeData
        f[feat.key] = map[feat.key] !== false;
      }
      setFeatures(f);
      setFeatureFlags(f);
    }).catch(() => {});
  }, []);

  // Handlers
  const handleSaveDisplayName = async () => {
    setDisplayNameSaving(true);
    try {
      await settingsApi.upsert('displayName', draftDisplayName.trim());
      setDisplayName(draftDisplayName.trim());
      setEditingDisplayName(false);
    } catch {
      // ignore — non-critical
    } finally {
      setDisplayNameSaving(false);
    }
  };

  const handleChangeEmail = async () => {
    if (!newEmail.trim()) return;
    setEmailLoading(true);
    setEmailMessage('');
    setEmailError(false);
    try {
      const result = await authApi.changeEmail({ newEmail: newEmail.trim() });
      setEmailMessage('Email updated');
      setEditingEmail(false);
      setNewEmail('');
      if (user) (user as unknown as Record<string, unknown>).email = result.email;
    } catch (err) {
      setEmailError(true);
      setEmailMessage(err instanceof Error ? err.message : 'Failed to change email');
    } finally {
      setEmailLoading(false);
    }
  };

  const handleTimezoneChange = async (tz: string) => {
    setTimezone(tz);
    await settingsApi.upsert('timezone', tz).catch(() => {});
  };

  const handleWeatherToggle = async (enabled: boolean) => {
    setWeatherEnabled(enabled);
    await settingsApi.upsert('weatherEnabled', enabled).catch(() => {});
    if (enabled && !weatherCityDraft) setWeatherCityDraft(weatherCity);
  };

  const handleSaveWeatherCity = async () => {
    const city = weatherCityDraft.trim();
    if (!city) return;
    setWeatherCitySaving(true);
    try {
      await settingsApi.upsert('weatherCity', city);
      setWeatherCity(city);
    } catch { /* ignore */ } finally {
      setWeatherCitySaving(false);
    }
  };

  const handleThemeModeChange = async (mode: 'light' | 'dark') => {
    setThemeMode(mode);
    await settingsApi.upsert('themeMode', mode).catch(() => {});
  };

  const handleAccentColorChange = async (color: string) => {
    setAccentColor(color);
    document.documentElement.style.setProperty('--color-accent', color);
    await settingsApi.upsert('accentColor', color).catch(() => {});
  };

  const handleImageChange = async (image: string) => {
    setBackgroundImage(image);
    await settingsApi.upsert('backgroundImage', image).catch(() => {});
  };

  const handleOpacityChange = async (opacity: number) => {
    setBackgroundOpacity(opacity);
    await settingsApi.upsert('backgroundOpacity', String(opacity)).catch(() => {});
  };

  const handleFeatureToggle = async (key: string, value: boolean) => {
    const updated = { ...features, [key]: value };
    setFeatures(updated);
    setFeatureFlags(updated);
    await settingsApi.upsert(key, value).catch(() => {});
  };

  const handleChangePassword = async () => {
    setPwMessage(''); setPwError(false);
    if (newPw !== confirmPw) { setPwMessage('Passwords do not match'); setPwError(true); return; }
    if (newPw.length < 12) { setPwMessage('Minimum 12 characters'); setPwError(true); return; }
    setPwLoading(true);
    try {
      const { salt, wrappedMK, wrapIv } = await rewrapMasterKey(newPw, currentPw);
      await authApi.changePassword({ currentPassword: currentPw, newPassword: newPw, newEncryptedMasterKey: wrappedMK, newKekSalt: salt, newKekWrapIv: wrapIv });
      setPwMessage('Password changed'); setCurrentPw(''); setNewPw(''); setConfirmPw(''); setShowPassword(false);
    } catch (err) { setPwMessage(err instanceof Error ? err.message : 'Failed'); setPwError(true); }
    finally { setPwLoading(false); }
  };

  const handleGenerateRecoveryKey = async () => {
    setRecoveryKeyError('');
    if (!recoveryKeyPw) { setRecoveryKeyError('Enter your current password'); return; }
    setRecoveryKeyLoading(true);
    try {
      const fallbackParams = encryptionData?.kekSalt && encryptionData?.encryptedMasterKey && encryptionData?.kekWrapIv
        ? { kekSalt: encryptionData.kekSalt, encryptedMasterKey: encryptionData.encryptedMasterKey, kekWrapIv: encryptionData.kekWrapIv, kekIterations: encryptionData.kekIterations }
        : undefined;
      const { recoveryKey, recoveryWrappedMK, recoveryWrapIv } = await generateRecoveryKey(recoveryKeyPw, fallbackParams);

      // Hash the recovery key for server-side verification
      const saltBytes = crypto.getRandomValues(new Uint8Array(16));
      const saltHex = Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join('');
      const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(recoveryKey), 'PBKDF2', false, ['deriveBits']);
      const derivedBits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations: 600000, hash: 'SHA-256' }, keyMaterial, 256);
      const keyHash = Array.from(new Uint8Array(derivedBits)).map(b => b.toString(16).padStart(2, '0')).join('');

      await authApi.saveRecoveryKey({ recoveryWrappedMK, recoveryWrapIv, recoveryKeyHash: keyHash, recoveryKeySalt: saltHex });
      setGeneratedRecoveryKey(recoveryKey);
      setRecoveryKeyPw('');
    } catch (err) {
      setRecoveryKeyError(err instanceof Error ? err.message : 'Failed to generate recovery key');
    } finally {
      setRecoveryKeyLoading(false);
    }
  };

  const handleLoadSessions = async () => {
    setShowSessions(!showSessions);
    if (!showSessions) {
      const data = await sessionsApi.getAll().catch(() => []);
      setSessionList(data as typeof sessionList);
    }
  };

  const handleRevokeSession = async (id: number) => {
    await sessionsApi.revoke(id);
    setSessionList(prev => prev.filter(s => s.id !== id));
  };

  const handleStart2FASetup = async () => {
    setTwoFALoading(true);
    setTwoFAError('');
    try {
      const { secret, qrCodeUrl } = await authApi.setup2FA();
      setTwoFASecret(secret);
      setTwoFAQrUrl(qrCodeUrl);
      setTwoFAStep('qr');
    } catch {
      setTwoFAError('Failed to start 2FA setup');
    } finally {
      setTwoFALoading(false);
    }
  };

  const handleConfirm2FA = async () => {
    setTwoFALoading(true);
    setTwoFAError('');
    try {
      const { backupCodes } = await authApi.enable2FA({ secret: twoFASecret, code: twoFACode });
      setTwoFABackupCodes(backupCodes);
      setTotpEnabled(true);
      setTwoFAStep('codes');
      setTwoFACode('');
    } catch (err) {
      setTwoFAError(err instanceof ApiError ? err.message : 'Invalid code');
    } finally {
      setTwoFALoading(false);
    }
  };

  const handleDisable2FA = async () => {
    setTwoFALoading(true);
    setDisable2FAError('');
    try {
      await authApi.disable2FA({ password: disable2FAPassword });
      setTotpEnabled(false);
      setDisabling2FA(false);
      setDisable2FAPassword('');
    } catch (err) {
      setDisable2FAError(err instanceof ApiError ? err.message : 'Failed to disable 2FA');
    } finally {
      setTwoFALoading(false);
    }
  };

  const handleSeedTopics = async () => {
    setSeeding(true); setSeedResult('');
    try {
      const freshTopics = await topicsApi.getAll(); // triggers auto-seed on server
      setTopics(freshTopics as typeof allTopics);
      setSeedResult('Default topics created');
    } catch { setSeedResult('Failed'); }
    finally { setSeeding(false); }
  };

  const handleSeedEntries = async () => {
    setSeedingEntries(true); setSeedEntriesResult('');
    try {
      // Refresh topics first to make sure all defaults exist
      const freshTopics = await topicsApi.getAll();
      const result = await seedTestData({
        encryptPost,
        topics: freshTopics as { id: number; name: string; icon: string | null; color: string | null }[],
        addDecryptedEntry,
        onProgress: (msg) => setSeedEntriesResult(msg),
      });
      setSeedEntriesResult(result);
    } catch (err) {
      setSeedEntriesResult(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSeedingEntries(false);
    }
  };

  const [exporting, setExporting] = useState(false);

  const handleExportCsv = () => {
    setExporting(true);
    try {
      const topicMap = new Map(allTopics.map(t => [t.id, t.name]));


      const escCsv = (val: string) => {
        if (val.includes('"') || val.includes(',') || val.includes('\n')) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      };

      // Collect all custom field keys across entries
      const cfKeySet = new Set<string>();
      for (const entry of decryptedEntries) {
        const cf = (entry.metadata as Record<string, unknown>)?._customFields as Record<string, unknown> | undefined;
        if (cf) Object.keys(cf).forEach(k => { if (!k.startsWith('_')) cfKeySet.add(k); });
      }
      const cfKeys = [...cfKeySet].sort();

      const headers = ['ID', 'Date', 'Updated', 'Topic', 'Content', 'Bookmarked', ...cfKeys.map(k => k)];
      const rows = [headers.map(escCsv).join(',')];

      // Sort entries by date descending
      const sorted = [...decryptedEntries].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      for (const entry of sorted) {
        const meta = entry.metadata as Record<string, unknown>;
        const cf = (meta?._customFields as Record<string, unknown>) || {};
        const topicId = meta?._taxonomyId as number | undefined;
        const topicName = topicId ? (topicMap.get(topicId) || '') : '';
        const bookmarked = cf._isFavorite ? 'Yes' : '';

        const row = [
          String(entry.id),
          new Date(entry.createdAt).toISOString().slice(0, 10),
          new Date(entry.updatedAt).toISOString().slice(0, 10),
          topicName,
          stripHtml(entry.content),
          bookmarked,
          ...cfKeys.map(k => {
            const v = cf[k];
            if (v == null) return '';
            if (typeof v === 'boolean') return v ? 'Yes' : 'No';
            return String(v);
          }),
        ];
        rows.push(row.map(escCsv).join(','));
      }

      const csv = rows.join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chronicles-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  // Import CSV
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState('');
  const importFileRef = useRef<HTMLInputElement>(null);

  const handleImportCsv = async (file: File) => {
    setImporting(true);
    setImportResult('');
    try {
      const text = await file.text();
      const lines = splitCsvLines(text);
      if (lines.length < 2) throw new Error('CSV file is empty or has no data rows');

      const headers = parseCsvRow(lines[0]).map(h => h.trim());
      const dateIdx = headers.findIndex(h => h.toLowerCase() === 'date');
      const contentIdx = headers.findIndex(h => h.toLowerCase() === 'content');
      const topicIdx = headers.findIndex(h => h.toLowerCase() === 'topic');
      const bookmarkedIdx = headers.findIndex(h => h.toLowerCase() === 'bookmarked');

      if (contentIdx === -1) throw new Error('CSV must have a "Content" column');
      if (dateIdx === -1) throw new Error('CSV must have a "Date" column');

      // Build topic name → id map (case-insensitive)
      const topicNameMap = new Map<string, number>();
      for (const t of allTopics) {
        topicNameMap.set(t.name.toLowerCase(), t.id);
      }

      // Known non-custom-field columns
      const skipHeaders = new Set(['id', 'date', 'updated', 'topic', 'content', 'bookmarked']);

      let imported = 0;
      let skipped = 0;
      const total = lines.length - 1;

      for (let i = 1; i < lines.length; i++) {
        const fields = parseCsvRow(lines[i]);
        const content = fields[contentIdx]?.trim();
        const dateStr = fields[dateIdx]?.trim();

        if (!content || !dateStr) { skipped++; continue; }

        // Build metadata
        const metadata: Record<string, unknown> = {};
        const customFields: Record<string, unknown> = {};

        // Topic
        if (topicIdx !== -1 && fields[topicIdx]?.trim()) {
          const topicId = topicNameMap.get(fields[topicIdx].trim().toLowerCase());
          if (topicId) metadata._taxonomyId = topicId;
        }

        // Bookmarked
        if (bookmarkedIdx !== -1 && fields[bookmarkedIdx]?.trim().toLowerCase() === 'yes') {
          customFields._isFavorite = true;
        }

        // Custom fields from extra columns
        for (let h = 0; h < headers.length; h++) {
          if (skipHeaders.has(headers[h].toLowerCase()) || h >= fields.length) continue;
          const val = fields[h]?.trim();
          if (!val) continue;
          if (val.toLowerCase() === 'yes') customFields[headers[h]] = true;
          else if (val.toLowerCase() === 'no') customFields[headers[h]] = false;
          else customFields[headers[h]] = val;
        }

        if (Object.keys(customFields).length > 0) {
          metadata._customFields = customFields;
        }

        // Wrap plain text in HTML paragraphs for TipTap
        const htmlContent = content.split('\n').map(line => `<p>${line || '<br>'}</p>`).join('');

        // Encrypt
        const encrypted = await encryptPost(htmlContent, metadata);

        // Parse date
        const createdAt = new Date(dateStr).toISOString();

        // Create entry via API
        const taxonomyIds = metadata._taxonomyId ? [metadata._taxonomyId as number] : [];
        const result = await entriesApi.create({
          contentEncrypted: encrypted.contentEncrypted,
          contentIv: encrypted.contentIv,
          metadataEncrypted: encrypted.metadataEncrypted,
          metadataIv: encrypted.metadataIv,
          isEncrypted: true,
          taxonomyIds,
          createdAt,
        });

        // Add to local store
        addDecryptedEntry({
          id: result.id as number,
          content: htmlContent,
          metadata,
          isEncrypted: true,
          createdAt: new Date(result.createdAt as string),
          updatedAt: new Date((result.updatedAt || result.createdAt) as string),
        });

        imported++;
        setImportResult(`Importing ${imported} of ${total}...`);
      }

      setImportResult(`Imported ${imported} entries${skipped > 0 ? `, ${skipped} skipped` : ''}`);
    } catch (err) {
      setImportResult(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setImporting(false);
      if (importFileRef.current) importFileRef.current.value = '';
    }
  };

  const handleSignOut = async () => {
    lock(); clearAll(); await logout(); navigate('/login');
  };

  if (needsUnlock) return (
    <>
      <SettingsTemplate title="">
        <EmptyState message="Unlock your journal to view settings" />
      </SettingsTemplate>
      <UnlockDialog onUnlock={handleUnlock} />
    </>
  );

  return (
    <SettingsTemplate title="">
      <HeaderRow>
        <Title>Settings</Title>
      </HeaderRow>

      {/* Account */}
      <SectionTitle>Account</SectionTitle>
      <SettingsCard>
        <SettingsRow
          title="Username"
          description={user?.username || ''}
        />
        <SettingsRow
          title="Display Name"
          description={!editingDisplayName ? (displayName || 'Not set') : undefined}
          action={
            !editingDisplayName ? (
              <ActionButton onClick={() => { setEditingDisplayName(true); setDraftDisplayName(displayName); }}>
                {displayName ? 'Change' : 'Set'}
              </ActionButton>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <ActionButton onClick={handleSaveDisplayName} disabled={displayNameSaving}>
                  {displayNameSaving ? <Spinner size={14} /> : 'Save'}
                </ActionButton>
                <ActionButton onClick={() => { setEditingDisplayName(false); setDraftDisplayName(''); }}>
                  Cancel
                </ActionButton>
              </div>
            )
          }
        >
          {editingDisplayName && (
            <TextInput
              value={draftDisplayName}
              onChange={e => setDraftDisplayName(e.target.value)}
              placeholder="Your first name or nickname"
              autoFocus
              style={{ marginTop: 4 }}
            />
          )}
        </SettingsRow>
        <SettingsRow
          title="Email"
          description={!editingEmail ? (user?.email || 'Unknown') : undefined}
          action={
            !editingEmail ? (
              <ActionButton onClick={() => { setEditingEmail(true); setNewEmail(user?.email || ''); setEmailMessage(''); }}>
                Change
              </ActionButton>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <ActionButton onClick={handleChangeEmail} disabled={emailLoading || !newEmail.trim()}>
                  {emailLoading ? <Spinner size={14} /> : 'Save'}
                </ActionButton>
                <ActionButton onClick={() => { setEditingEmail(false); setNewEmail(''); setEmailMessage(''); }}>
                  Cancel
                </ActionButton>
              </div>
            )
          }
        >
          {editingEmail && (
            <TextInput
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              placeholder="New email address"
              type="email"
              autoFocus
              style={{ marginTop: 4 }}
            />
          )}
        </SettingsRow>
        {emailMessage && <div style={{ padding: '0 0 12px', fontSize: 13, color: emailError ? '#9B4444' : '#5A8A6A' }}>{emailMessage}</div>}
      </SettingsCard>

      {/* How to Use */}
      <SectionTitle>How to Use Chronicles</SectionTitle>
      <CollapsibleHeader onClick={() => setShowHowToUse(!showHowToUse)} style={showHowToUse ? { borderRadius: '12px 12px 0 0' } : undefined}>
        <div>
          <CollapsibleTitle>Getting Started Guide</CollapsibleTitle>
          <CollapsibleDesc>Learn how to use Chronicles effectively</CollapsibleDesc>
        </div>
        <FontAwesomeIcon icon={showHowToUse ? faChevronUp : faChevronDown} color="#6b7280" />
      </CollapsibleHeader>
      {showHowToUse && (
        <CollapsibleBody>
          <p><strong>Chronicles</strong> is a zero-knowledge encrypted journal — your entries are encrypted on your device before they ever leave it. No one, not even the server, can read your data.</p>

          <p style={{ marginTop: 16 }}><strong>Getting Started</strong></p>
          <ul style={{ marginTop: 8, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <li>Click <strong>New Entry</strong> in the header or press <strong>Ctrl+N</strong> (Cmd+N) to start writing.</li>
            <li>Assign a <strong>topic</strong> from the dropdown in the editor to categorize your entry. Topics like Task, Goal, Meals, and Medication unlock extra fields.</li>
            <li>Use <strong>Ctrl+D</strong> (Cmd+D) to delete the selected entry, and <strong>Enter</strong> to save in compact mode.</li>
          </ul>

          <p style={{ marginTop: 16 }}><strong>Topics</strong></p>
          <p style={{ marginTop: 4 }}>Topics organize your entries with icons and colors. Manage them from the <strong>Topics</strong> page in the navigation. Some topics are special — selecting Task, Goal, Milestone, Meals, Medication, Symptom, Exercise, Event, or Meeting will reveal additional fields for tracking details.</p>

          <p style={{ marginTop: 16 }}><strong>Quick Tab Filters</strong></p>
          <ul style={{ marginTop: 8, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <li><strong>Date</strong> — browse entries one day at a time. Tap the date tab to toggle the mini calendar.</li>
            <li><strong>Tasks</strong> — shows only task entries so you can focus on what needs doing.</li>
            <li><strong>All</strong> — every entry in reverse chronological order.</li>
            <li><strong>Bookmarks</strong> — entries you've starred for quick reference.</li>
            <li><strong>Search</strong> — filter by keyword and date range across all entries.</li>
          </ul>

          <p style={{ marginTop: 16 }}><strong>Planning &amp; Health</strong></p>
          <p style={{ marginTop: 4 }}>Enable features like Goals, Milestones, Medication Tracking, Meals Logging, and more from the <strong>Features</strong> section below. Each feature adds a dedicated view accessible from the navigation bar.</p>

          <p style={{ marginTop: 16 }}><strong>Security</strong></p>
          <p style={{ marginTop: 4 }}>Your master encryption key never leaves your browser. If you forget your password, use your <strong>recovery key</strong> (shown once at registration) to regain access. You can manage active sessions and change your password from the Security section below.</p>
        </CollapsibleBody>
      )}

      {/* Preferences */}
      <SectionTitle>Preferences</SectionTitle>
      <SettingsCard>
        <SettingsRow
          title="Timezone"
          description="Used to determine the current day for journal entries"
          action={
            <Select value={timezone} onChange={e => handleTimezoneChange(e.target.value)} style={{ width: 220 }}>
              {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
            </Select>
          }
        />
        <SettingsRow
          title="Weather Forecast"
          description="Show a 5-day weather widget on your dashboard"
          action={
            <Toggle
              checked={weatherEnabled}
              onChange={handleWeatherToggle}
              activeColor={themeMode === 'dark' ? '#2D2C2A' : '#ecebe7'}
            />
          }
        >
          {weatherEnabled && (
            <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
              <TextInput
                value={weatherCityDraft || weatherCity}
                onChange={e => setWeatherCityDraft(e.target.value)}
                placeholder="City name (e.g. New York)"
                style={{ flex: 1 }}
                onKeyDown={e => e.key === 'Enter' && handleSaveWeatherCity()}
              />
              <ActionButton
                onClick={handleSaveWeatherCity}
                disabled={weatherCitySaving || !(weatherCityDraft || weatherCity).trim()}
              >
                {weatherCitySaving ? <Spinner size={14} /> : 'Save'}
              </ActionButton>
            </div>
          )}
        </SettingsRow>
      </SettingsCard>

      {/* Calendar Sync */}
      <SectionTitle>Calendar Sync</SectionTitle>
      <CalendarSyncSettings themeMode={themeMode} />

      {/* Entry Images */}
      <SectionTitle>Entry Images</SectionTitle>
      <ImageStorageSettings themeMode={themeMode} />

      {/* AI Assistant */}
      <SectionTitle>AI Assistant</SectionTitle>
      <AiSettings themeMode={themeMode} />

      {/* Theme */}
      <SectionTitle>Theme</SectionTitle>
      <SettingsCard>
        <ColorSection>
          <ColorSectionTitle>Appearance</ColorSectionTitle>
          <ColorSectionDesc>Choose light or dark mode</ColorSectionDesc>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              variant="secondary"
              onClick={() => handleThemeModeChange('light')}
              style={{
                flex: 1,
                background: themeMode === 'light' ? '#ecebe7' : 'transparent',
                border: themeMode === 'light' ? '1px solid #b5b3ae' : undefined,
                fontWeight: themeMode === 'light' ? 600 : 400,
              }}
            >
              Light
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleThemeModeChange('dark')}
              style={{
                flex: 1,
                background: themeMode === 'dark' ? '#1a1b1d' : 'transparent',
                color: themeMode === 'dark' ? 'white' : undefined,
                border: themeMode === 'dark' ? 'none' : undefined,
                fontWeight: themeMode === 'dark' ? 600 : 400,
              }}
            >
              Dark
            </Button>
          </div>
        </ColorSection>
        <ColorSection>
          <ColorSectionTitle>Accent Color</ColorSectionTitle>
          <ColorSectionDesc>Choose an accent color for highlights and interactive elements</ColorSectionDesc>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[
              /* All presets toned to the teal's muted chroma (~50% sat) */
              { name: 'Teal', color: '#34a5a2' },
              { name: 'Ink', color: '#1f2937' },
              { name: 'Rose', color: '#b8455e' },
              { name: 'Amber', color: '#b8853d' },
              { name: 'Sage', color: '#6f9a58' },
              { name: 'Denim', color: '#3d64b8' },
              { name: 'Purple', color: '#6e53ac' },
            ].map(a => (
              <button
                key={a.color}
                onClick={() => handleAccentColorChange(a.color)}
                title={a.name}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 999,
                  border: accentColor === a.color ? `2px solid ${a.color}` : '1px solid var(--border-subtle)',
                  background: a.color,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: accentColor === a.color ? `0 0 0 2px var(--bg-app)` : 'none',
                }}
              />
            ))}
          </div>
        </ColorSection>
      </SettingsCard>

      {/* Security */}
      <SectionTitle>Security</SectionTitle>
      <SettingsCard>
        <SettingsRow
          title="Password"
          description="Change your account password"
          action={<ActionButton onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Cancel' : 'Change'}</ActionButton>}
        />
        {showPassword && (
          <PasswordForm>
            {pwMessage && <div style={{ fontSize: 13, color: pwError ? '#9B4444' : '#5A8A6A' }}>{pwMessage}</div>}
            <FormField label="Current Password">
              <PasswordInput value={currentPw} onChange={e => setCurrentPw(e.target.value)} autoComplete="current-password" />
            </FormField>
            <FormField label="New Password">
              <PasswordInput value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Min 12 characters" autoComplete="new-password" />
            </FormField>
            <FormField label="Confirm New Password">
              <PasswordInput value={confirmPw} onChange={e => setConfirmPw(e.target.value)} autoComplete="new-password" />
            </FormField>
            <ActionButton onClick={handleChangePassword} disabled={pwLoading}>
              {pwLoading ? <Spinner size={14} /> : 'Update Password'}
            </ActionButton>
          </PasswordForm>
        )}
        <SettingsRow
          title="Active Sessions"
          description="Manage your logged-in devices"
          action={<ActionButton onClick={handleLoadSessions}>{showSessions ? 'Hide' : 'View'}</ActionButton>}
        />
        {showSessions && (
          <SessionsList>
            {sessionList.map(s => (
              <SessionItem key={s.id}>
                <SessionRow
                  deviceInfo={s.deviceInfo}
                  ipAddress={s.ipAddress}
                  lastActiveAt={s.lastActiveAt}
                  isCurrent={s.isCurrent}
                  onRevoke={() => handleRevokeSession(s.id)}
                />
              </SessionItem>
            ))}
          </SessionsList>
        )}

        {/* ── Recovery Key ── */}
        <SettingsRow
          title="Recovery Key"
          description="Generate a new recovery key for emergency account access"
          action={
            !generatedRecoveryKey && (
              <ActionButton onClick={() => { setShowRecoveryKey(!showRecoveryKey); setRecoveryKeyError(''); setRecoveryKeyPw(''); }}>
                {showRecoveryKey ? 'Cancel' : 'Generate'}
              </ActionButton>
            )
          }
        >
          {showRecoveryKey && !generatedRecoveryKey && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 13, color: 'var(--text-muted, #6b7280)' }}>
                Enter your password to generate a new recovery key. Your old recovery key will be replaced.
              </div>
              {recoveryKeyError && <div style={{ fontSize: 13, color: '#9B4444' }}>{recoveryKeyError}</div>}
              <PasswordInput
                value={recoveryKeyPw}
                onChange={e => setRecoveryKeyPw(e.target.value)}
                placeholder="Current password"
                autoComplete="current-password"
                autoFocus
              />
              <ActionButton onClick={handleGenerateRecoveryKey} disabled={recoveryKeyLoading || !recoveryKeyPw}>
                {recoveryKeyLoading ? <Spinner size={14} /> : 'Generate recovery key'}
              </ActionButton>
            </div>
          )}
          {generatedRecoveryKey && (
            <div style={{ marginTop: 10 }}>
              <RecoveryKeyDisplay
                recoveryKey={generatedRecoveryKey}
                onConfirm={() => { setGeneratedRecoveryKey(''); setShowRecoveryKey(false); }}
              />
            </div>
          )}
        </SettingsRow>

        {/* ── 2FA ── */}
        <SettingsRow
          title="Two-Factor Authentication"
          description={
            totpEnabled
              ? 'Active — using authenticator app'
              : twoFAStep === 'idle'
              ? 'Add an extra layer of security with an authenticator app'
              : undefined
          }
          action={
            totpEnabled ? (
              !disabling2FA ? (
                <ActionButton onClick={() => { setDisabling2FA(true); setDisable2FAPassword(''); setDisable2FAError(''); }}>
                  Disable
                </ActionButton>
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  <ActionButton
                    onClick={handleDisable2FA}
                    disabled={twoFALoading || !disable2FAPassword}
                    style={{ background: '#9B4444', color: '#fff' }}
                  >
                    {twoFALoading ? <Spinner size={14} /> : 'Confirm disable'}
                  </ActionButton>
                  <ActionButton onClick={() => setDisabling2FA(false)}>Cancel</ActionButton>
                </div>
              )
            ) : twoFAStep === 'idle' ? (
              <ActionButton onClick={handleStart2FASetup} disabled={twoFALoading}>
                {twoFALoading ? <Spinner size={14} /> : 'Enable'}
              </ActionButton>
            ) : null
          }
        >
          {/* Disable confirmation — password input */}
          {totpEnabled && disabling2FA && (
            <div style={{ marginTop: 8 }}>
              {disable2FAError && <div style={{ fontSize: 13, color: '#9B4444', marginBottom: 6 }}>{disable2FAError}</div>}
              <PasswordInput
                value={disable2FAPassword}
                onChange={e => setDisable2FAPassword(e.target.value)}
                placeholder="Enter your password to confirm"
                autoFocus
                autoComplete="current-password"
              />
            </div>
          )}

          {/* Step 1: QR code */}
          {!totpEnabled && twoFAStep === 'qr' && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 13, color: 'var(--text-muted, #6b7280)' }}>
                Scan this QR code with your authenticator app, then click Next.
              </div>
              {twoFAQrUrl && (
                <img src={twoFAQrUrl} alt="2FA QR code" style={{ width: 180, height: 180, borderRadius: 8, border: '1px solid #e5e7eb' }} />
              )}
              <div style={{ fontSize: 12, color: 'var(--text-muted, #6b7280)' }}>
                Manual entry code: <code style={{ userSelect: 'all', letterSpacing: 2 }}>{twoFASecret}</code>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <ActionButton onClick={() => setTwoFAStep('confirm')}>Next</ActionButton>
                <ActionButton onClick={() => { setTwoFAStep('idle'); setTwoFASecret(''); setTwoFAQrUrl(''); }}>Cancel</ActionButton>
              </div>
            </div>
          )}

          {/* Step 2: Confirm code */}
          {!totpEnabled && twoFAStep === 'confirm' && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 13, color: 'var(--text-muted, #6b7280)' }}>
                Enter the 6-digit code from your authenticator app to confirm setup.
              </div>
              {twoFAError && <div style={{ fontSize: 13, color: '#9B4444' }}>{twoFAError}</div>}
              <TextInput
                autoFocus
                value={twoFACode}
                onChange={e => setTwoFACode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                inputMode="numeric"
                maxLength={6}
                style={{ fontSize: 20, letterSpacing: 6, textAlign: 'center', width: 160 }}
                onKeyDown={e => e.key === 'Enter' && twoFACode.length === 6 && handleConfirm2FA()}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <ActionButton onClick={handleConfirm2FA} disabled={twoFALoading || twoFACode.length !== 6}>
                  {twoFALoading ? <Spinner size={14} /> : 'Confirm'}
                </ActionButton>
                <ActionButton onClick={() => { setTwoFAStep('qr'); setTwoFACode(''); setTwoFAError(''); }}>Back</ActionButton>
              </div>
            </div>
          )}

          {/* Step 3: Show backup codes */}
          {twoFAStep === 'codes' && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 13, color: 'var(--text-muted, #6b7280)' }}>
                <strong>Save these backup codes</strong> — they're shown only once. Each can be used once if you lose access to your authenticator app.
              </div>
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px',
                fontFamily: 'monospace', fontSize: 14, padding: '12px 16px',
                background: 'rgba(0,0,0,0.04)', borderRadius: 6,
              }}>
                {twoFABackupCodes.map(code => (
                  <span key={code} style={{ userSelect: 'all' }}>{code}</span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <ActionButton onClick={() => {
                  navigator.clipboard.writeText(twoFABackupCodes.join('\n')).catch(() => {});
                }}>
                  Copy all
                </ActionButton>
                <ActionButton onClick={() => { setTwoFAStep('idle'); setTwoFABackupCodes([]); }}>Done</ActionButton>
              </div>
            </div>
          )}
        </SettingsRow>
      </SettingsCard>

      {/* Features */}
      <SectionTitle>Features</SectionTitle>
      <SectionDescription>Enable optional topics for specialized tracking</SectionDescription>
      <SettingsCard>
        {FEATURES.map(feat => (
          <Fragment key={feat.key}>
            <SettingsRow
              title={feat.title}
              description={feat.description}
              action={<Toggle checked={features[feat.key] ?? false} onChange={v => handleFeatureToggle(feat.key, v)} activeColor={themeMode === 'dark' ? '#2D2C2A' : '#ecebe7'} />}
            />
            {feat.key === 'allergiesEnabled' && (
              <SettingsRow
                title="Cycle Tracking"
                description="Add period and flow tracking to the daily wellness check-in"
                action={
                  <Toggle
                    checked={cycleTrackingEnabled}
                    onChange={handleCycleTrackingToggle}
                    activeColor={themeMode === 'dark' ? '#2D2C2A' : '#ecebe7'}
                  />
                }
              />
            )}
          </Fragment>
        ))}
      </SettingsCard>

      {/* Data */}
      <SectionTitle>Data</SectionTitle>
      <SettingsCard>
        <SettingsRow
          title="Default Topics"
          description="Create default journal topics if missing"
          action={
            <ActionButton onClick={handleSeedTopics} disabled={seeding}>
              {seeding ? <Spinner size={14} /> : 'Add Default Topics'}
            </ActionButton>
          }
        />
        {seedResult && <div style={{ padding: '0 20px 12px', fontSize: 13, color: '#5A8A6A' }}>{seedResult}</div>}
        <SettingsRow
          title="Seed Test Data"
          description="Create test entries across all topic types — adds to existing data, does not delete anything"
          action={
            seedConfirmArmed ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <ActionButton
                  onClick={() => { setSeedConfirmArmed(false); handleSeedEntries(); }}
                  disabled={seedingEntries}
                  style={{ background: '#9B4444', color: '#fff' }}
                >
                  {seedingEntries ? <Spinner size={14} /> : 'Yes, seed'}
                </ActionButton>
                <ActionButton onClick={() => setSeedConfirmArmed(false)}>Cancel</ActionButton>
              </div>
            ) : (
              <ActionButton onClick={() => setSeedConfirmArmed(true)} disabled={seedingEntries}>
                Seed Entries
              </ActionButton>
            )
          }
        />
        {seedEntriesResult && <div style={{ padding: '0 20px 12px', fontSize: 13, color: seedEntriesResult.startsWith('Failed') ? '#9B4444' : '#5A8A6A' }}>{seedEntriesResult}</div>}
        <SettingsRow
          title="Export Entries"
          description="Download all entries as a decrypted CSV file"
          action={
            <ActionButton onClick={handleExportCsv} disabled={exporting || decryptedEntries.length === 0}>
              {exporting ? <Spinner size={14} /> : 'Export to CSV'}
            </ActionButton>
          }
        />
        <SettingsRow
          title="Import Entries"
          description="Import entries from a CSV file (Date, Topic, Content, Bookmarked)"
          action={
            <>
              <input
                ref={importFileRef}
                type="file"
                accept=".csv"
                style={{ display: 'none' }}
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) handleImportCsv(file);
                }}
              />
              <ActionButton onClick={() => importFileRef.current?.click()} disabled={importing}>
                {importing ? <Spinner size={14} /> : 'Import CSV'}
              </ActionButton>
            </>
          }
        />
        {importResult && <div style={{ padding: '0 20px 12px', fontSize: 13, color: importResult.startsWith('Failed') ? '#9B4444' : '#5A8A6A' }}>{importResult}</div>}
      </SettingsCard>

      {/* Privacy */}
      <SectionTitle>Privacy</SectionTitle>
      <PrivacyCard>
        <strong>Zero-Knowledge Encryption:</strong> Your journal entries are encrypted in your browser before being sent to the server. We cannot read your data. If you lose your password, your data cannot be recovered.
      </PrivacyCard>

      <DangerTitle />
      <DangerCard>
        <SettingsRow
          title="Sign Out"
          description="Sign out of your account on this device"
          action={<SignOutButton onClick={handleSignOut}>Sign Out</SignOutButton>}
        />
      </DangerCard>

      <div style={{ height: 48 }} />
    </SettingsTemplate>
  );
}
