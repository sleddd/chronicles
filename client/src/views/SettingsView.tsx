import { useState, useEffect, useRef, Fragment, type ReactNode } from 'react';
import styled from 'styled-components';
import { SettingsTemplate } from '../components/templates/SettingsTemplate.js';
import { SettingsCard, SettingsRow } from '../components/molecules/SettingsCard.js';
import {
  HeaderRow, Title, SectionDescription,
  PasswordForm, SessionsList, SessionItem,
  ColorSection, ColorSectionTitle, ColorSectionDesc,
} from '../components/molecules/SettingsSection.js';
import { ActionButton, SignOutButton, RowLink, OutlinedSection } from '../components/atoms/SettingsAtoms.js';
import { Toggle } from '../components/atoms/Toggle.js';
import { Select } from '../components/atoms/Select.js';
import { PasswordInput } from '../components/atoms/PasswordInput.js';
import { TextInput } from '../components/atoms/TextInput.js';
import { Button } from '../components/atoms/Button.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { FormField } from '../components/molecules/FormField.js';
import { SessionRow } from '../components/molecules/SessionRow.js';
import { RecoveryKeyDisplay } from '../components/molecules/RecoveryKeyDisplay.js';
import { deriveAuthSecret, newRecoveryProof, passwordSchema } from '@chronicles/shared';
import { CalendarSyncSettings } from '../components/organisms/CalendarSyncSettings.js';
import { ImageStorageSettings } from '../components/organisms/ImageStorageSettings.js';
import { AiSettings } from '../components/organisms/AiSettings.js';
import { DailyLogImport } from '../components/organisms/DailyLogImport.js';
import { CollapsibleCard } from '../components/organisms/CollapsibleCard.js';
import { UnlockDialog } from '../components/organisms/UnlockDialog.js';
import { EmptyState } from '../components/atoms/EmptyState.js';
import { useInitializeData } from '../hooks/useInitializeData.js';
import { useSignOut } from '../hooks/useSignOut.js';
import { useAuth } from '../contexts/AuthContext.js';
import { useEncryption } from '../contexts/EncryptionContext.js';
import { useUIStore } from '../stores/uiStore.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { useNavigate } from 'react-router-dom';
import { usePrivateSettings, type PrivateSettingKey } from '../services/privateSettings.js';
import { auth as authApi, settings as settingsApi, sessions as sessionsApi, topics as topicsApi, entries as entriesApi, finance as financeApi, doses as dosesApi, ApiError } from '../services/api.js';
import { buildFullExport, openAllSettings } from '../utils/fullExport.js';
import { BreachNoticeSetting } from '../components/organisms/BreachNoticeSetting.js';
import { seedTestData } from '../utils/seedTestData.js';
import { seedFinanceData } from '../utils/seedFinanceData.js';
import { clearFinanceCache } from '../stores/financeStore.js';
import { stripHtml } from '../utils/stripHtml.js';
import { parseCsvRow, splitCsvLines, csvCell } from '../utils/csv.js';
import { downloadEntriesExample } from '../utils/importExamples.js';
import { collectFinanceData, financeExportZip } from '../utils/financeExport.js';
import { parseThemePreference, type ThemePreference } from '../utils/autoTheme.js';
import { featureFlagsFrom } from '../utils/featureFlags.js';

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

/* Accent presets, ordered by hue then neutrals. All toned to roughly the same
   muted chroma as the original Teal so any of them sits calmly on the canvas. */
const ACCENT_PRESETS: { name: string; color: string }[] = [
  // Reds & pinks
  { name: 'Brick', color: '#b54a3c' },
  { name: 'Rose', color: '#b8455e' },
  { name: 'Berry', color: '#9c3f6b' },
  { name: 'Blush', color: '#c06f86' },
  // Oranges & yellows
  { name: 'Coral', color: '#c9694f' },
  { name: 'Terracotta', color: '#b0653f' },
  { name: 'Amber', color: '#b8853d' },
  { name: 'Ochre', color: '#9f8a35' },
  // Greens
  { name: 'Olive', color: '#7d8a3e' },
  { name: 'Sage', color: '#6f9a58' },
  { name: 'Moss', color: '#5b7a4a' },
  { name: 'Forest', color: '#3f6e4f' },
  { name: 'Jade', color: '#3c8f73' },
  { name: 'Mint', color: '#4fa38a' },
  // Blues
  { name: 'Teal', color: '#34a5a2' },
  { name: 'Ocean', color: '#2f7f9e' },
  { name: 'Sky', color: '#4a8fc0' },
  { name: 'Steel', color: '#4f7390' },
  { name: 'Denim', color: '#3d64b8' },
  { name: 'Navy', color: '#2e4a7d' },
  // Purples
  { name: 'Indigo', color: '#4d4fa3' },
  { name: 'Purple', color: '#6e53ac' },
  { name: 'Lavender', color: '#8a74b8' },
  { name: 'Violet', color: '#8a4fa3' },
  { name: 'Plum', color: '#7e4a7f' },
  // Neutrals
  { name: 'Slate', color: '#5a6b7d' },
  { name: 'Taupe', color: '#8a7564' },
  { name: 'Cocoa', color: '#6e4f3f' },
  { name: 'Graphite', color: '#4a4a4a' },
  { name: 'Ink', color: '#1f2937' },
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
  { key: 'financeEnabled', title: 'Finance', description: 'Budget, bills and subscriptions, goals and savings (manual entry, encrypted)' },
  { key: 'reconcileEnabled', title: 'Paycheck reconcile', description: 'Adds a Reconcile tab to Finance: pay bills from each paycheck and tick them off as they clear' },
];

/* ── Layout: each section is a bordered, collapsible card like the dashboards ── */

const Sections = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

/* Small italic note under the Finance switch */
const FinanceDisclaimer = styled.p`
  margin: 0;
  padding: 0 20px 14px;
  font-family: var(--font-sans);
  font-size: 12.5px;
  font-style: italic;
  line-height: 1.5;
  color: var(--text-tertiary);
`;

const SETTINGS_CARDS_KEY = 'settings-collapsed-v1';

/* All sections start collapsed; each card remembers being opened */
function Section(props: { id: string; title: string; children: ReactNode }) {
  return <CollapsibleCard storageKey={SETTINGS_CARDS_KEY} defaultOpen={false} {...props} />;
}

/* A field plus its small actions on one line (value + Change / Save) */
const InlineControls = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  & > :first-child { flex: 1; min-width: 0; }
`;

const EditActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 4px 0 12px;
`;

/* Links to the Health Data Privacy Policy and Terms, under the privacy note */
const PolicyLinks = styled.span`
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  margin-top: 12px;
  a { color: var(--color-accent-link, var(--color-accent)); font-weight: 500; }
`;

/* Prose inside a card (the guide, the privacy note) */
const GuideBody = styled.div`
  font-family: var(--font-sans);
  font-size: 15px;
  line-height: 1.6;
  color: var(--text-secondary);
  strong { color: var(--text-primary); font-weight: 600; }
`;

/* ── View ── */

export function SettingsView() {
  const { user, logout, encryptionData } = useAuth();
  const { lock, forgetBrowser, isRemembered, rewrapMasterKey, generateRecoveryKey, encryptPost, encryptRecord, decryptRecord, decryptBytes } = useEncryption();
  const { savePrivateSetting, loadPrivateSettings } = usePrivateSettings();
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
  const themePreference = useUIStore(s => s.themePreference);
  const setThemePreference = useUIStore(s => s.setThemePreference);
  const navigate = useNavigate();

  // How to Use

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

  // Cycle tracking
  const cycleTrackingEnabled = useUIStore(s => s.cycleTrackingEnabled);
  const setCycleTrackingEnabled = useUIStore(s => s.setCycleTrackingEnabled);
  const handleCycleTrackingToggle = async (enabled: boolean) => {
    setCycleTrackingEnabled(enabled);
    await savePrivateSetting('cycleTrackingEnabled', enabled).catch(() => {});
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
  const [twoFAPassword, setTwoFAPassword] = useState('');
  const [twoFABackupCodes, setTwoFABackupCodes] = useState<string[]>([]);
  const [twoFALoading, setTwoFALoading] = useState(false);
  const [twoFAError, setTwoFAError] = useState('');
  const [disabling2FA, setDisabling2FA] = useState(false);
  const [disable2FAPassword, setDisable2FAPassword] = useState('');
  const [disable2FACode, setDisable2FACode] = useState('');

  // Account deletion (inline confirmation — never window.confirm)
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteCode, setDeleteCode] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
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
  const [seedingFinance, setSeedingFinance] = useState(false);
  const [seedFinanceResult, setSeedFinanceResult] = useState('');
  const [seedFinanceArmed, setSeedFinanceArmed] = useState(false);
  const [exportingFinance, setExportingFinance] = useState(false);
  const [exportingAll, setExportingAll] = useState(false);
  const [exportAllResult, setExportAllResult] = useState('');
  const [financeExportResult, setFinanceExportResult] = useState('');

  // Load settings
  useEffect(() => {
    loadPrivateSettings().then(map => {
      if (typeof map.timezone === 'string') setTimezone(map.timezone);
      { const pref = parseThemePreference(map.themeMode); if (pref) useUIStore.getState().setThemePreference(pref); }
      if (typeof map.accentColor === 'string') setAccentColor(map.accentColor);
      const f: Record<string, boolean> = {};
      // Unset flags get the same defaults as useInitializeData (opt-in ones stay off)
      const defaults = featureFlagsFrom(map);
      for (const feat of FEATURES) f[feat.key] = defaults[feat.key];
      setFeatures(f);
      setFeatureFlags(f);
    }).catch(() => {});
  }, []);

  // Handlers
  const handleSaveDisplayName = async () => {
    setDisplayNameSaving(true);
    try {
      await savePrivateSetting('displayName', draftDisplayName.trim());
      setDisplayName(draftDisplayName.trim());
      setEditingDisplayName(false);
    } catch {
      // ignore — non-critical
    } finally {
      setDisplayNameSaving(false);
    }
  };

  const handleChangeEmail = async () => {
    if (!newEmail.trim() || !emailPassword) return;
    setEmailLoading(true);
    setEmailMessage('');
    setEmailError(false);
    try {
      // The sign-in secret is salted with the email, so the new one goes too
      const [currentAuthSecret, newAuthSecret] = await Promise.all([
        deriveAuthSecret(emailPassword, user?.email ?? ''),
        deriveAuthSecret(emailPassword, newEmail),
      ]);
      const result = await authApi.changeEmail({ newEmail: newEmail.trim(), currentAuthSecret, newAuthSecret });
      setEmailMessage('Email updated');
      setEditingEmail(false);
      setNewEmail('');
      setEmailPassword('');
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
    await savePrivateSetting('timezone', tz).catch(() => {});
  };

  // Light / Dark / Auto (light 7 AM – 7 PM, dark otherwise); saved as `themeMode`
  const handleThemeModeChange = async (pref: ThemePreference) => {
    setThemePreference(pref);
    await settingsApi.upsert('themeMode', pref).catch(() => {});
  };

  const handleAccentColorChange = async (color: string) => {
    setAccentColor(color);
    document.documentElement.style.setProperty('--color-accent', color);
    await settingsApi.upsert('accentColor', color).catch(() => {});
  };

  const handleFeatureToggle = async (key: string, value: boolean) => {
    const updated = { ...features, [key]: value };
    setFeatures(updated);
    setFeatureFlags(updated);
    // Encrypted: the switches alone say which health features someone uses
    await savePrivateSetting(key as PrivateSettingKey, value).catch(() => {});
  };

  const handleChangePassword = async () => {
    setPwMessage(''); setPwError(false);
    if (newPw !== confirmPw) { setPwMessage('Passwords do not match'); setPwError(true); return; }
    const rules = passwordSchema.safeParse(newPw);
    if (!rules.success) { setPwMessage(rules.error.errors[0].message); setPwError(true); return; }
    setPwLoading(true);
    try {
      const { salt, wrappedMK, wrapIv } = await rewrapMasterKey(newPw, currentPw);
      const [currentAuthSecret, newAuthSecret] = await Promise.all([
        deriveAuthSecret(currentPw, user?.email ?? ''),
        deriveAuthSecret(newPw, user?.email ?? ''),
      ]);
      await authApi.changePassword({ currentAuthSecret, newAuthSecret, newEncryptedMasterKey: wrappedMK, newKekSalt: salt, newKekWrapIv: wrapIv });
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

      const [currentAuthSecret, { recoveryKeyHash, recoveryKeySalt }] = await Promise.all([
        deriveAuthSecret(recoveryKeyPw, user?.email ?? ''),
        newRecoveryProof(recoveryKey),
      ]);

      await authApi.saveRecoveryKey({ currentAuthSecret, recoveryWrappedMK, recoveryWrapIv, recoveryKeyHash, recoveryKeySalt });
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
      const currentAuthSecret = await deriveAuthSecret(twoFAPassword, user?.email ?? '');
      const { backupCodes } = await authApi.enable2FA({ secret: twoFASecret, code: twoFACode, currentAuthSecret });
      setTwoFABackupCodes(backupCodes);
      setTotpEnabled(true);
      setTwoFAStep('codes');
      setTwoFACode('');
      setTwoFAPassword('');
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
      const authSecret = await deriveAuthSecret(disable2FAPassword, user?.email ?? '');
      await authApi.disable2FA({ authSecret, code: disable2FACode.trim() });
      setTotpEnabled(false);
      setDisabling2FA(false);
      setDisable2FAPassword('');
      setDisable2FACode('');
    } catch (err) {
      setDisable2FAError(err instanceof ApiError ? err.message : 'Failed to disable 2FA');
    } finally {
      setTwoFALoading(false);
    }
  };

  const handleSeedTopics = async () => {
    setSeeding(true); setSeedResult('');
    try {
      const freshTopics = await topicsApi.getAll(); // seeds any missing default topics, encrypted
      setTopics(freshTopics as typeof allTopics);
      setSeedResult('Default topics created');
    } catch { setSeedResult('Failed'); }
    finally { setSeeding(false); }
  };

  /** Download everything — entries, topics, dose log, settings, finance — decrypted here, as one JSON file. */
  const handleExportAll = async () => {
    setExportingAll(true); setExportAllResult('');
    try {
      const [settingRows, doseRes, finance] = await Promise.all([
        settingsApi.getAll(),
        dosesApi.getAll(),
        collectFinanceData({ list: financeApi.list, decryptRecord }),
      ]);
      const { settings, unreadable } = await openAllSettings(settingRows, decryptBytes);
      const data = buildFullExport({ entries: decryptedEntries, topics: allTopics, doseLogs: doseRes.logs, settings, finance });
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `chronicles-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportAllResult(unreadable.length
        ? `Downloaded — ${unreadable.length} setting${unreadable.length === 1 ? '' : 's'} couldn't be decrypted and ${unreadable.length === 1 ? 'was' : 'were'} left out`
        : 'Downloaded. The file is not encrypted — keep it somewhere safe.');
    } catch (err) {
      setExportAllResult(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setExportingAll(false);
    }
  };

  /** Download every Finance record, decrypted here in the browser, as one ZIP of spreadsheets + JSON. */
  const handleExportFinance = async () => {
    setExportingFinance(true); setFinanceExportResult('');
    try {
      const data = await collectFinanceData({ list: financeApi.list, decryptRecord });
      const zip = financeExportZip(data);
      const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: 'application/zip' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `chronicles-finance-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      const bad = Object.values(data.unreadable).reduce((t, n) => t + (n ?? 0), 0);
      setFinanceExportResult(bad
        ? `Downloaded — ${bad} record${bad === 1 ? '' : 's'} couldn't be decrypted and ${bad === 1 ? 'was' : 'were'} left out`
        : 'Downloaded. The file is not encrypted — keep it somewhere safe.');
    } catch (err) {
      setFinanceExportResult(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setExportingFinance(false);
    }
  };

  const handleSeedFinance = async () => {
    setSeedingFinance(true); setSeedFinanceResult('');
    try {
      const result = await seedFinanceData({
        encryptRecord,
        put: financeApi.put,
        onProgress: msg => setSeedFinanceResult(msg),
      });
      // Finance tabs reload (and decrypt) the new records next time they open
      clearFinanceCache();
      setSeedFinanceResult(result);
    } catch (err) {
      setSeedFinanceResult(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSeedingFinance(false);
    }
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


      const escCsv = csvCell;

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

  const handleDeleteAccount = async () => {
    setDeleteLoading(true);
    setDeleteError('');
    try {
      const authSecret = await deriveAuthSecret(deletePassword, user?.email ?? '');
      await authApi.deleteAccount({ authSecret, ...(totpEnabled && deleteCode.trim() ? { code: deleteCode.trim() } : {}) });
      lock(); clearAll(); await logout(); navigate('/login');
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Failed to delete account');
      setDeleteLoading(false);
    }
  };

  const handleSignOut = useSignOut();

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

      <Sections>
      <Section id="account" title="Account">
      <SettingsCard>
        <FormField label="Username">
          <TextInput value={user?.username || ''} readOnly aria-label="Username" />
        </FormField>
        {/* Display name edits in place — Save appears once it differs */}
        <FormField label="Display name">
          <InlineControls>
            <TextInput
              value={editingDisplayName ? draftDisplayName : displayName}
              onChange={e => { setEditingDisplayName(true); setDraftDisplayName(e.target.value); }}
              placeholder="Your first name or nickname"
              aria-label="Display name"
            />
            {editingDisplayName && draftDisplayName.trim() !== displayName && (
              <>
                <ActionButton onClick={handleSaveDisplayName} disabled={displayNameSaving}>
                  {displayNameSaving ? <Spinner size={14} /> : 'Save'}
                </ActionButton>
                <ActionButton onClick={() => { setEditingDisplayName(false); setDraftDisplayName(''); }}>Cancel</ActionButton>
              </>
            )}
          </InlineControls>
        </FormField>
        {/* Email changes need the current password, so it stays a Change flow */}
        {!editingEmail ? (
          <FormField label="Email">
            <InlineControls>
              <TextInput value={user?.email || ''} readOnly aria-label="Email" />
              <ActionButton onClick={() => { setEditingEmail(true); setNewEmail(user?.email || ''); setEmailMessage(''); }}>
                Change
              </ActionButton>
            </InlineControls>
          </FormField>
        ) : (
          <>
            <FormField label="New email">
              <TextInput
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                placeholder="New email address"
                type="email"
                autoFocus
              />
            </FormField>
            <FormField label="Password">
              <PasswordInput
                value={emailPassword}
                onChange={e => setEmailPassword(e.target.value)}
                placeholder="Current password"
                autoComplete="current-password"
              />
            </FormField>
            <EditActions>
              <ActionButton onClick={() => { setEditingEmail(false); setNewEmail(''); setEmailPassword(''); setEmailMessage(''); }}>
                Cancel
              </ActionButton>
              <ActionButton onClick={handleChangeEmail} disabled={emailLoading || !newEmail.trim() || !emailPassword}>
                {emailLoading ? <Spinner size={14} /> : 'Save email'}
              </ActionButton>
            </EditActions>
          </>
        )}
        {emailMessage && <div style={{ padding: '0 0 12px', fontSize: 13, color: emailError ? '#9B4444' : '#5A8A6A' }}>{emailMessage}</div>}
        <BreachNoticeSetting />
        <OutlinedSection>
          <FormField label="Privacy and terms">
            <PolicyLinks style={{ marginTop: 0 }}>
              <a href="/health-privacy" target="_blank" rel="noopener noreferrer">Health Data Privacy Policy</a>
              <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a>
            </PolicyLinks>
          </FormField>
        </OutlinedSection>
        {!deletingAccount ? (
          <FormField label="Delete account">
            <ActionButton onClick={() => { setDeletingAccount(true); setDeletePassword(''); setDeleteCode(''); setDeleteError(''); }}>
              Delete account…
            </ActionButton>
          </FormField>
        ) : (
          <>
            <div style={{ padding: '4px 0 12px', fontSize: 13, color: 'var(--text-secondary)' }}>
              This permanently deletes your account, every entry, topic and setting, your share links and your calendar feed. It can't be undone.
              Images in your own R2 bucket and events already synced to Google Calendar are not touched — remove those yourself if you want them gone.
            </div>
            <FormField label="Password">
              <PasswordInput
                value={deletePassword}
                onChange={e => setDeletePassword(e.target.value)}
                placeholder="Current password"
                autoComplete="current-password"
                autoFocus
              />
            </FormField>
            {totpEnabled && (
              <FormField label="2FA code">
                <TextInput
                  value={deleteCode}
                  onChange={e => setDeleteCode(e.target.value.slice(0, 64))}
                  placeholder="Authenticator or backup code"
                  autoComplete="one-time-code"
                />
              </FormField>
            )}
            {deleteError && <div style={{ padding: '0 0 8px', fontSize: 13, color: '#9B4444' }}>{deleteError}</div>}
            <EditActions>
              <ActionButton onClick={() => setDeletingAccount(false)} disabled={deleteLoading}>Cancel</ActionButton>
              <ActionButton
                onClick={handleDeleteAccount}
                disabled={deleteLoading || !deletePassword || (totpEnabled && !deleteCode.trim())}
                style={{ background: '#9B4444', color: '#fff' }}
              >
                {deleteLoading ? <Spinner size={14} /> : 'Delete forever'}
              </ActionButton>
            </EditActions>
          </>
        )}
      </SettingsCard>
      </Section>

      {/* Preferences */}
      <Section id="preferences" title="Preferences">
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
      </SettingsCard>
      </Section>

      <Section id="theme" title="Theme">
      <SettingsCard>
        <ColorSection>
          <ColorSectionTitle>Appearance</ColorSectionTitle>
          <ColorSectionDesc>Choose light or dark mode, or Auto: light from 7 AM, dark from 7 PM</ColorSectionDesc>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['light', 'dark', 'auto'] as const).map(pref => (
              <Button
                key={pref}
                variant="secondary"
                aria-pressed={themePreference === pref}
                onClick={() => handleThemeModeChange(pref)}
                style={{
                  flex: 1,
                  // Selected: accent outline + soft accent text, no fill (custom-field chips)
                  background: 'transparent',
                  border: `1px solid ${themePreference === pref ? 'var(--color-accent)' : 'var(--border-card)'}`,
                  color: themePreference === pref ? 'var(--color-accent-soft)' : 'var(--text-soft)',
                  fontWeight: themePreference === pref ? 600 : 400,
                }}
              >
                {pref === 'light' ? 'Light' : pref === 'dark' ? 'Dark' : 'Auto'}
              </Button>
            ))}
          </div>
        </ColorSection>
        <ColorSection>
          <ColorSectionTitle>Accent Color</ColorSectionTitle>
          <ColorSectionDesc>Choose an accent color for highlights and interactive elements</ColorSectionDesc>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {ACCENT_PRESETS.map(a => (
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
      </Section>

      <Section id="features" title="Features">
      <SectionDescription>Enable optional topics for specialized tracking</SectionDescription>
      <SettingsCard>
        {FEATURES.filter(feat => feat.key !== 'reconcileEnabled' || features.financeEnabled).map(feat => (
          <Fragment key={feat.key}>
            <SettingsRow
              title={feat.title}
              description={feat.description}
              action={<Toggle checked={features[feat.key] ?? false} onChange={v => handleFeatureToggle(feat.key, v)} activeColor={themeMode === 'dark' ? '#2D2C2A' : '#ecebe7'} />}
            />
            {feat.key === 'financeEnabled' && (
              <FinanceDisclaimer role="note">
                Finance is encrypted in your browser and the server never sees it, but Chronicles is not a banking app
                and no system is perfectly secure. You're responsible for your financial data — what you store, keeping
                your own records and backups, and securing your account and devices — and you accept the risk of
                keeping it here.
              </FinanceDisclaimer>
            )}
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
      </Section>

      <Section id="calendar-sync" title="Calendar Sync">
        <CalendarSyncSettings themeMode={themeMode} />
      </Section>

      <Section id="entry-images" title="Entry Images">
        <ImageStorageSettings themeMode={themeMode} />
      </Section>

      <Section id="ai" title="In-App AI">
        <AiSettings themeMode={themeMode} />
      </Section>

      <Section id="security" title="Security">
      <SettingsCard>
        <SettingsRow
          title="Remember me"
          description={isRemembered
            ? 'This browser stays unlocked until you close it, lock, or sign out (an hour idle or 12 hours at most).'
            : 'Off on this browser. Tick “Remember me” when you sign in or unlock to stay unlocked until you close the browser.'}
          action={isRemembered ? <ActionButton onClick={forgetBrowser}>Forget this browser</ActionButton> : undefined}
        />
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
                <ActionButton onClick={() => { setDisabling2FA(true); setDisable2FAPassword(''); setDisable2FACode(''); setDisable2FAError(''); }}>
                  Disable
                </ActionButton>
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  <ActionButton
                    onClick={handleDisable2FA}
                    disabled={twoFALoading || !disable2FAPassword || !disable2FACode.trim()}
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
              <TextInput
                value={disable2FACode}
                onChange={e => setDisable2FACode(e.target.value.slice(0, 64))}
                placeholder="Authenticator or backup code"
                autoComplete="one-time-code"
                style={{ marginTop: 8 }}
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
                Enter the 6-digit code from your authenticator app and your password to confirm setup.
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
              />
              <PasswordInput
                value={twoFAPassword}
                onChange={e => setTwoFAPassword(e.target.value)}
                placeholder="Your password"
                autoComplete="current-password"
                onKeyDown={e => e.key === 'Enter' && twoFACode.length === 6 && twoFAPassword && handleConfirm2FA()}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <ActionButton onClick={handleConfirm2FA} disabled={twoFALoading || twoFACode.length !== 6 || !twoFAPassword}>
                  {twoFALoading ? <Spinner size={14} /> : 'Confirm'}
                </ActionButton>
                <ActionButton onClick={() => { setTwoFAStep('qr'); setTwoFACode(''); setTwoFAPassword(''); setTwoFAError(''); }}>Back</ActionButton>
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
      </Section>

      <Section id="data" title="Data">
      <SettingsCard>
        <SettingsRow
          title="Export All"
          description="Download everything, decrypted, as one JSON file: entries, topics, your medication dose log, settings (including your notes for the AI) and finance. AI and storage keys are left out. The file is not encrypted — store it safely."
          action={
            <ActionButton onClick={() => void handleExportAll()} disabled={exportingAll}>
              {exportingAll ? <Spinner size={14} /> : 'Export All'}
            </ActionButton>
          }
        />
        {exportAllResult && <div style={{ padding: '0 20px 12px', fontSize: 13, color: exportAllResult.startsWith('Failed') ? '#9B4444' : '#5A8A6A' }}>{exportAllResult}</div>}
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
        {/* Seed buttons are for development only — never in a production build */}
        {import.meta.env.DEV && (<>
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
        {features.financeEnabled && (
          <>
            <SettingsRow
              title="Seed Finance Data"
              description="Add sample budget categories, bills and subscriptions with payments, spending, savings funds, goals and paydays — adds to existing data, does not delete anything"
              action={
                seedFinanceArmed ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <ActionButton
                      onClick={() => { setSeedFinanceArmed(false); void handleSeedFinance(); }}
                      disabled={seedingFinance}
                      style={{ background: '#9B4444', color: '#fff' }}
                    >
                      {seedingFinance ? <Spinner size={14} /> : 'Yes, seed'}
                    </ActionButton>
                    <ActionButton onClick={() => setSeedFinanceArmed(false)}>Cancel</ActionButton>
                  </div>
                ) : (
                  <ActionButton onClick={() => setSeedFinanceArmed(true)} disabled={seedingFinance}>
                    Seed Finance
                  </ActionButton>
                )
              }
            />
            {seedFinanceResult && <div style={{ padding: '0 20px 12px', fontSize: 13, color: seedFinanceResult.startsWith('Failed') ? '#9B4444' : '#5A8A6A' }}>{seedFinanceResult}</div>}
          </>
        )}
        </>)}
        <SettingsRow
          title="Export Finance Data"
          description="Download everything in Finance, decrypted, as one ZIP: a spreadsheet (CSV) each for budget categories, bills, bill payments, spending, savings funds and entries, goals, paydays and payday lines, one sheet of every transaction, and a complete JSON backup. The file is not encrypted — store it safely."
          action={
            <ActionButton onClick={() => void handleExportFinance()} disabled={exportingFinance}>
              {exportingFinance ? <Spinner size={14} /> : 'Export All'}
            </ActionButton>
          }
        />
        {financeExportResult && <div style={{ padding: '0 20px 12px', fontSize: 13, color: financeExportResult.startsWith('Failed') ? '#9B4444' : '#5A8A6A' }}>{financeExportResult}</div>}
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
          description="Import entries from a CSV file (Date, Topic, Content, Bookmarked). Topic names must match your existing topics; any other column becomes a custom field."
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
        >
          <div><RowLink type="button" onClick={downloadEntriesExample}>Download example CSV</RowLink></div>
        </SettingsRow>
        {importResult && <div style={{ padding: '0 20px 12px', fontSize: 13, color: importResult.startsWith('Failed') ? '#9B4444' : '#5A8A6A' }}>{importResult}</div>}
        <DailyLogImport />
      </SettingsCard>
      </Section>

      <Section id="privacy" title="Privacy">
        <GuideBody>
          <strong>Zero-Knowledge Encryption:</strong> Your journal entries are encrypted in your browser before being sent to the server. We cannot read your data. If you lose your password, your data cannot be recovered.
          <PolicyLinks>
            <a href="/health-privacy" target="_blank" rel="noopener noreferrer">Health Data Privacy Policy</a>
            <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a>
          </PolicyLinks>
        </GuideBody>
      </Section>

      <Section id="sign-out" title="Sign Out">
        <SettingsCard>
          <SettingsRow
            title="This device"
            description="Sign out of your account on this device"
            action={<SignOutButton onClick={handleSignOut}>Sign Out</SignOutButton>}
          />
        </SettingsCard>
      </Section>
      </Sections>

      <div style={{ height: 48 }} />
    </SettingsTemplate>
  );
}
