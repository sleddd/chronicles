import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { Icon } from '../atoms/core/Icon.jsx';
import { MaterialIcon } from '../atoms/MaterialIcon.js';
import { notice as noticeApi, type AppNotice } from '../../services/api.js';

/* The app-wide notice the server can switch on (`npm run notice`) — e.g. a
   security incident notice, which must accompany emailed breach notices.
   Checked on load and whenever the tab returns; dismissing hides that one
   message in this browser (a changed message shows again). */

const DISMISS_KEY = 'app-notice-dismissed-v1';

const Bar = styled.div`
  position: fixed;
  top: 3px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 950;
  width: min(760px, calc(100vw - 24px));
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  background: var(--bg-elevated, var(--bg-panel));
  border: 1px solid var(--border-pop, var(--border-card));
  border-left: 3px solid var(--chart-amber, #c98f3e);
  border-radius: 10px;
  box-shadow: var(--shadow-lg, 0 8px 24px rgba(0,0,0,0.25));
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-primary);
  a { color: var(--color-accent-link, var(--color-accent)); font-weight: 600; margin-left: 6px; }
  @media print { display: none; }
`;

const Text = styled.p`
  flex: 1;
  margin: 0;
`;

const Close = styled.button`
  display: inline-flex;
  padding: 2px;
  border: none;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  &:hover { color: var(--text-primary); }
`;

function dismissedId(): string | null {
  try { return localStorage.getItem(DISMISS_KEY); } catch { return null; }
}

export function NoticeBanner() {
  const [current, setCurrent] = useState<AppNotice | null>(null);
  const [hidden, setHidden] = useState<string | null>(dismissedId);

  useEffect(() => {
    let alive = true;
    const check = () => {
      if (document.visibilityState === 'hidden') return;
      noticeApi.get().then(r => { if (alive) setCurrent(r.notice); }).catch(() => { /* keep what's shown */ });
    };
    check();
    document.addEventListener('visibilitychange', check);
    return () => { alive = false; document.removeEventListener('visibilitychange', check); };
  }, []);

  if (!current) return null;
  const id = `${current.updatedAt}|${current.message}`;
  if (hidden === id) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, id); } catch { /* still hide for now */ }
    setHidden(id);
  };

  return (
    <Bar role="alert">
      <MaterialIcon $size={20} aria-hidden="true">warning</MaterialIcon>
      <Text>
        {current.message}
        {current.linkUrl && <a href={current.linkUrl} target="_blank" rel="noopener noreferrer">Learn more</a>}
      </Text>
      <Close type="button" aria-label="Dismiss notice" onClick={dismiss}>
        <Icon name="x" size={16} strokeWidth={2} aria-hidden="true" />
      </Close>
    </Bar>
  );
}
