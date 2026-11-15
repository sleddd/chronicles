import { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';
import { deriveAuthSecret } from '@chronicles/shared';
import type { KeySource } from '../../contexts/EncryptionContext.js';
import { auth as authApi, ApiError, type PasskeyInfo } from '../../services/api.js';
import { PasskeyCancelled, confirmWithPasskey, passkeysAvailable, suggestedPasskeyName } from '../../services/passkeys.js';
import { useAddPasskey, usePasskeyAddConfirmation } from '../../hooks/useAddPasskey.js';
import { TextInput } from '../atoms/TextInput.js';
import { Spinner } from '../atoms/Spinner.js';
import { ConfirmIdentity } from '../molecules/ConfirmIdentity.js';
import { FormActions, QuietLink, RowNote, RowPill, SettingsActionRow } from '../molecules/SettingsGroup.js';

/*
 * Settings → Security → Passkeys: sign in and open the journal with one touch.
 *
 * Adding one makes a passkey on this device, takes the secret it gives (after
 * its fingerprint / face / PIN check) and wraps the master key under it. That
 * needs an extractable copy of the key for a moment, which only the password
 * or an existing passkey can produce — so adding (and removing) is confirmed
 * with one of them.
 */

const List = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

/* One bordered row card per passkey, like the fields in a settings group */
const Item = styled.li`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 16px;
  padding: 14px 16px;
  background: var(--bg-app);
  border: 1px solid var(--border-card);
  border-radius: 10px;
`;

const Name = styled.div`
  flex: 1 1 200px;
  min-width: 0;
  font-family: var(--font-sans);
  font-size: 16px;
  color: var(--text-primary);
`;

const Meta = styled.div`
  font-size: 14px;
  color: var(--text-muted);
`;

const Links = styled.div`
  display: flex;
  gap: 16px;
`;

const Form = styled.div`
  flex-basis: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 8px;
`;

const day = (iso: string | null): string => {
  if (!iso) return 'never';
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? 'today' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const message = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

interface PasskeySettingsProps {
  email: string;
  totpEnabled: boolean;
  /** How many passkeys the account has, once known (the other forms offer "Use a passkey" when it has one) */
  onUsable?: (usable: boolean) => void;
}

type Open = { kind: 'add' } | { kind: 'remove'; id: number } | { kind: 'remove-all' } | { kind: 'rename'; id: number } | null;

export function PasskeySettings({ email, totpEnabled, onUsable }: PasskeySettingsProps) {
  const confirmation = usePasskeyAddConfirmation();
  const addPasskey = useAddPasskey();
  const [passkeys, setPasskeys] = useState<PasskeyInfo[] | null>(null);
  const [supported, setSupported] = useState(false);
  const [open, setOpen] = useState<Open>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  // The device asks a second time for some passkeys: say why, so it doesn't read as a stall
  const [secondTouch, setSecondTouch] = useState(false);

  useEffect(() => { void passkeysAvailable().then(setSupported); }, []);
  useEffect(() => {
    void authApi.passkeys().then(setPasskeys).catch(() => setPasskeys([]));
  }, []);
  const count = passkeys?.length ?? 0;
  useEffect(() => { onUsable?.(supported && count > 0); }, [supported, count, onUsable]);

  const close = () => { confirmation.drop(); setOpen(null); setPassword(''); setCode(''); setError(''); setBusy(false); setSecondTouch(false); };
  const start = (next: Open) => { setOpen(next); setPassword(''); setCode(''); setError(''); setNote(''); };
  const withCode = totpEnabled && code.trim() ? { code: code.trim() } : {};

  /** Make the passkey on this device, wrap the key for it and store both. */
  const add = useCallback(async (via: 'password' | 'passkey') => {
    setError('');
    setBusy(true);
    let sourcePrf: Uint8Array | null = null;
    try {
      // Who is asking, first: a wrong password or code must not leave a passkey
      // on the device. Either way the answer is a single-use token for adding one
      let source: KeySource;
      let confirmToken: string;
      if (via === 'passkey') {
        const c = await confirmWithPasskey('passkey-add');
        sourcePrf = c.prf;
        source = { kind: 'passkey', prf: c.prf, wrap: c.wrap };
        confirmToken = c.confirmToken;
      } else {
        // Kept across tries the device turned away, so a retry asks for nothing again
        const fromPassword = await confirmation.confirm(password, email, totpEnabled ? code : undefined);
        source = fromPassword;
        confirmToken = fromPassword.confirmToken;
      }
      setPasskeys(await addPasskey(source, confirmToken, name, () => setSecondTouch(true)));
      close();
      setNote('Passkey added. You can sign in with it from now on.');
    } catch (err) {
      confirmation.failed(err);
      if (!(err instanceof PasskeyCancelled)) setError(message(err, 'Couldn’t add the passkey'));
      setBusy(false);
      setSecondTouch(false);
    } finally {
      sourcePrf?.fill(0);
    }
  }, [password, email, code, totpEnabled, name, confirmation, addPasskey]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = useCallback(async (via: 'password' | 'passkey') => {
    if (!open || (open.kind !== 'remove' && open.kind !== 'remove-all')) return;
    setError('');
    setBusy(true);
    let touched: Uint8Array | null = null;
    try {
      let confirmation: { currentAuthSecret: string; code?: string } | { confirmToken: string };
      if (via === 'passkey') {
        const c = await confirmWithPasskey('passkey-remove');
        touched = c.prf;
        confirmation = { confirmToken: c.confirmToken };
      } else {
        confirmation = { currentAuthSecret: await deriveAuthSecret(password, email), ...withCode };
      }
      const { passkeys: list } = open.kind === 'remove'
        ? await authApi.passkeyRemove(open.id, confirmation)
        : await authApi.passkeyRemoveAll(confirmation);
      setPasskeys(list);
      close();
      setNote(open.kind === 'remove' ? 'Passkey removed. It can no longer sign in.' : 'All passkeys removed. None of them can sign in any more.');
    } catch (err) {
      if (!(err instanceof PasskeyCancelled)) setError(err instanceof ApiError ? err.message : message(err, 'Couldn’t remove the passkey'));
      setBusy(false);
    } finally {
      touched?.fill(0);
    }
  }, [open, password, email, withCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const rename = async (id: number) => {
    const next = name.trim();
    if (!next) { close(); return; }
    setBusy(true);
    try {
      await authApi.passkeyRename(id, next);
      setPasskeys(list => (list ?? []).map(p => (p.id === id ? { ...p, name: next } : p)));
      close();
    } catch (err) {
      setError(message(err, 'Couldn’t rename it'));
      setBusy(false);
    }
  };

  const confirmFields = (onGo: () => void, usePasskey: boolean) => (
    <ConfirmIdentity
      password={password}
      onPassword={setPassword}
      showCode={totpEnabled}
      code={code}
      onCode={setCode}
      busy={busy}
      onEnter={onGo}
      onUsePasskey={usePasskey ? () => void (open?.kind === 'add' ? add('passkey') : remove('passkey')) : undefined}
    />
  );
  const cantGo = busy || !password || (totpEnabled && !code.trim());

  // With passkeys listed, the rows speak for themselves
  const description = passkeys === null || count > 0 ? undefined
      : supported ? 'Sign in and open your journal with a fingerprint, face or device PIN. Nothing to type.'
        : 'This browser can’t use a passkey that opens your journal. Your password works as before.';

  return (
    <SettingsActionRow
      title="Passkeys"
      description={description}
      action={supported && open?.kind !== 'add' && (
        <RowPill type="button" onClick={() => { start({ kind: 'add' }); setName(suggestedPasskeyName()); }}>Add passkey</RowPill>
      )}
    >
      {note && !open && <RowNote style={{ marginTop: 0 }} role="status">{note}</RowNote>}

      {open?.kind === 'add' && (
        <>
          <RowNote style={{ marginTop: 0 }}>
            Name it, then confirm it’s you. Your device will ask for your fingerprint, face or PIN, sometimes twice. Save it to this device (Touch ID, Windows Hello) or your phone. If a password manager offers to save it, decline: some, such as LastPass, can’t hold a passkey that opens your journal.
          </RowNote>
          {error && <RowNote $error style={{ marginTop: 0 }} role="alert">{error}</RowNote>}
          {secondTouch && <RowNote style={{ marginTop: 0 }} role="status">One more touch to finish. Choose the same passkey again, in the same place you just saved it.</RowNote>}
          <TextInput value={name} onChange={e => setName(e.target.value.slice(0, 60))} placeholder="Name, such as MacBook or Phone" aria-label="Passkey name" />
          {confirmFields(() => { if (!cantGo) void add('password'); }, count > 0)}
          <FormActions>
            <RowPill type="button" onClick={close} disabled={busy}>Cancel</RowPill>
            <RowPill type="button" $tone="accent" onClick={() => void add('password')} disabled={cantGo}>
              {busy ? <Spinner size={14} /> : 'Add passkey'}
            </RowPill>
          </FormActions>
        </>
      )}

      {count > 0 && (
        <List>
          {passkeys!.map(p => (
            <Item key={p.id}>
              {open?.kind === 'rename' && open.id === p.id ? (
                <Form>
                  {error && <RowNote $error style={{ marginTop: 0 }} role="alert">{error}</RowNote>}
                  <TextInput
                    autoFocus
                    value={name}
                    onChange={e => setName(e.target.value.slice(0, 60))}
                    aria-label="Passkey name"
                    onKeyDown={e => { if (e.key === 'Enter') void rename(p.id); if (e.key === 'Escape') close(); }}
                  />
                  <FormActions>
                    <RowPill type="button" onClick={close} disabled={busy}>Cancel</RowPill>
                    <RowPill type="button" $tone="accent" onClick={() => void rename(p.id)} disabled={busy || !name.trim()}>Rename</RowPill>
                  </FormActions>
                </Form>
              ) : (
                <>
                  <Name>
                    {p.name}
                    <Meta>Added {day(p.createdAt)} · Last used {day(p.lastUsedAt)}{p.synced ? ' · Synced to your other devices' : ''}</Meta>
                  </Name>
                  <Links>
                    <QuietLink type="button" onClick={() => { start({ kind: 'rename', id: p.id }); setName(p.name); }}>Rename</QuietLink>
                    <QuietLink type="button" $danger onClick={() => start({ kind: 'remove', id: p.id })}>Remove</QuietLink>
                  </Links>
                </>
              )}
              {open?.kind === 'remove' && open.id === p.id && (
                <Form>
                  <RowNote style={{ marginTop: 0 }}>Remove “{p.name}”? It can no longer sign in. Delete it from the device too, if you still have it.</RowNote>
                  {error && <RowNote $error style={{ marginTop: 0 }} role="alert">{error}</RowNote>}
                  {confirmFields(() => { if (!cantGo) void remove('password'); }, supported)}
                  <FormActions>
                    <RowPill type="button" onClick={close} disabled={busy}>Keep it</RowPill>
                    <RowPill type="button" $tone="danger" onClick={() => void remove('password')} disabled={cantGo}>
                      {busy ? <Spinner size={14} /> : 'Remove'}
                    </RowPill>
                  </FormActions>
                </Form>
              )}
            </Item>
          ))}
        </List>
      )}

      {count > 0 && open?.kind !== 'remove-all' && !open && (
        <div><QuietLink type="button" $danger onClick={() => start({ kind: 'remove-all' })}>Remove all passkeys</QuietLink></div>
      )}
      {open?.kind === 'remove-all' && (
        <>
          <RowNote style={{ marginTop: 0 }}>Remove every passkey? Do this if a device was lost or stolen. Your password and recovery key still work.</RowNote>
          {error && <RowNote $error style={{ marginTop: 0 }} role="alert">{error}</RowNote>}
          {confirmFields(() => { if (!cantGo) void remove('password'); }, false)}
          <FormActions>
            <RowPill type="button" onClick={close} disabled={busy}>Keep them</RowPill>
            <RowPill type="button" $tone="danger" onClick={() => void remove('password')} disabled={cantGo}>
              {busy ? <Spinner size={14} /> : 'Remove all'}
            </RowPill>
          </FormActions>
        </>
      )}
    </SettingsActionRow>
  );
}
