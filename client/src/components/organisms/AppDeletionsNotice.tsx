import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { Icon } from '../atoms/core/Icon.jsx';
import { MaterialIcon } from '../atoms/MaterialIcon.js';
import { assistantChanges as changesApi } from '../../services/api.js';
import { Bar, Text, Close } from './NoticeBanner.js';

/* Entries the Chronicles AI app deleted, said out loud. Each one's only copy
   waits in Settings → In-App AI → Changes the app made until the owner puts it
   back or removes it (it never expires), so the owner must hear about it: an
   entry otherwise just vanishes from the journal at the next sync.

   Only for accounts that can use the app. Checked on load and when the tab
   returns (at most every 5 minutes). Dismissing hides it in this browser until
   the app deletes another entry. Nothing decrypted: it only counts. */

const DISMISS_KEY = 'app-deletions-dismissed-v1';
const CHECK_EVERY_MS = 5 * 60 * 1000;
/** Pages read at most (the list is newest first, so new deletions are on the first) */
const MAX_PAGES = 4;

const Low = styled(Bar)`
  top: auto;
  bottom: 24px;
  width: min(620px, calc(100vw - 24px));
  border-left-color: var(--color-accent);
`;

function dismissedAt(): number {
  try { return Number(localStorage.getItem(DISMISS_KEY)) || 0; } catch { return 0; }
}

async function countDeletions(): Promise<{ count: number; newest: number; more: boolean }> {
  let count = 0, newest = 0, before: number | undefined, more = false;
  for (let page = 0; page < MAX_PAGES; page++) {
    const r = await changesApi.list(before);
    for (const c of r.changes) {
      if (c.kind === 'entry' && c.extra?.deleted === true) { count++; newest = Math.max(newest, c.id); }
    }
    more = r.more;
    if (!r.more || r.changes.length === 0) break;
    before = r.changes[r.changes.length - 1].id;
  }
  return { count, newest, more };
}

export function AppDeletionsNotice() {
  const [found, setFound] = useState<{ count: number; newest: number; more: boolean } | null>(null);
  const [hiddenUpTo, setHiddenUpTo] = useState(dismissedAt);

  useEffect(() => {
    let alive = true;
    let last = 0;
    const check = () => {
      if (document.visibilityState === 'hidden' || Date.now() - last < CHECK_EVERY_MS) return;
      last = Date.now();
      countDeletions().then(r => { if (alive) setFound(r); }).catch(() => { /* asked again later */ });
    };
    check();
    document.addEventListener('visibilitychange', check);
    return () => { alive = false; document.removeEventListener('visibilitychange', check); };
  }, []);

  if (!found || found.count === 0 || found.newest <= hiddenUpTo) return null;
  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(found.newest)); } catch { /* still hide for now */ }
    setHiddenUpTo(found.newest);
  };
  const n = found.more ? `${found.count}+ entries` : found.count === 1 ? 'an entry' : `${found.count} entries`;

  return (
    <Low role="status">
      <MaterialIcon $size={20} aria-hidden="true">auto_awesome</MaterialIcon>
      <Text>
        The Chronicles AI app deleted {n}. {found.count === 1 && !found.more ? 'It’s' : 'They’re'} kept for you in Settings → In-App AI → Changes the app made, until you put {found.count === 1 && !found.more ? 'it' : 'them'} back or remove {found.count === 1 && !found.more ? 'it' : 'them'}.
        <Link to="/settings" onClick={dismiss}>Review</Link>
      </Text>
      <Close type="button" aria-label="Dismiss" onClick={dismiss}>
        <Icon name="x" size={16} strokeWidth={2} aria-hidden="true" />
      </Close>
    </Low>
  );
}
