import { useState, useEffect, useRef } from 'react';
import { SettingsCard, SettingsRow } from '../molecules/SettingsCard.js';
import { ActionButton } from '../atoms/SettingsAtoms.js';
import { Toggle } from '../atoms/Toggle.js';
import { TextInput } from '../atoms/TextInput.js';
import { PasswordInput } from '../atoms/PasswordInput.js';
import { Spinner } from '../atoms/Spinner.js';
import { useUIStore } from '../../stores/uiStore.js';
import { usePrivateSettings } from '../../services/privateSettings.js';
import { useEncryption } from '../../contexts/EncryptionContext.js';
import { settings as settingsApi } from '../../services/api.js';
import { showFlash } from '../../services/flashNotice.js';
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
export function ImageStorageSettings({ themeMode }: { themeMode: 'light' | 'dark' }) {
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

  const toggleColor = themeMode === 'dark' ? '#2D2C2A' : '#ecebe7';

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
      await settingsApi.upsert('imageStorageConfig', encrypted);
      setImageStorageConfig(cfg, encrypted);
      setImagesConfigured(complete && parsed.success);
      setSaveState('saved');
      if (!complete) setHint('Fill in the remaining fields to finish setup');
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
      setTestMessage('Connection verified — credentials and CORS policy both work');
    } catch (err) {
      setTestState('fail');
      setTestMessage(err instanceof Error ? err.message : 'Connection test failed');
    }
  };

  const handleDisconnect = async () => {
    if (!disconnectArmed) { setDisconnectArmed(true); return; }
    setDisconnectArmed(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setAccountId(''); setBucket(''); setAccessKeyId(''); setSecretAccessKey('');
    setTestState('idle'); setTestMessage(''); setSaveState('idle'); setHint('');
    setImageStorageDraft(null);
    await settingsApi.remove('imageStorageConfig').catch(() => showFlash('Couldn’t remove your R2 credentials from the server. Try again.'));
    setImageStorageConfig(null, null);
    setImagesConfigured(false);
  };

  const fieldsComplete = !!(accountId.trim() && bucket.trim() && accessKeyId.trim() && secretAccessKey.trim());

  const noteStyle = { fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 } as const;
  const errStyle = { fontSize: 13, marginTop: 8, color: 'var(--color-danger, #c0392b)' } as const;
  const okStyle = { fontSize: 13, marginTop: 8, color: 'var(--text-secondary)' } as const;
  const inputRow = { display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 } as const;
  const labelStyle = {
    fontFamily: 'var(--font-label)', fontSize: 11, fontWeight: 700,
    letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-tertiary)',
  } as const;

  const saveStatusNode = (() => {
    if (saveState === 'saving') return <span style={noteStyle}><Spinner size={11} /> Saving…</span>;
    if (saveState === 'saved') return (
      <span style={noteStyle}>
        {hint ? `Saved — ${hint.charAt(0).toLowerCase()}${hint.slice(1)}` : 'Saved — encrypted with your master key'}
      </span>
    );
    if (saveState === 'error') return <span style={errStyle}>{saveError}</span>;
    if (hint) return <span style={noteStyle}>{hint}</span>;
    return null;
  })();

  return (
    <SettingsCard>
      <SettingsRow
        title="Entry images"
        description="Attach up to 7 encrypted images per entry, stored in your own Cloudflare R2 bucket"
        action={<Toggle checked={imagesEnabled} onChange={handleToggle} activeColor={toggleColor} />}
      />

      {imagesEnabled && (
        <>
          <SettingsRow
            title="Your R2 bucket"
            description="Credentials and images never touch the Chronicles server — everything is encrypted in your browser and goes straight to your bucket"
            action={imagesConfigured ? (
              <ActionButton onClick={handleDisconnect} onBlur={() => setDisconnectArmed(false)}>
                {disconnectArmed ? 'Confirm disconnect' : 'Disconnect'}
              </ActionButton>
            ) : undefined}
          >
            <div style={inputRow}>
              <span style={labelStyle}>Account ID</span>
              <TextInput
                value={accountId}
                onChange={e => handleFieldChange('accountId', e.target.value)}
                placeholder="32-character hex ID from the R2 dashboard"
                autoComplete="off"
              />
            </div>
            <div style={inputRow}>
              <span style={labelStyle}>Bucket name</span>
              <TextInput
                value={bucket}
                onChange={e => handleFieldChange('bucket', e.target.value)}
                placeholder="e.g. chronicles-images"
                autoComplete="off"
              />
            </div>
            <div style={inputRow}>
              <span style={labelStyle}>Access key ID</span>
              <TextInput
                value={accessKeyId}
                onChange={e => handleFieldChange('accessKeyId', e.target.value)}
                placeholder="From an R2 API token"
                autoComplete="off"
              />
            </div>
            <div style={inputRow}>
              <span style={labelStyle}>Secret access key</span>
              <PasswordInput
                value={secretAccessKey}
                onChange={e => handleFieldChange('secretAccessKey', e.target.value)}
                placeholder="Shown once when the token is created"
                autoComplete="off"
              />
            </div>
            {saveStatusNode}
          </SettingsRow>

          <SettingsRow
            title="Test connection"
            description="Optional check — uploads and deletes a tiny probe object to verify the credentials and the bucket CORS policy"
            action={
              <ActionButton onClick={handleTest} disabled={!fieldsComplete || testState === 'testing'}>
                {testState === 'testing' ? <Spinner size={14} /> : 'Test connection'}
              </ActionButton>
            }
          >
            {testMessage && (
              <div style={testState === 'fail' ? errStyle : okStyle}>{testMessage}</div>
            )}
          </SettingsRow>

          <SettingsRow
            title="Setup guide"
            description="How to create the bucket, API token, and the required CORS policy"
            action={
              <ActionButton onClick={() => setShowHelp(v => !v)}>
                {showHelp ? 'Hide' : 'Show'}
              </ActionButton>
            }
          >
            {showHelp && (
              <div style={{ ...noteStyle, marginTop: 10, lineHeight: 1.6 }}>
                <strong>1. Create a bucket</strong> — In the Cloudflare dashboard, open R2 and create a
                bucket (any name). The free tier has no egress fees.
                <br />
                <strong>2. Create an API token</strong> — R2 → Manage API Tokens → Create. Choose
                <em> Object Read &amp; Write</em> and scope it to just this bucket. Copy the Access Key ID
                and Secret Access Key (the secret is shown once). Your Account ID is on the R2 overview page.
                <br />
                <strong>3. Add the CORS policy (required)</strong> — On the bucket → Settings → CORS policy.
                Without it, the browser cannot talk to the bucket and images will not upload:
                <pre style={{
                  marginTop: 6, padding: 10, fontSize: 11, overflowX: 'auto',
                  background: 'transparent', border: '1px solid var(--border-card)', borderRadius: 10, color: 'var(--text-secondary)',
                }}>
{JSON.stringify([{
  AllowedOrigins: [window.location.origin, 'http://localhost:5173'],
  AllowedMethods: ['GET', 'PUT', 'DELETE'],
  AllowedHeaders: ['content-type'],
}], null, 2)}
                </pre>
                Images are encrypted before upload, so the bucket only ever holds ciphertext. Disconnecting
                only forgets the credentials — nothing is deleted from your bucket, and reconnecting the same
                bucket brings existing images back. You can purge the bucket at any time.
              </div>
            )}
          </SettingsRow>
        </>
      )}
    </SettingsCard>
  );
}
