import { useState, useEffect, useRef, Fragment, type ReactNode } from 'react';
import styled from 'styled-components';
import { SettingsTemplate } from '../components/templates/SettingsTemplate.js';
import { SettingsCard, SettingsRow } from '../components/molecules/SettingsCard.js';
import {
  HeaderRow, Title, SectionDescription,
  SessionsList, SessionItem,
  ColorSection, ColorSectionTitle, ColorSectionDesc,
} from '../components/molecules/SettingsSection.js';
import { ActionButton, SignOutButton, RowLink } from '../components/atoms/SettingsAtoms.js';
import { Toggle } from '../components/atoms/Toggle.js';
import { Select } from '../components/atoms/Select.js';
import { PasswordInput } from '../components/atoms/PasswordInput.js';
import { TextInput } from '../components/atoms/TextInput.js';
import { Button } from '../components/atoms/Button.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { FormField } from '../components/molecules/FormField.js';
import { SessionRow } from '../components/molecules/SessionRow.js';
import { RecoveryKeyDisplay } from '../components/molecules/RecoveryKeyDisplay.js';
import { deriveAuthSecret, newRecoveryProof, newPasswordProblem } from '@chronicles/shared';
import { PasswordStrengthMeter } from '../components/molecules/PasswordStrengthMeter.js';
import { CalendarSyncSettings } from '../components/organisms/CalendarSyncSettings.js';
import { ImageStorageSettings } from '../components/organisms/ImageStorageSettings.js';
import { AiSettings } from '../components/organisms/AiSettings.js';
import { DailyLogImport } from '../components/organisms/DailyLogImport.js';
import { TrainingImport } from '../components/organisms/TrainingImport.js';
import { MediaMigration } from '../components/organisms/MediaMigration.js';
import { PublicShelfSettingsRow } from '../components/organisms/PublicShelfSettingsRow.js';
import { CollapsibleCard } from '../components/organisms/CollapsibleCard.js';
import { PasskeySettings } from '../components/organisms/PasskeySettings.js';
import { TrustedBrowsersSettings } from '../components/organisms/TrustedBrowsersSettings.js';
import { ConfirmIdentity, ACCOUNT_PASSWORD_LABEL } from '../components/molecules/ConfirmIdentity.js';
import { signInMethodLabel } from '../components/molecules/SessionRow.js';
import { PasskeyCancelled, confirmWithPasskey, suggestedPasskeyName } from '../services/passkeys.js';
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
import {
  SettingsGroup, SettingsGroupRow, SettingsLinkRow, SettingsGroupBody, SettingsActionRow,
  SettingsFoot, RowPill, RowNote, InPlaceInput, FormActions, StatusOk,
} from '../components/molecules/SettingsGroup.js';
import { BugReportForm } from '../components/organisms/BugReportForm.js';
import { seedTestData, seedExerciseScheduleOnly, seedWellnessOnly, seedMediaOnly, seedPlanningOnly, seedTodayOnly } from '../utils/seedTestData.js';
import { seedFinanceData } from '../utils/seedFinanceData.js';
import { clearFinanceCache } from '../stores/financeStore.js';
import { stripHtml } from '../utils/stripHtml.js';
import { parseCsvRow, splitCsvLines, csvCell, isReservedImportColumn, guardImportedFields } from '../utils/csv.js';
import { getSyncTopicMap } from '../services/calendarSync.js';
import { showFlash } from '../services/flashNotice.js';
import { downloadEntriesExample } from '../utils/importExamples.js';
import { collectFinanceData, financeExportZip } from '../utils/financeExport.js';
import { parseThemePreference, type ThemePreference } from '../utils/autoTheme.js';
import { featureFlagsFrom } from '../utils/featureFlags.js';
import { WallpaperPicker } from '../components/molecules/WallpaperPicker.js';
import { useEncryptedSetting } from '../hooks/useEncryptedSetting.js';
import { CUSTOM_WALLPAPER, DEFAULT_CHOICE, shownWallpaper, wallpaperById, wallpaperSetting, type WallpaperSetting } from '../utils/wallpapers.js';
import { CustomPhotoTile } from '../components/organisms/CustomPhotoTile.js';
import { useImagesReady } from '../hooks/useImagesReady.js';
import { pinImageKeys, type EntryImage } from '../services/imageStorage.js';
import { replaceStoredImage } from '../services/backgroundImages.js';
import { storedImageKeys } from '../utils/storedImage.js';

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
  { name: 'Taupe', color: '#a39080' },
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
  { key: 'entertainmentEnabled', title: 'Media', description: 'Books, movies, TV shows and music on shelves, with ratings' },
  { key: 'inspirationEnabled', title: 'Inspiration', description: 'Save research, ideas, and quotes' },
  { key: 'holidaysEnabled', title: 'Holidays', description: 'US holidays on the calendar' },
  { key: 'financeEnabled', title: 'Finance', description: 'Budget, bills and subscriptions, goals and savings (manual entry, encrypted)' },
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
// CSV import saves this many entries per request
const IMPORT_BATCH = 50;

/* All sections start collapsed; each card remembers being opened */
/* Settings' section cards have no outline — the fill and a very light, even shadow
   set them off the page */
const BorderlessCard = styled.div`
  & > section { border: none; box-shadow: 0 0 12px rgba(0, 0, 0, 0.04); }
  html[data-theme='dark'] & > section { box-shadow: 0 0 22px rgba(0, 0, 0, 0.12); }
`;

function Section(props: { id: string; title: string; subtitle?: string; children: ReactNode }) {
  return <BorderlessCard><CollapsibleCard storageKey={SETTINGS_CARDS_KEY} defaultOpen={false} {...props} /></BorderlessCard>;
}



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
  const { user, logout } = useAuth();
  const { clearKey, passwordSource, rewrapWith, recoveryKeyWith, encryptNewPost, encryptRecord, decryptRecord, decryptBytes } = useEncryption();
  const { savePrivateSetting, loadPrivateSettings } = usePrivateSettings();
  useInitializeData();
  // The account has a passkey this browser can use: the confirmed actions offer
  // "Use a passkey" in place of the password and the 2FA code
  const [canPasskey, setCanPasskey] = useState(false);
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
  // Background: none by default, else a wallpaper (sealed setting `wallpaper`)
  // What shows now (a never-picked choice is the theme's default photo)
  const wallpaper = useUIStore(s => shownWallpaper(s.wallpaper, s.themeMode));
  const setWallpaper = useUIStore(s => s.setWallpaper);
  const [, saveWallpaper] = useEncryptedSetting<WallpaperSetting>('wallpaper', null);
  // A photo of the person's own (uploaded, or from their entries' photos): offered only
  // while Entry Images is on and set up. It stays saved while another background is chosen
  const customWallpaper = useUIStore(s => s.customWallpaper);
  const setCustomWallpaper = useUIStore(s => s.setCustomWallpaper);
  const imagesReady = useImagesReady();
  // None is saved as its own value: nothing saved means the default photo
  const saveBackground = (id: string | null, custom: EntryImage | null) => saveWallpaper(wallpaperSetting(id, custom));
  const BACKGROUND_NOT_SAVED = 'Couldn’t save your background. Try again.';
  // Shown at once; a save that fails puts the last background back and says so
  const chooseWallpaper = (id: string | null) => {
    const before = useUIStore.getState().wallpaper;
    setWallpaper(id);
    saveBackground(id, customWallpaper).catch(err => {
      console.error('Saving the background failed:', err instanceof Error ? err.message : err);
      setWallpaper(before);
      showFlash(BACKGROUND_NOT_SAVED);
    });
  };
  const setOwnWallpaper = async (image: EntryImage | null) => {
    const old = customWallpaper;
    const before = useUIStore.getState().wallpaper;
    // Removed while it was showing: back to the theme's default photo
    const choice = image ? CUSTOM_WALLPAPER : before === CUSTOM_WALLPAPER ? DEFAULT_CHOICE : before;
    setCustomWallpaper(image);
    setWallpaper(choice);
    pinImageKeys('wallpaper', storedImageKeys(image));
    // The photo it replaces leaves the bucket only once this is saved
    const saved = await replaceStoredImage({
      old, next: image,
      save: () => saveBackground(choice, image),
      repin: () => pinImageKeys('wallpaper', storedImageKeys(old)),
    });
    if (saved) return;
    setCustomWallpaper(old);
    setWallpaper(before);
    showFlash(BACKGROUND_NOT_SAVED);
  };
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
    await savePrivateSetting('cycleTrackingEnabled', enabled).catch(() => showFlash('Couldn’t save that setting. Check your connection and try again.'));
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
  const [sessionList, setSessionList] = useState<{ id: number; deviceInfo: string | null; userAgent?: string | null; ipAddress: string | null; lastActiveAt: string; isCurrent: boolean }[]>([]);

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
  // With 2FA on, password / email / recovery-key changes need a code too
  const [emailCode, setEmailCode] = useState('');
  const [pwCode, setPwCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const withCode = (code: string) => (totpEnabled && code.trim() ? { code: code.trim() } : {});
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
      useUIStore.getState().setThemePreference(parseThemePreference(map.themeMode) ?? 'dark');
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
      const result = await authApi.changeEmail({ newEmail: newEmail.trim(), currentAuthSecret, newAuthSecret, ...withCode(emailCode) });
      setEmailMessage('Email updated');
      setEditingEmail(false);
      setNewEmail('');
      setEmailPassword('');
      setEmailCode('');
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
    await savePrivateSetting('timezone', tz).catch(() => showFlash('Couldn’t save that setting. Check your connection and try again.'));
  };

  // Light / Dark / Auto (light 7 AM – 7 PM, dark otherwise); saved as `themeMode`
  const handleThemeModeChange = async (pref: ThemePreference) => {
    setThemePreference(pref);
    await settingsApi.upsert('themeMode', pref).catch(() => showFlash('Couldn’t save that setting. Check your connection and try again.'));
  };

  const handleAccentColorChange = async (color: string) => {
    setAccentColor(color);
    document.documentElement.style.setProperty('--color-accent', color);
    await settingsApi.upsert('accentColor', color).catch(() => showFlash('Couldn’t save that setting. Check your connection and try again.'));
  };

  const handleFeatureToggle = async (key: string, value: boolean) => {
    const updated = { ...features, [key]: value };
    setFeatures(updated);
    setFeatureFlags(updated);
    // Encrypted: the switches alone say which health features someone uses
    await savePrivateSetting(key as PrivateSettingKey, value).catch(() => showFlash('Couldn’t save that setting. Check your connection and try again.'));
  };

  const handleChangePassword = async (via: 'password' | 'passkey' = 'password') => {
    setPwMessage(''); setPwError(false);
    if (newPw !== confirmPw) { setPwMessage('Passwords do not match'); setPwError(true); return; }
    const pwProblem = newPasswordProblem(newPw, { email: user?.email, username: user?.username });
    if (pwProblem) { setPwMessage(pwProblem); setPwError(true); return; }
    setPwLoading(true);
    let touched: Uint8Array | null = null;
    try {
      const email = user?.email ?? '';
      const newAuthSecret = await deriveAuthSecret(newPw, email);
      let wrap: { salt: string; wrappedMK: string; wrapIv: string };
      if (via === 'passkey') {
        // One touch stands in for the current password (the 2FA code still
        // goes with it), and opens the key for the new wrap
        const c = await confirmWithPasskey('change-password', totpEnabled ? pwCode : undefined);
        touched = c.prf;
        wrap = await rewrapWith({ kind: 'passkey', prf: c.prf, wrap: c.wrap }, newPw);
        await authApi.changePassword({ confirmToken: c.confirmToken, newAuthSecret, newEncryptedMasterKey: wrap.wrappedMK, newKekSalt: wrap.salt, newKekWrapIv: wrap.wrapIv });
      } else {
        // The password (and the 2FA code) are checked when the wrap is handed
        // over, and its token then confirms the change itself
        const source = await passwordSource(currentPw, email, 'change-password', totpEnabled ? pwCode : undefined);
        wrap = await rewrapWith(source, newPw);
        await authApi.changePassword({ confirmToken: source.confirmToken, newAuthSecret, newEncryptedMasterKey: wrap.wrappedMK, newKekSalt: wrap.salt, newKekWrapIv: wrap.wrapIv });
      }
      setPwMessage('Password changed'); setCurrentPw(''); setNewPw(''); setConfirmPw(''); setPwCode(''); setShowPassword(false);
    } catch (err) {
      if (!(err instanceof PasskeyCancelled)) { setPwMessage(err instanceof Error ? err.message : 'Failed'); setPwError(true); }
    } finally {
      touched?.fill(0);
      setPwLoading(false);
    }
  };

  const handleGenerateRecoveryKey = async (via: 'password' | 'passkey' = 'password') => {
    setRecoveryKeyError('');
    if (via === 'password' && !recoveryKeyPw) { setRecoveryKeyError(ACCOUNT_PASSWORD_LABEL); return; }
    setRecoveryKeyLoading(true);
    let touched: Uint8Array | null = null;
    try {
      const email = user?.email ?? '';
      let made: { recoveryKey: string; recoveryWrappedMK: string; recoveryWrapIv: string };
      let confirmation: { confirmToken: string };
      if (via === 'passkey') {
        const c = await confirmWithPasskey('recovery-key', totpEnabled ? recoveryCode : undefined);
        touched = c.prf;
        made = await recoveryKeyWith({ kind: 'passkey', prf: c.prf, wrap: c.wrap });
        confirmation = { confirmToken: c.confirmToken };
      } else {
        const source = await passwordSource(recoveryKeyPw, email, 'recovery-key', totpEnabled ? recoveryCode : undefined);
        made = await recoveryKeyWith(source);
        confirmation = { confirmToken: source.confirmToken };
      }
      const { recoveryKeyHash, recoveryKeySalt } = await newRecoveryProof(made.recoveryKey);
      await authApi.saveRecoveryKey({ recoveryWrappedMK: made.recoveryWrappedMK, recoveryWrapIv: made.recoveryWrapIv, recoveryKeyHash, recoveryKeySalt, ...confirmation });
      setGeneratedRecoveryKey(made.recoveryKey);
      setRecoveryKeyPw('');
      setRecoveryCode('');
    } catch (err) {
      if (!(err instanceof PasskeyCancelled)) setRecoveryKeyError(err instanceof Error ? err.message : 'Failed to generate recovery key');
    } finally {
      touched?.fill(0);
      setRecoveryKeyLoading(false);
    }
  };

  /** A passkey touch for an action that needs no new wrap: just its single-use token */
  const passkeyToken = async (action: 'delete-account' | '2fa-enable' | '2fa-disable', code?: string): Promise<string> => {
    // With 2FA on, the code goes with the touch (a passkey stands in for the password only)
    const c = await confirmWithPasskey(action, code);
    c.prf.fill(0);
    return c.confirmToken;
  };

  const handleLoadSessions = async () => {
    setShowSessions(!showSessions);
    if (!showSessions) {
      // A failed load must not read as "no sessions"
      const data = await sessionsApi.getAll().catch(() => { showFlash('Couldn’t load your sessions. Try again.'); return null; });
      if (data) setSessionList(data as typeof sessionList);
      else setShowSessions(false);
    }
  };

  const handleRevokeSession = async (id: number) => {
    try {
      await sessionsApi.revoke(id);
      setSessionList(prev => prev.filter(s => s.id !== id));
    } catch {
      showFlash('Couldn’t sign that session out. Try again.');
    }
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

  const handleConfirm2FA = async (via: 'password' | 'passkey' = 'password') => {
    setTwoFALoading(true);
    setTwoFAError('');
    try {
      const confirmation = via === 'passkey'
        ? { confirmToken: await passkeyToken('2fa-enable') }
        : { currentAuthSecret: await deriveAuthSecret(twoFAPassword, user?.email ?? '') };
      const { backupCodes } = await authApi.enable2FA({ secret: twoFASecret, code: twoFACode, ...confirmation });
      setTwoFABackupCodes(backupCodes);
      setTotpEnabled(true);
      setTwoFAStep('codes');
      setTwoFACode('');
      setTwoFAPassword('');
      // It's on: the authenticator secret and its QR have done their job
      setTwoFASecret('');
      setTwoFAQrUrl('');
    } catch (err) {
      if (!(err instanceof PasskeyCancelled)) setTwoFAError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setTwoFALoading(false);
    }
  };

  const handleDisable2FA = async (via: 'password' | 'passkey' = 'password') => {
    setTwoFALoading(true);
    setDisable2FAError('');
    try {
      if (via === 'passkey') await authApi.disable2FA({ confirmToken: await passkeyToken('2fa-disable', disable2FACode) });
      else await authApi.disable2FA({ authSecret: await deriveAuthSecret(disable2FAPassword, user?.email ?? ''), code: disable2FACode.trim() });
      setTotpEnabled(false);
      setDisabling2FA(false);
      setDisable2FAPassword('');
      setDisable2FACode('');
    } catch (err) {
      if (!(err instanceof PasskeyCancelled)) setDisable2FAError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Failed to disable 2FA');
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
        dosesApi.getAll({ fresh: true }),
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
        encryptPost: encryptNewPost,
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

  const [seedingWellness, setSeedingWellness] = useState(false);
  const [seedWellnessResult, setSeedWellnessResult] = useState('');
  const handleSeedWellness = async () => {
    setSeedingWellness(true); setSeedWellnessResult('');
    try {
      const freshTopics = await topicsApi.getAll();
      setSeedWellnessResult(await seedWellnessOnly({
        encryptPost: encryptNewPost,
        topics: freshTopics as { id: number; name: string; icon: string | null; color: string | null }[],
        addDecryptedEntry,
        onProgress: (msg) => setSeedWellnessResult(msg),
      }));
    } catch (err) {
      setSeedWellnessResult(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSeedingWellness(false);
    }
  };

  const [seedingToday, setSeedingToday] = useState(false);
  const [seedTodayResult, setSeedTodayResult] = useState('');
  const handleSeedToday = async () => {
    setSeedingToday(true); setSeedTodayResult('');
    try {
      const freshTopics = await topicsApi.getAll();
      setSeedTodayResult(await seedTodayOnly({
        encryptPost: encryptNewPost,
        topics: freshTopics as { id: number; name: string; icon: string | null; color: string | null }[],
        addDecryptedEntry,
        onProgress: (msg) => setSeedTodayResult(msg),
      }));
    } catch (err) {
      setSeedTodayResult(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSeedingToday(false);
    }
  };

  const [seedingMeals, setSeedingMeals] = useState(false);
  const [seedMealsResult, setSeedMealsResult] = useState('');
  const handleSeedMeals = async () => {
    setSeedingMeals(true); setSeedMealsResult('');
    try {
      const freshTopics = await topicsApi.getAll();
      setSeedMealsResult(await seedTodayOnly({
        encryptPost: encryptNewPost,
        topics: freshTopics as { id: number; name: string; icon: string | null; color: string | null }[],
        addDecryptedEntry,
        onProgress: (msg) => setSeedMealsResult(msg),
      }, { mealsOnly: true }));
    } catch (err) {
      setSeedMealsResult(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSeedingMeals(false);
    }
  };

  const [seedingMedia, setSeedingMedia] = useState(false);
  const [seedMediaResult, setSeedMediaResult] = useState('');
  const handleSeedMedia = async () => {
    setSeedingMedia(true); setSeedMediaResult('');
    try {
      const freshTopics = await topicsApi.getAll();
      setSeedMediaResult(await seedMediaOnly({
        encryptPost: encryptNewPost,
        topics: freshTopics as { id: number; name: string; icon: string | null; color: string | null }[],
        addDecryptedEntry,
        onProgress: (msg) => setSeedMediaResult(msg),
      }));
    } catch (err) {
      setSeedMediaResult(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSeedingMedia(false);
    }
  };

  const [seedingPlanning, setSeedingPlanning] = useState(false);
  const [seedPlanningResult, setSeedPlanningResult] = useState('');
  const handleSeedPlanning = async () => {
    setSeedingPlanning(true); setSeedPlanningResult('');
    try {
      const freshTopics = await topicsApi.getAll();
      setSeedPlanningResult(await seedPlanningOnly({
        encryptPost: encryptNewPost,
        topics: freshTopics as { id: number; name: string; icon: string | null; color: string | null }[],
        addDecryptedEntry,
        onProgress: (msg) => setSeedPlanningResult(msg),
      }));
    } catch (err) {
      setSeedPlanningResult(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSeedingPlanning(false);
    }
  };

  const [seedingSchedule, setSeedingSchedule] = useState(false);
  const [seedScheduleResult, setSeedScheduleResult] = useState('');
  const handleSeedSchedule = async () => {
    setSeedingSchedule(true); setSeedScheduleResult('');
    try {
      const freshTopics = await topicsApi.getAll();
      setSeedScheduleResult(await seedExerciseScheduleOnly({
        encryptPost: encryptNewPost,
        topics: freshTopics as { id: number; name: string; icon: string | null; color: string | null }[],
        addDecryptedEntry,
        onProgress: (msg) => setSeedScheduleResult(msg),
      }));
    } catch (err) {
      setSeedScheduleResult(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSeedingSchedule(false);
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
      // The topics whose entries go to the calendar (Event, Meeting)
      const calendarTopicIds = new Set(getSyncTopicMap().keys());
      for (const t of allTopics) {
        topicNameMap.set(t.name.toLowerCase(), t.id);
      }

      // Known non-custom-field columns
      const skipHeaders = new Set(['id', 'date', 'updated', 'topic', 'content', 'bookmarked']);

      let imported = 0;
      let skipped = 0;
      const total = lines.length - 1;

      // Entries are saved IMPORT_BATCH at a time (one request each), so a big
      // file doesn't run into the per-account request limit
      let pending: { payload: Parameters<typeof entriesApi.createMany>[0][number]; content: string; metadata: Record<string, unknown> }[] = [];
      const flush = async () => {
        const created = await entriesApi.createMany(pending.map(p => p.payload));
        created.forEach((result, k) => {
          addDecryptedEntry({
            id: result.id as number,
            content: pending[k].content,
            metadata: pending[k].metadata,
            isEncrypted: true,
            createdAt: new Date(result.createdAt as string),
            updatedAt: new Date((result.updatedAt || result.createdAt) as string),
          });
        });
        imported += created.length;
        pending = [];
        setImportResult(`Importing ${imported} of ${total}...`);
      };

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

        // Custom fields from extra columns — never the app's own keys: a file
        // from someone else must not be able to put its rows on the public
        // shelf, or link them to doses, schedules and the like
        for (let h = 0; h < headers.length; h++) {
          if (skipHeaders.has(headers[h].toLowerCase()) || h >= fields.length) continue;
          if (isReservedImportColumn(headers[h])) continue;
          const val = fields[h]?.trim();
          if (!val) continue;
          if (val.toLowerCase() === 'yes') customFields[headers[h]] = true;
          else if (val.toLowerCase() === 'no') customFields[headers[h]] = false;
          else customFields[headers[h]] = val;
        }

        // Dates and times must be dates and times, and a row filed under Event
        // or Meeting starts with calendar sync off (see guardImportedFields)
        const guarded = guardImportedFields(customFields, {
          calendarTopic: typeof metadata._taxonomyId === 'number' && calendarTopicIds.has(metadata._taxonomyId),
        });
        if (Object.keys(guarded).length > 0) {
          metadata._customFields = guarded;
        }

        // Wrap plain text in HTML paragraphs for TipTap. The CSV is text, so
        // it's escaped: markup in a cell stays words, never tags in the entry
        const escapeCell = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const htmlContent = content.split('\n').map(line => `<p>${line ? escapeCell(line) : '<br>'}</p>`).join('');

        // Parse date (sealed into the metadata too, so the server can't re-date it)
        const createdAt = new Date(dateStr).toISOString();
        metadata._createdAt = createdAt;

        // Encrypt
        const encrypted = await encryptNewPost(htmlContent, metadata);

        // Queue for the next batch create
        const taxonomyIds = metadata._taxonomyId ? [metadata._taxonomyId as number] : [];
        pending.push({ content: htmlContent, metadata, payload: {
          id: encrypted.id,
          contentEncrypted: encrypted.contentEncrypted,
          contentIv: encrypted.contentIv,
          metadataEncrypted: encrypted.metadataEncrypted,
          metadataIv: encrypted.metadataIv,
          isEncrypted: true,
          taxonomyIds,
          createdAt,
        } });
        if (pending.length >= IMPORT_BATCH) await flush();
      }
      await flush();

      setImportResult(`Imported ${imported} entries${skipped > 0 ? `, ${skipped} skipped` : ''}`);
    } catch (err) {
      setImportResult(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setImporting(false);
      if (importFileRef.current) importFileRef.current.value = '';
    }
  };

  const handleDeleteAccount = async (via: 'password' | 'passkey' = 'password') => {
    setDeleteLoading(true);
    setDeleteError('');
    try {
      if (via === 'passkey') await authApi.deleteAccount({ confirmToken: await passkeyToken('delete-account', totpEnabled ? deleteCode : undefined) });
      else await authApi.deleteAccount({ authSecret: await deriveAuthSecret(deletePassword, user?.email ?? ''), ...(totpEnabled && deleteCode.trim() ? { code: deleteCode.trim() } : {}) });
      clearKey(); clearAll(); await logout(); navigate('/login');
    } catch (err) {
      if (!(err instanceof PasskeyCancelled)) setDeleteError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Failed to delete account');
      setDeleteLoading(false);
    }
  };

  const handleSignOut = useSignOut();

  return (
    <SettingsTemplate title="">
      <HeaderRow>
        <Title>Settings</Title>
      </HeaderRow>

      <Sections>
      {/* Account — mockup 1: label-left groups that save as they change, kept in its own card */}
      <Section id="account" title="Account" subtitle="Changes save as you make them.">

        <SettingsGroup label="Profile">
          <SettingsGroupRow label="Username">{user?.username || ''}</SettingsGroupRow>
          {/* Display name edits in place and saves when the box is left (Enter too; Escape puts it back) */}
          <SettingsGroupRow label="Display name">
            <InPlaceInput
              value={editingDisplayName ? draftDisplayName : displayName}
              onFocus={() => { if (!editingDisplayName) { setEditingDisplayName(true); setDraftDisplayName(displayName); } }}
              onChange={e => { setEditingDisplayName(true); setDraftDisplayName(e.target.value); }}
              onBlur={() => {
                if (!editingDisplayName) return;
                if (draftDisplayName.trim() !== displayName) void handleSaveDisplayName();
                else { setEditingDisplayName(false); setDraftDisplayName(''); }
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') { setEditingDisplayName(false); setDraftDisplayName(''); requestAnimationFrame(() => (e.target as HTMLInputElement).blur()); }
              }}
              disabled={displayNameSaving}
              placeholder="Your first name or nickname"
              aria-label="Display name"
              maxLength={80}
            />
          </SettingsGroupRow>
        </SettingsGroup>

        {/* Which day "today" is for journal entries */}
        <SettingsGroup label="Date and time">
          <SettingsGroupRow label="Timezone">
            <Select value={timezone} onChange={e => handleTimezoneChange(e.target.value)} aria-label="Timezone">
              {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
            </Select>
            <RowNote>Sets which day counts as today for your entries.</RowNote>
          </SettingsGroupRow>
        </SettingsGroup>

        <SettingsGroup label="Sign-in and notices">
          {/* Email changes need the current password, so it stays a Change flow */}
          <SettingsGroupRow
            label="Email"
            action={!editingEmail && (
              <RowPill type="button" onClick={() => { setEditingEmail(true); setNewEmail(user?.email || ''); setEmailMessage(''); }}>Change</RowPill>
            )}
          >
            {/* A step smaller than the other values, so a long address fits beside Change */}
            <span style={{ fontSize: 14 }}>{user?.email || ''}</span>
            {!editingEmail && emailMessage && <RowNote $error={emailError}>{emailMessage}</RowNote>}
          </SettingsGroupRow>
          {editingEmail && (
            <SettingsGroupBody>
              <TextInput
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                placeholder="New email address"
                aria-label="New email"
                type="email"
                autoFocus
              />
              <ConfirmIdentity
                password={emailPassword}
                onPassword={setEmailPassword}
                showCode={totpEnabled}
                code={emailCode}
                onCode={setEmailCode}
              />
              {canPasskey && <RowNote style={{ marginTop: 0 }}>Changing your email needs your password. A passkey can’t confirm this one.</RowNote>}
              {emailMessage && <RowNote $error={emailError}>{emailMessage}</RowNote>}
              <FormActions>
                <RowPill type="button" onClick={() => { setEditingEmail(false); setNewEmail(''); setEmailPassword(''); setEmailCode(''); setEmailMessage(''); }}>
                  Cancel
                </RowPill>
                <RowPill type="button" $tone="accent" onClick={handleChangeEmail} disabled={emailLoading || !newEmail.trim() || !emailPassword || (totpEnabled && !emailCode.trim())}>
                  {emailLoading ? <Spinner size={14} /> : 'Save email'}
                </RowPill>
              </FormActions>
            </SettingsGroupBody>
          )}
          <BreachNoticeSetting />
        </SettingsGroup>

        {/* The dashboard's first-visit tour, and its Getting started checklist again */}
        <SettingsGroup label="Help">
          <SettingsGroupRow
            label="Welcome tour"
            action={<RowPill type="button" onClick={() => navigate('/dashboard', { state: { showTour: true } })}>Show again</RowPill>}
          >
            A quick look around Chronicles
          </SettingsGroupRow>
        </SettingsGroup>

        <SettingsGroup label="Privacy and terms">
          <SettingsLinkRow href="/health-privacy" newTab>Health Data Privacy Policy</SettingsLinkRow>
          <SettingsLinkRow href="/terms" newTab>Terms of Service</SettingsLinkRow>
        </SettingsGroup>

        <SettingsFoot>
          <span>Deleting your account removes your entries and settings for good. You'll be asked to confirm.</span>
          {!deletingAccount && (
            <RowPill type="button" $tone="danger" onClick={() => { setDeletingAccount(true); setDeletePassword(''); setDeleteCode(''); setDeleteError(''); }}>
              Delete account
            </RowPill>
          )}
        </SettingsFoot>
        {deletingAccount && (
          <SettingsGroupBody style={{ padding: '18px 4px 0' }}>
            <RowNote style={{ marginTop: 0, lineHeight: 1.55 }}>
              This permanently deletes your account, every entry, topic and setting, your share links and your calendar feed. It can't be undone.
              Images in your own R2 bucket and events already synced to Google Calendar are not touched. Remove those yourself if you want them gone.
            </RowNote>
            <ConfirmIdentity
              password={deletePassword}
              onPassword={setDeletePassword}
              showCode={totpEnabled}
              code={deleteCode}
              onCode={setDeleteCode}
              busy={deleteLoading}
              autoFocus
              onUsePasskey={canPasskey ? () => void handleDeleteAccount('passkey') : undefined}
            />
            {deleteError && <RowNote $error>{deleteError}</RowNote>}
            <FormActions>
              <RowPill type="button" onClick={() => setDeletingAccount(false)} disabled={deleteLoading}>Cancel</RowPill>
              <RowPill
                type="button"
                $tone="danger"
                onClick={() => void handleDeleteAccount()}
                disabled={deleteLoading || !deletePassword || (totpEnabled && !deleteCode.trim())}
              >
                {deleteLoading ? <Spinner size={14} /> : 'Delete forever'}
              </RowPill>
            </FormActions>
          </SettingsGroupBody>
        )}
      </Section>

      <Section id="security" title="Security" subtitle="How you sign in and get back in.">
        <SettingsGroup>
          {/* ── Passkeys ── */}
          <PasskeySettings email={user?.email ?? ''} totpEnabled={totpEnabled} onUsable={setCanPasskey} />

          {/* ── 2FA ── */}
          <SettingsActionRow
            title="Two-factor authentication"
            description={totpEnabled
              ? <StatusOk>On, using an authenticator app</StatusOk>
              : twoFAStep === 'idle' ? 'Off. Add a code from an authenticator app when you sign in.' : undefined}
            action={totpEnabled ? (
              !disabling2FA && (
                <RowPill type="button" onClick={() => { setDisabling2FA(true); setDisable2FAPassword(''); setDisable2FACode(''); setDisable2FAError(''); }}>
                  Turn off
                </RowPill>
              )
            ) : twoFAStep === 'idle' ? (
              <RowPill type="button" onClick={handleStart2FASetup} disabled={twoFALoading}>
                {twoFALoading ? <Spinner size={14} /> : 'Turn on'}
              </RowPill>
            ) : null}
          >
            {/* Turning it off: password and a current code */}
            {totpEnabled && disabling2FA && (
              <>
                {disable2FAError && <RowNote $error style={{ marginTop: 0 }}>{disable2FAError}</RowNote>}
                <ConfirmIdentity
                  password={disable2FAPassword}
                  onPassword={setDisable2FAPassword}
                  showCode
                  code={disable2FACode}
                  onCode={setDisable2FACode}
                  busy={twoFALoading}
                  autoFocus
                  onUsePasskey={canPasskey ? () => void handleDisable2FA('passkey') : undefined}
                />
                <FormActions>
                  <RowPill type="button" onClick={() => setDisabling2FA(false)}>Cancel</RowPill>
                  <RowPill type="button" $tone="danger" onClick={() => void handleDisable2FA()} disabled={twoFALoading || !disable2FAPassword || !disable2FACode.trim()}>
                    {twoFALoading ? <Spinner size={14} /> : 'Turn off 2FA'}
                  </RowPill>
                </FormActions>
              </>
            )}

            {/* Step 1: QR code */}
            {!totpEnabled && twoFAStep === 'qr' && (
              <>
                <RowNote style={{ marginTop: 0 }}>Scan this QR code with your authenticator app, then press Next.</RowNote>
                {twoFAQrUrl && (
                  <img src={twoFAQrUrl} alt="2FA QR code" style={{ width: 180, height: 180, borderRadius: 8, border: '1px solid var(--border-card)', background: '#fff' }} />
                )}
                <RowNote style={{ marginTop: 0 }}>
                  Manual entry code: <code style={{ userSelect: 'all', letterSpacing: 2, color: 'var(--text-primary)' }}>{twoFASecret}</code>
                </RowNote>
                <FormActions>
                  <RowPill type="button" onClick={() => { setTwoFAStep('idle'); setTwoFASecret(''); setTwoFAQrUrl(''); }}>Cancel</RowPill>
                  <RowPill type="button" $tone="accent" onClick={() => setTwoFAStep('confirm')}>Next</RowPill>
                </FormActions>
              </>
            )}

            {/* Step 2: confirm the code */}
            {!totpEnabled && twoFAStep === 'confirm' && (
              <>
                <RowNote style={{ marginTop: 0 }}>Enter the 6-digit code from your authenticator app, then confirm it’s you to finish.</RowNote>
                {twoFAError && <RowNote $error style={{ marginTop: 0 }}>{twoFAError}</RowNote>}
                <TextInput
                  autoFocus
                  value={twoFACode}
                  onChange={e => setTwoFACode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  aria-label="6-digit code"
                  inputMode="numeric"
                  maxLength={6}
                  style={{ fontSize: 20, letterSpacing: 6, textAlign: 'center', width: 180 }}
                />
                <ConfirmIdentity
                  password={twoFAPassword}
                  onPassword={setTwoFAPassword}
                  busy={twoFALoading || twoFACode.length !== 6}
                  onEnter={() => { if (twoFACode.length === 6 && twoFAPassword) void handleConfirm2FA(); }}
                  onUsePasskey={canPasskey ? () => void handleConfirm2FA('passkey') : undefined}
                />
                <FormActions>
                  <RowPill type="button" onClick={() => { setTwoFAStep('qr'); setTwoFACode(''); setTwoFAPassword(''); setTwoFAError(''); }}>Back</RowPill>
                  <RowPill type="button" $tone="accent" onClick={() => void handleConfirm2FA()} disabled={twoFALoading || twoFACode.length !== 6 || !twoFAPassword}>
                    {twoFALoading ? <Spinner size={14} /> : 'Confirm'}
                  </RowPill>
                </FormActions>
              </>
            )}

            {/* Step 3: the backup codes, shown once */}
            {twoFAStep === 'codes' && (
              <>
                <RowNote style={{ marginTop: 0 }}>
                  <strong style={{ color: 'var(--text-primary)' }}>Save these backup codes.</strong> They're shown only once. Each works once if you lose your authenticator app.
                </RowNote>
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px',
                  fontFamily: 'monospace', fontSize: 14, padding: '12px 16px', color: 'var(--text-primary)',
                  background: 'var(--bg-app)', border: '1px solid var(--border-card)', borderRadius: 8,
                }}>
                  {twoFABackupCodes.map(code => (
                    <span key={code} style={{ userSelect: 'all' }}>{code}</span>
                  ))}
                </div>
                <FormActions>
                  <RowPill type="button" onClick={() => { navigator.clipboard.writeText(twoFABackupCodes.join('\n')).catch(() => {}); }}>Copy all</RowPill>
                  <RowPill type="button" $tone="accent" onClick={() => { setTwoFAStep('idle'); setTwoFABackupCodes([]); }}>Done</RowPill>
                </FormActions>
              </>
            )}
          </SettingsActionRow>

          {/* ── Password ── */}
          <SettingsActionRow
            title="Password"
            action={!showPassword && <RowPill type="button" onClick={() => setShowPassword(true)}>Change</RowPill>}
          >
            {showPassword && (
              <>
                {pwMessage && <RowNote $error={pwError} style={{ marginTop: 0 }}>{pwMessage}</RowNote>}
                <div>
                  <PasswordInput value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="New password, at least 12 characters" aria-label="New password" autoComplete="new-password" />
                  <PasswordStrengthMeter password={newPw} email={user?.email} username={user?.username} />
                </div>
                <PasswordInput value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Confirm new password" aria-label="Confirm new password" autoComplete="new-password" />
                <ConfirmIdentity
                  password={currentPw}
                  onPassword={setCurrentPw}
                  showCode={totpEnabled}
                  code={pwCode}
                  onCode={setPwCode}
                  busy={pwLoading}
                  onUsePasskey={canPasskey ? () => void handleChangePassword('passkey') : undefined}
                />
                <FormActions>
                  <RowPill type="button" onClick={() => { setShowPassword(false); setCurrentPw(''); setNewPw(''); setConfirmPw(''); setPwCode(''); setPwMessage(''); }}>Cancel</RowPill>
                  <RowPill type="button" $tone="accent" onClick={() => void handleChangePassword()} disabled={pwLoading || !currentPw || (totpEnabled && !pwCode.trim())}>
                    {pwLoading ? <Spinner size={14} /> : 'Update password'}
                  </RowPill>
                </FormActions>
              </>
            )}
            {!showPassword && pwMessage && <RowNote $error={pwError} style={{ marginTop: 0 }}>{pwMessage}</RowNote>}
          </SettingsActionRow>

          {/* ── Recovery key ── */}
          <SettingsActionRow
            title="Recovery key"
            description="For emergency access if you lose your password."
            action={!generatedRecoveryKey && !showRecoveryKey && (
              <RowPill type="button" onClick={() => { setShowRecoveryKey(true); setRecoveryKeyError(''); setRecoveryKeyPw(''); setRecoveryCode(''); }}>
                Generate new
              </RowPill>
            )}
          >
            {showRecoveryKey && !generatedRecoveryKey && (
              <>
                <RowNote style={{ marginTop: 0 }}>Confirm it’s you to make a new recovery key. Your old one stops working.</RowNote>
                {recoveryKeyError && <RowNote $error style={{ marginTop: 0 }}>{recoveryKeyError}</RowNote>}
                <ConfirmIdentity
                  password={recoveryKeyPw}
                  onPassword={setRecoveryKeyPw}
                  showCode={totpEnabled}
                  code={recoveryCode}
                  onCode={setRecoveryCode}
                  busy={recoveryKeyLoading}
                  autoFocus
                  onUsePasskey={canPasskey ? () => void handleGenerateRecoveryKey('passkey') : undefined}
                />
                <FormActions>
                  <RowPill type="button" onClick={() => setShowRecoveryKey(false)}>Cancel</RowPill>
                  <RowPill type="button" $tone="accent" onClick={() => void handleGenerateRecoveryKey()} disabled={recoveryKeyLoading || !recoveryKeyPw || (totpEnabled && !recoveryCode.trim())}>
                    {recoveryKeyLoading ? <Spinner size={14} /> : 'Generate recovery key'}
                  </RowPill>
                </FormActions>
              </>
            )}
            {generatedRecoveryKey && (
              <RecoveryKeyDisplay
                recoveryKey={generatedRecoveryKey}
                onConfirm={() => { setGeneratedRecoveryKey(''); setShowRecoveryKey(false); }}
              />
            )}
          </SettingsActionRow>

          {/* ── Active sessions ── */}
          <SettingsActionRow
            title="Active sessions"
            description="Devices signed in to your account."
            action={<RowPill type="button" onClick={handleLoadSessions}>{showSessions ? 'Hide' : 'View'}</RowPill>}
          >
            {showSessions && (
              <SessionsList>
                {sessionList.map(s => (
                  <SessionItem key={s.id}>
                    <SessionRow
                      deviceInfo={s.userAgent ? suggestedPasskeyName(s.userAgent) : null}
                      signedInWith={signInMethodLabel(s.deviceInfo)}
                      ipAddress={s.ipAddress}
                      lastActiveAt={s.lastActiveAt}
                      isCurrent={s.isCurrent}
                      onRevoke={() => handleRevokeSession(s.id)}
                    />
                  </SessionItem>
                ))}
              </SessionsList>
            )}
          </SettingsActionRow>

          {/* ── Browsers that skip the 2FA code ── */}
          {totpEnabled && <TrustedBrowsersSettings />}
        </SettingsGroup>
      </Section>


      <Section id="theme" title="Theme Preferences">
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
        <ColorSection>
          <ColorSectionTitle>Background</ColorSectionTitle>
          <ColorSectionDesc>
            A photo across the top of every page. Pick another, or None for a plain page.
            {imagesReady && <> You can also use a photo of your own. Upload one, or take one from your library. It is encrypted and kept in your image storage like an entry’s photos.</>}
            {wallpaperById(wallpaper)?.by && <> Showing a photo by {wallpaperById(wallpaper)!.by} on Unsplash.</>}
          </ColorSectionDesc>
          <WallpaperPicker value={wallpaperById(wallpaper) || wallpaper === CUSTOM_WALLPAPER ? wallpaper : null} onChange={chooseWallpaper}
            extra={imagesReady ? (
              <CustomPhotoTile image={customWallpaper} chosen={wallpaper === CUSTOM_WALLPAPER && !!customWallpaper}
                onPick={() => chooseWallpaper(CUSTOM_WALLPAPER)} onSet={image => { void setOwnWallpaper(image); }} onRemove={() => { void setOwnWallpaper(null); }} />
            ) : undefined} />
        </ColorSection>
      </SettingsCard>
      </Section>

      <Section id="features" title="Features">
      <SectionDescription>Enable optional topics for specialized tracking</SectionDescription>
      <SettingsCard>
        {FEATURES.map(feat => (
          <Fragment key={feat.key}>
            <SettingsRow
              title={feat.title}
              description={feat.description}
              action={<Toggle aria-label={feat.title} checked={features[feat.key] ?? false} onChange={v => handleFeatureToggle(feat.key, v)} activeColor={themeMode === 'dark' ? '#2D2C2A' : '#ecebe7'} />}
            />
            {feat.key === 'financeEnabled' && (
              <FinanceDisclaimer role="note">
                Finance is encrypted in your browser and the server never sees it, but Chronicles is not a banking app
                and no system is perfectly secure. You're responsible for your financial data — what you store, keeping
                your own records and backups, and securing your account and devices — and you accept the risk of
                keeping it here.
              </FinanceDisclaimer>
            )}
            {/* The public shelf belongs with Media — shown even with Media off, so it can still be turned off */}
            {feat.key === 'entertainmentEnabled' && <PublicShelfSettingsRow />}
            {feat.key === 'allergiesEnabled' && (
              <SettingsRow
                title="Cycle Tracking"
                description="Add period and flow tracking to the daily wellness check-in"
                action={
                  <Toggle
                    aria-label="Cycle tracking"
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

      <Section id="entry-images" title="Entry Images" subtitle="Up to 7 encrypted images per entry, kept in your own Cloudflare R2 bucket.">
        <ImageStorageSettings themeMode={themeMode} />
      </Section>

      <Section id="ai" title="In-App AI" subtitle="Calorie estimates for food and workouts, plus chat, using your own AI account.">
        <AiSettings themeMode={themeMode} />
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
        <SettingsRow
          title="Seed Wellness"
          description="Add only wellness check-ins for the last 30 days (a few skipped): water, sleep, mood, a period and the Your day answers. Days that already have a check-in are left alone"
          action={
            <ActionButton onClick={() => void handleSeedWellness()} disabled={seedingWellness}>
              {seedingWellness ? <Spinner size={14} /> : 'Seed Wellness'}
            </ActionButton>
          }
        />
        {seedWellnessResult && <div style={{ padding: '0 20px 12px', fontSize: 13, color: seedWellnessResult.startsWith('Failed') ? '#9B4444' : '#5A8A6A' }}>{seedWellnessResult}</div>}
        <SettingsRow
          title="Seed Today"
          description="Fill in only what today and this week are missing, for an account that already has data: today's meals, this week's menu, the doses due so far, the exercise schedule ticked over the last week, this week's habit check-ins and today's check-in. Run again, it adds nothing twice"
          action={
            <ActionButton onClick={() => void handleSeedToday()} disabled={seedingToday}>
              {seedingToday ? <Spinner size={14} /> : 'Seed Today'}
            </ActionButton>
          }
        />
        {seedTodayResult && <div style={{ padding: '0 20px 12px', fontSize: 13, color: seedTodayResult.startsWith('Failed') ? '#9B4444' : '#5A8A6A' }}>{seedTodayResult}</div>}
        <SettingsRow
          title="Seed Today's Meals"
          description="Add only today's meals (with their nutrients, none later than now), when today has none logged yet. Nothing else is touched"
          action={
            <ActionButton onClick={() => void handleSeedMeals()} disabled={seedingMeals}>
              {seedingMeals ? <Spinner size={14} /> : "Seed Today's Meals"}
            </ActionButton>
          }
        />
        {seedMealsResult && <div style={{ padding: '0 20px 12px', fontSize: 13, color: seedMealsResult.startsWith('Failed') ? '#9B4444' : '#5A8A6A' }}>{seedMealsResult}</div>}
        <SettingsRow
          title="Seed Exercise Schedule"
          description="Add only an exercise schedule — morning yoga, an evening walk, leg strength and an evening stretch, most with several exercises — a week of ticked sessions, and a training plan if there isn’t one. Adds to existing data"
          action={
            <ActionButton onClick={() => void handleSeedSchedule()} disabled={seedingSchedule}>
              {seedingSchedule ? <Spinner size={14} /> : 'Seed Schedule'}
            </ActionButton>
          }
        />
        {seedScheduleResult && <div style={{ padding: '0 20px 12px', fontSize: 13, color: seedScheduleResult.startsWith('Failed') ? '#9B4444' : '#5A8A6A' }}>{seedScheduleResult}</div>}
        <SettingsRow
          title="Seed Planning"
          description="Goals with categories and start dates for the Roadmap, milestones, tasks spread over this week's Planner, todos, ideas and habits with two months of check-ins. Earlier seeded planning entries are replaced; your own are left alone"
          action={
            <ActionButton onClick={() => void handleSeedPlanning()} disabled={seedingPlanning}>
              {seedingPlanning ? <Spinner size={14} /> : 'Seed Planning'}
            </ActionButton>
          }
        />
        {seedPlanningResult && <div style={{ padding: '0 20px 12px', fontSize: 13, color: seedPlanningResult.startsWith('Failed') ? '#9B4444' : '#5A8A6A' }}>{seedPlanningResult}</div>}
        <SettingsRow
          title="Seed Media"
          description="Add 27 books, films, shows and albums to the Media Journal — finished, under way, saved, paused and abandoned, rated, some bookmarked for the public shelf — with covers looked up in the usual catalogues. Titles already on your shelves are skipped"
          action={
            <ActionButton onClick={() => void handleSeedMedia()} disabled={seedingMedia}>
              {seedingMedia ? <Spinner size={14} /> : 'Seed Media'}
            </ActionButton>
          }
        />
        {seedMediaResult && <div style={{ padding: '0 20px 12px', fontSize: 13, color: seedMediaResult.startsWith('Failed') ? '#9B4444' : '#5A8A6A' }}>{seedMediaResult}</div>}
        {features.financeEnabled && (
          <>
            <SettingsRow
              title="Seed Finance Data"
              description="Add sample budget categories, bills and subscriptions with payments, spending, savings funds and goals — adds to existing data, does not delete anything"
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
          description="Download everything in Finance, decrypted, as one ZIP: a spreadsheet (CSV) each for budget categories, bills, bill payments, spending, savings funds and entries, and goals, one sheet of every transaction, and a complete JSON backup. The file is not encrypted — store it safely."
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
        <TrainingImport />
        <MediaMigration />
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

      <Section id="report-a-bug" title="Feedback/Report a Bug">
        <GuideBody>
          Have an idea, a suggestion, or something that’s broken or confusing? Tell us here. You can send feedback as well as report a bug. Chronicles has no crash reporting, so this is how we find out.
          <div style={{ marginTop: 16 }}><BugReportForm /></div>
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
