import { useState } from 'react';
import styled from 'styled-components';
import { auth as authApi, type TrustedBrowserInfo } from '../../services/api.js';
import { showFlash } from '../../services/flashNotice.js';
import { QuietLink, RowNote, RowPill, SettingsActionRow } from '../molecules/SettingsGroup.js';

/*
 * Settings → Security → Trusted browsers: the browsers that skip the 2FA code
 * at sign-in ("Don't ask for a code on this browser for 30 days"). Each still
 * needs the password every time; Forget makes it ask for a code again.
 */

const List = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
`;

const Item = styled.li`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 0;
  border-top: 1px solid var(--border-subtle);
  font-family: var(--font-sans);
  font-size: 16px;
  color: var(--text-primary);
  &:first-child { border-top: 0; padding-top: 0; }
`;

const Meta = styled.div`
  font-size: 14px;
  color: var(--text-muted);
`;

const day = (iso: string | null): string => (iso
  ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  : 'not yet');

export function TrustedBrowsersSettings() {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<TrustedBrowserInfo[] | null>(null);

  const toggle = async () => {
    if (open) { setOpen(false); return; }
    // A failed load must not read as "none"
    const data = await authApi.trustedBrowsers().catch(() => { showFlash('Couldn’t load your trusted browsers. Try again.'); return null; });
    if (!data) return;
    setList(data);
    setOpen(true);
  };

  const forget = async (id: number) => {
    try {
      await authApi.forgetTrustedBrowser(id);
      setList(prev => (prev ?? []).filter(b => b.id !== id));
    } catch {
      showFlash('Couldn’t forget that browser. Try again.');
    }
  };

  return (
    <SettingsActionRow
      title="Trusted browsers"
      description="Browsers that skip the 2FA code when you sign in. Your password is still asked every time."
      action={<RowPill type="button" onClick={() => void toggle()}>{open ? 'Hide' : 'View'}</RowPill>}
    >
      {open && list && (list.length === 0 ? (
        <RowNote style={{ marginTop: 0 }}>
          None yet. Tick “Don’t ask for a code on this browser for 30 days” on the code screen when you sign in.
        </RowNote>
      ) : (
        <List>
          {list.map(b => (
            <Item key={b.id}>
              <div>
                {b.label || 'Browser'}{b.isCurrent ? ' (this browser)' : ''}
                <Meta>Added {day(b.createdAt)} · Last used {day(b.lastUsedAt)} · Until {day(b.expiresAt)}</Meta>
              </div>
              <QuietLink type="button" onClick={() => void forget(b.id)}>Forget</QuietLink>
            </Item>
          ))}
        </List>
      ))}
    </SettingsActionRow>
  );
}
