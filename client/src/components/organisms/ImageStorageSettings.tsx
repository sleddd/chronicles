import { useState, useEffect, useRef } from 'react';
import {
  SettingsGroup, SettingsGroupRow, SettingsActionRow, SettingsDisclosureRow, SettingsNotice,
  SettingsStatusRow, StatusOk, QuietLink, RowPill,
} from '../molecules/SettingsGroup.js';
import { Toggle } from '../atoms/Toggle.js';
import { TextInput } from '../atoms/TextInput.js';
import { PasswordInput } from '../atoms/PasswordInput.js';
import { Spinner } from '../atoms/Spinner.js';
import { useUIStore } from '../../stores/uiStore.js';
import { usePrivateSettings } from '../../services/privateSettings.js';
import { useEncryption } from '../../contexts/EncryptionContext.js';
import { settings as settingsApi } from '../../services/api.js';
import { showFlash } from '../../services/flashNotice.js';
import { trackGuardedSave, noteSettingRemoved } from '../../services/settingCipher.js';
import { imageStorageConfigSchema } from '@shared/validation/schemas.js';
import {
  testR2Connection,
  encryptImageStorageConfig,
  setImageStorageConfig,
  setImageStorageDraft,
  getImageStorageConfigValue,
  subscribeImageStorage,
  isCompleteConfig,
  type R2Config,
} from '../../services/imageStorage.js';

/**
 * Entry Images settings — bring-your-own Cloudflare R2 bucket, fully
 * zero-knowledge. Credentials autosave as you type (like every other setting):
 * once all four fields are valid they are encrypted with the master key and
 * stored as an ordinary setting the server cannot read. "Test connection" is
 * an optional check that also validates the bucket CORS policy.
 */
export function ImageStorageSettings(_props: { themeMode?: 'light' | 'dark' }) {
  const { encryptBytes } = useEncryption();
  const { savePrivateSetting } = usePrivateSettings();
  const imagesEnabled = useUIStore(s => s.imagesEnabled);
  const setImagesEnabled = useUIStore(s => s.setImagesEnabled);
  const imagesConfigured = useUIStore(s => s.imagesConfigured);
  const setImagesConfigured = useUIStore(s => s.setImagesConfigured);

  const existing = getImageStorageConfigValue();
  const [accountId, setAccountId] = useState(existing?.accountId ?? '');
  const [bucket, setBucket] = useState(existing?.bucket ?? '');
  const [accessKeyId, setAccessKeyId] = useState(existing?.accessKeyId ?? '');
  const [secretAccessKey, setSecretAccessKey] = useState(existing?.secretAccessKey ?? '');

  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState('');
  const [hint, setHint] = useState('');
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [disconnectArmed, setDisconnectArmed] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchedRef = useRef(false);

  // Prefill once the config finishes decrypting — init/unlock decrypt it
  // asynchronously, often after this form has already mounted
  useEffect(() => {
    const fill = () => {
      if (touchedRef.current) return;
      const cfg = getImageStorageConfigValue();
      if (cfg) {
        setAccountId(cfg.accountId);
        setBucket(cfg.bucket);
        setAccessKeyId(cfg.accessKeyId);
        setSecretAccessKey(cfg.secretAccessKey);
      }
    };
    fill();
    return subscribeImageStorage(fill);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const handleToggle = async (enabled: boolean) => {
    setImagesEnabled(enabled);
    await savePrivateSetting('imagesEnabled', enabled).catch(() => {});
  };

  /** Persist whatever is entered — partial drafts included. Nothing typed is ever lost. */
  const persist = async (raw: R2Config) => {
    const cfg: R2Config = {
      accountId: raw.accountId.trim().toLowerCase(),
      bucket: raw.bucket.trim(),
      accessKeyId: raw.accessKeyId.trim(),
      secretAccessKey: raw.secretAccessKey.trim(),
    };

    // All fields cleared → forget the stored credentials
    if (!cfg.accountId && !cfg.bucket && !cfg.accessKeyId && !cfg.secretAccessKey) {
      noteSettingRemoved('imageStorageConfig');
      await settingsApi.remove('imageStorageConfig').catch(() => showFlash('Couldn’t remove your R2 credentials from the server. Try again.'));
      setImageStorageConfig(null, null);
      setImagesConfigured(false);
      setSaveState('idle');
      setHint('');
      return;
    }

    const complete = isCompleteConfig(cfg);
    const parsed = imageStorageConfigSchema.safeParse({
      r2AccountId: cfg.accountId,
      r2Bucket: cfg.bucket,
      r2AccessKeyId: cfg.accessKeyId,
      r2SecretAccessKey: cfg.secretAccessKey,
    });

    setSaveState('saving');
    setSaveError('');
    try {
      const encrypted = await encryptImageStorageConfig(cfg, encryptBytes);
      await trackGuardedSave('imageStorageConfig', () => settingsApi.upsert('imageStorageConfig', encrypted));
      setImageStorageConfig(cfg, encrypted);
      // Saved: the draft has nothing the stored config lacks. Left in place, a
      // lock blanks its secret key, the form then fills from that draft, and
      // the next edit to any field saves the credentials without their secret
      setImageStorageDraft(null);
      setImagesConfigured(complete && parsed.success);
      setSaveState('saved');
      if (!complete) setHint('Fill in the remaining fields to finish setup.');
      else if (!parsed.success) setHint(parsed.error.issues[0]?.message || 'Check the highlighted values');
      else setHint('');
    } catch (err) {
      setSaveState('error');
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  /** Autosave like every other setting — the draft is kept in memory instantly
   *  (survives the tab-away auto-lock) and persisted encrypted on a short debounce. */
  const handleFieldChange = (field: keyof R2Config, value: string) => {
    touchedRef.current = true;
    const next: R2Config = { accountId, bucket, accessKeyId, secretAccessKey, [field]: value };
    if (field === 'accountId') setAccountId(value);
    else if (field === 'bucket') setBucket(value);
    else if (field === 'accessKeyId') setAccessKeyId(value);
    else setSecretAccessKey(value);
    // Synchronous — even if the page locks before the debounce fires, the
    // typed value is still there after unlock
    setImageStorageDraft(next);

    setTestState('idle');
    setTestMessage('');
    setSaveState('idle');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { void persist(next); }, 500);
  };

  const handleTest = async () => {
    const cfg: R2Config = {
      accountId: accountId.trim().toLowerCase(),
      bucket: bucket.trim(),
      accessKeyId: accessKeyId.trim(),
      secretAccessKey: secretAccessKey.trim(),
    };
    setTestState('testing');
    setTestMessage('');
    try {
      await testR2Connection(cfg);
      setTestState('ok');
      setTestMessage('Connected. The credentials and the CORS policy both work.');
    } catch (err) {
      setTestState('fail');
      setTestMessage(err instanceof Error ? err.message : 'Connection test failed');
    }
  };

  const handleDisconnect = async () => {
    if (!disconnectArmed) { setDisconnectArmed(true); return; }
    setDisconnectArmed(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    noteSettingRemoved('imageStorageConfig');
    try {
      await settingsApi.remove('imageStorageConfig');
    } catch {
      // Still on the server: the form (and this button) stay as they are, to try again
      showFlash('Couldn’t remove your R2 credentials from the server. Try again.');
      return;
    }
    setAccountId(''); setBucket(''); setAccessKeyId(''); setSecretAccessKey('');
    setTestState('idle'); setTestMessage(''); setSaveState('idle'); setHint('');
    setImageStorageDraft(null);
    setImageStorageConfig(null, null);
    setImagesConfigured(false);
  };

  const fieldsComplete = !!(accountId.trim() && bucket.trim() && accessKeyId.trim() && secretAccessKey.trim());

  const guideNote = { fontSize: 14, lineHeight: 1.6, color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)' } as const;

  const statusNode = (() => {
    if (saveState === 'saving') return <><Spinner size={11} /> Saving…</>;
    if (saveState === 'error') return <span style={{ color: 'var(--color-danger)' }}>{saveError}</span>;
    if (hint) return hint;
    if (saveState === 'saved' || imagesConfigured) return <StatusOk>Saved</StatusOk>;
    return 'Saves as you type, encrypted with your master key.';
  })();

  return (
    <>
      <SettingsGroup>
        <SettingsActionRow
          title="Attach images to entries"
          action={<Toggle checked={imagesEnabled} onChange={handleToggle} aria-label="Attach images to entries" />}
        />
      </SettingsGroup>

      {imagesEnabled && (
        <SettingsGroup label="Your R2 bucket">
          <SettingsNotice>Encrypted in your browser and sent straight to your bucket. Nothing here touches the Chronicles server.</SettingsNotice>
          <SettingsGroupRow label="Account ID">
            <TextInput
              value={accountId}
              onChange={e => handleFieldChange('accountId', e.target.value)}
              placeholder="32-character ID from the R2 dashboard"
              aria-label="Account ID"
              autoComplete="off"
            />
          </SettingsGroupRow>
          <SettingsGroupRow label="Bucket name">
            <TextInput
              value={bucket}
              onChange={e => handleFieldChange('bucket', e.target.value)}
              placeholder="chronicles-images"
              aria-label="Bucket name"
              autoComplete="off"
            />
          </SettingsGroupRow>
          <SettingsGroupRow label="Access key ID">
            <TextInput
              value={accessKeyId}
              onChange={e => handleFieldChange('accessKeyId', e.target.value)}
              placeholder="From an R2 API token"
              aria-label="Access key ID"
              autoComplete="off"
            />
          </SettingsGroupRow>
          <SettingsGroupRow label="Secret key">
            <PasswordInput
              value={secretAccessKey}
              onChange={e => handleFieldChange('secretAccessKey', e.target.value)}
              placeholder="Shown once when the token is created"
              aria-label="Secret access key"
              autoComplete="off"
            />
          </SettingsGroupRow>
          <SettingsActionRow
            title="Connection"
            description={testMessage || (fieldsComplete ? 'Not tested yet. The test uploads and removes one tiny file.' : 'Fill in all four fields, then test it.')}
            descriptionError={testState === 'fail'}
            action={
              <RowPill type="button" onClick={handleTest} disabled={!fieldsComplete || testState === 'testing'}>
                {testState === 'testing' ? <Spinner size={14} /> : 'Test'}
              </RowPill>
            }
          />
          <SettingsDisclosureRow
            title="Setup guide"
            description="Creating the bucket, API token and CORS policy"
            open={showHelp}
            onToggle={() => setShowHelp(v => !v)}
          >
            <div style={guideNote}>
              <strong>1. Create a bucket.</strong> In the Cloudflare dashboard, open R2 and create a
              bucket (any name). The free tier has no egress fees.
              <br />
              <strong>2. Create an API token.</strong> R2 → Manage API Tokens → Create. Choose
              <em> Object Read &amp; Write</em> and scope it to just this bucket. Copy the Access Key ID
              and Secret Access Key (the secret is shown once). Your Account ID is on the R2 overview page.
              <br />
              <strong>3. Add the CORS policy (required).</strong> On the bucket → Settings → CORS policy.
              Without it, the browser cannot talk to the bucket and images will not upload.
              <pre style={{
                margin: '8px 0', padding: 10, fontSize: 12, overflowX: 'auto',
                background: 'var(--bg-app)', border: '1px solid var(--border-card)', borderRadius: 8, color: 'var(--text-secondary)',
              }}>
{JSON.stringify([{
  AllowedOrigins: [window.location.origin, 'http://localhost:5173'],
  AllowedMethods: ['GET', 'PUT', 'DELETE'],
  AllowedHeaders: ['content-type'],
}], null, 2)}
              </pre>
              Images are encrypted before upload, so the bucket only ever holds ciphertext. Disconnecting
              only forgets the credentials. Nothing is deleted from your bucket, and reconnecting the same
              bucket brings existing images back. You can purge the bucket at any time.
            </div>
          </SettingsDisclosureRow>
          <SettingsStatusRow
            status={statusNode}
            action={imagesConfigured ? (
              <QuietLink type="button" $danger={disconnectArmed} onClick={handleDisconnect} onBlur={() => setDisconnectArmed(false)}>
                {disconnectArmed ? 'Disconnect for good?' : 'Disconnect'}
              </QuietLink>
            ) : undefined}
          />
        </SettingsGroup>
      )}
    </>
  );
}
