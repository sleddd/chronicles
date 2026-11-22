import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { FormField } from '../molecules/FormField.js';
import { TextInput } from '../atoms/TextInput.js';
import { PasswordInput } from '../atoms/PasswordInput.js';
import { PillButton } from '../atoms/PillButton.js';
import { Spinner } from '../atoms/Spinner.js';
import { useEncryption } from '../../contexts/EncryptionContext.js';
import { settings as settingsApi } from '../../services/api.js';
import { isSealed, openSetting, trackGuardedSave } from '../../services/settingCipher.js';
import { testR2Connection, encryptImageStorageConfig, type R2Config } from '../../services/imageStorage.js';
import { imageStorageConfigSchema } from '@shared/validation/schemas.js';

/*
 * The photo bucket's settings, from the paused re-encryption screen. While the
 * journal is being re-encrypted the app is shut and Settings can't be reached,
 * so a bucket key that was rotated or revoked part way would otherwise leave
 * no way on. The new settings are tested, sealed with the new key and saved
 * like any other save of them. The job reads them afresh when it is tried again.
 */

const KEY = 'imageStorageConfig';

export function RekeyBucketForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const { encryptBytes, decryptBytes } = useEncryption();
  const [cfg, setCfg] = useState<R2Config>({ accountId: '', bucket: '', accessKeyId: '', secretAccessKey: '' });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  // What is saved now fills in the account and bucket (never the secret key).
  // Opening it also tells this browser its revision, so the save below is
  // newer than it for every other browser too. One still under the old key
  // doesn't open here, and the form just starts blank
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const row = (await settingsApi.getAll()).find(r => r.key === KEY);
        if (!row || !isSealed(row.value)) return;
        const saved = await openSetting(KEY, row.value, decryptBytes) as Partial<R2Config> | null;
        if (!live || !saved) return;
        setCfg(c => ({
          ...c,
          accountId: c.accountId || (typeof saved.accountId === 'string' ? saved.accountId : ''),
          bucket: c.bucket || (typeof saved.bucket === 'string' ? saved.bucket : ''),
          accessKeyId: c.accessKeyId || (typeof saved.accessKeyId === 'string' ? saved.accessKeyId : ''),
        }));
      } catch { /* blank form */ }
    })();
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof R2Config) => (e: { target: { value: string } }) => { setCfg(c => ({ ...c, [k]: e.target.value })); setProblem(''); };

  const save = async () => {
    const next: R2Config = { accountId: cfg.accountId.trim(), bucket: cfg.bucket.trim(), accessKeyId: cfg.accessKeyId.trim(), secretAccessKey: cfg.secretAccessKey.trim() };
    const checked = imageStorageConfigSchema.safeParse({ r2AccountId: next.accountId, r2Bucket: next.bucket, r2AccessKeyId: next.accessKeyId, r2SecretAccessKey: next.secretAccessKey });
    if (!checked.success) { setProblem(checked.error.issues[0].message); return; }
    setBusy(true);
    setProblem('');
    try {
      // Only settings the bucket answers to are saved
      await testR2Connection(next);
      const sealed = await encryptImageStorageConfig(next, encryptBytes);
      await trackGuardedSave(KEY, () => settingsApi.upsert(KEY, sealed));
      onSaved();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Couldn’t save the bucket settings. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Form onSubmit={e => { e.preventDefault(); void save(); }} aria-label="Photo bucket settings">
      <FormField label="Account ID" htmlFor="rekey-r2-account">
        <TextInput id="rekey-r2-account" value={cfg.accountId} onChange={set('accountId')} autoComplete="off" spellCheck={false} />
      </FormField>
      <FormField label="Bucket name" htmlFor="rekey-r2-bucket">
        <TextInput id="rekey-r2-bucket" value={cfg.bucket} onChange={set('bucket')} autoComplete="off" spellCheck={false} />
      </FormField>
      <FormField label="Access key ID" htmlFor="rekey-r2-access">
        <TextInput id="rekey-r2-access" value={cfg.accessKeyId} onChange={set('accessKeyId')} autoComplete="off" spellCheck={false} />
      </FormField>
      <FormField label="Secret key" htmlFor="rekey-r2-secret">
        <PasswordInput id="rekey-r2-secret" value={cfg.secretAccessKey} onChange={set('secretAccessKey')} autoComplete="off" aria-describedby={problem ? 'rekey-r2-problem' : undefined} />
      </FormField>
      {problem && <Problem id="rekey-r2-problem" role="alert">{problem}</Problem>}
      <Actions>
        <PillButton type="button" onClick={onCancel} disabled={busy}>Cancel</PillButton>
        <PillButton type="submit" $variant="solid" disabled={busy}>{busy ? <Spinner size={14} /> : 'Save and try again'}</PillButton>
      </Actions>
    </Form>
  );
}

const Form = styled.form`
  display: flex;
  flex-direction: column;
`;

const Problem = styled.p`
  margin: 6px 0 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--color-danger);
`;

const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 16px;
`;
