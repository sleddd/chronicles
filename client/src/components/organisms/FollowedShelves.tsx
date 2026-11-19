import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { PillButton } from '../atoms/PillButton.js';
import { Icon } from '../atoms/core/Icon.jsx';
import { MaterialIcon } from '../atoms/MaterialIcon.js';
import { EmptyState } from '../atoms/EmptyState.js';
import { useEncryptedSetting } from '../../hooks/useEncryptedSetting.js';
import { publicShelf as publicShelfApi, ApiError, type PublicShelfPage } from '../../services/api.js';
import { publishableCover } from '../../services/publicShelf.js';
import { mediaTypeInfo } from '../../utils/media.js';
import { glassCard } from '../../styles/wallpaper.js';
import {
  followedShelvesOf, isFollowing, shelfTokenFrom, withFollowed, withTitle, withoutFollowed,
  FOLLOWED_SHELVES_MAX, type FollowedShelf,
} from '../../utils/followedShelves.js';

/*
 * The Media Journal's Following view: the public shelves this person follows,
 * by link only (there's no directory). The list is the sealed setting
 * `followedShelves`, so the server never learns who follows whom, and each
 * shelf is read with `publicShelf.peek` — no cookies, so those reads aren't
 * tied to the account either. `incoming` is a shelf to follow handed over by
 * the public page's Follow button (`/media#follow=<token>`).
 */

const SETTING = 'followedShelves';
const FRESH_MS = 5 * 60_000;
const AT_ONCE = 4; // the public read is limited per IP: never fire the whole list at once

type Peek = { status: 'done'; data: PublicShelfPage } | { status: 'gone' } | { status: 'error' };
// Kept across visits to the Following view for a few minutes
const peeks = new Map<string, { at: number; peek: Peek }>();

async function peekShelf(token: string): Promise<Peek> {
  const hit = peeks.get(token);
  if (hit && Date.now() - hit.at < FRESH_MS) return hit.peek;
  let peek: Peek;
  try {
    peek = { status: 'done', data: await publicShelfApi.peek(token) };
  } catch (err) {
    peek = err instanceof ApiError && err.status === 404 ? { status: 'gone' } : { status: 'error' };
  }
  if (peek.status !== 'error') peeks.set(token, { at: Date.now(), peek });
  return peek;
}

const COVERS_SHOWN = 5;

const AddRow = styled.form`
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 8px;
  @media (max-width: 560px) { flex-direction: column; align-items: stretch; }
`;

/* Outlined box on a wrapper (GlobalStyle strips the input's own border) */
const LinkBox = styled.label`
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 48px;
  padding: 0 16px;
  border: 1px solid var(--border-card);
  border-radius: 10px;
  color: var(--text-muted);
  &:focus-within { border-color: var(--color-accent-line); }
  input {
    flex: 1;
    min-width: 0;
    border: none;
    background: transparent;
    font-family: var(--font-sans);
    font-size: 15px;
    color: var(--text-primary);
    outline: none;
    &::placeholder { color: var(--text-placeholder); }
  }
`;

const Note = styled.p<{ $error?: boolean }>`
  margin: 0 0 8px;
  font-family: var(--font-sans);
  font-size: 13px;
  color: ${({ $error }) => ($error ? 'var(--color-danger)' : 'var(--text-muted)')};
`;

const Grid = styled.ul`
  list-style: none;
  margin: 28px 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px;
  @media (max-width: 860px) { grid-template-columns: minmax(0, 1fr); }
`;

const Card = styled.li`
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px 28px;
  border-radius: 14px;
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  ${glassCard}
`;

const CardHead = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  h3 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 22px;
    font-weight: 300;
    color: var(--text-primary);
    overflow-wrap: anywhere;
  }
  span {
    flex: none;
    font-family: var(--font-sans);
    font-size: 13px;
    color: var(--text-muted);
  }
`;

const Covers = styled(Link)`
  display: grid;
  grid-template-columns: repeat(${COVERS_SHOWN}, minmax(0, 1fr));
  gap: 10px;
  text-decoration: none;
`;

const Cover = styled.div`
  aspect-ratio: 2 / 3;
  border-radius: 6px;
  overflow: hidden;
  background: var(--bg-tile);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  img { width: 100%; height: 100%; object-fit: cover; display: block; }
`;

const Foot = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

const OpenLink = styled(Link)`
  font-family: var(--font-sans);
  font-size: 14px;
  font-weight: 500;
  color: var(--color-accent-link);
  text-decoration: none;
  &:hover { text-decoration: underline; }
`;

const Quiet = styled.p`
  margin: 0;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
`;

export function FollowedShelves({ ownToken, incoming, onIncomingDone }: {
  /** This account's own shelf — it can't be followed */
  ownToken?: string | null;
  /** A shelf to follow, from the public page's Follow button */
  incoming?: string | null;
  onIncomingDone?: () => void;
}) {
  const [stored, save, loaded] = useEncryptedSetting<unknown>(SETTING, []);
  const list = followedShelvesOf(stored);
  const listRef = useRef(list);
  listRef.current = list;
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<Record<string, Peek>>({});

  const follow = async (token: string): Promise<void> => {
    // Which shelf is yours, asked now with the session (the page's copy is
    // only the fallback when the server can't be reached)
    const mine = await publicShelfApi.mine().then(r => r.publicShelf?.token ?? null, () => ownToken ?? null);
    if (mine && token === mine) { setNote({ text: 'That’s your own shelf.' }); return; }
    const already = listRef.current.find(s => s.token === token);
    if (already) { setNote({ text: `You already follow ${already.title || 'that shelf'}.` }); return; }
    if (listRef.current.length >= FOLLOWED_SHELVES_MAX) { setNote({ text: `You can follow up to ${FOLLOWED_SHELVES_MAX} shelves. Unfollow one first.`, error: true }); return; }
    setBusy(true);
    const peek = await peekShelf(token);
    if (peek.status !== 'done') {
      setBusy(false);
      setNote({ text: peek.status === 'gone' ? 'That shelf isn’t available. The link may have been reset or turned off.' : 'Couldn’t reach that shelf. Try again.', error: true });
      return;
    }
    try {
      await save(withFollowed(listRef.current, token, peek.data.title));
      setFound(f => ({ ...f, [token]: peek }));
      setNote({ text: `Following ${peek.data.title}.` });
      setDraft('');
    } catch {
      setNote({ text: 'Couldn’t save that. Try again.', error: true });
    } finally {
      setBusy(false);
    }
  };

  // The public page's Follow button
  useEffect(() => {
    if (!incoming || !loaded) return;
    void follow(incoming).finally(() => onIncomingDone?.());
  }, [incoming, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Read each followed shelf, a few at a time
  const tokens = list.map(s => s.token).join(' ');
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    const queue = list.map(s => s.token).filter(t => !found[t]);
    const work = async () => {
      while (queue.length && !cancelled) {
        const token = queue.shift()!;
        const peek = await peekShelf(token);
        if (cancelled) return;
        setFound(f => ({ ...f, [token]: peek }));
      }
    };
    void Promise.all(Array.from({ length: Math.min(AT_ONCE, queue.length) }, work));
    return () => { cancelled = true; };
  }, [tokens, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // A shelf renamed by its owner: remember the new title (one save for all of them)
  useEffect(() => {
    if (!loaded) return;
    let next = listRef.current;
    for (const [token, peek] of Object.entries(found)) {
      if (peek.status === 'done') next = withTitle(next, token, peek.data.title);
    }
    if (next !== listRef.current) void save(next).catch(() => { /* tried again next visit */ });
  }, [found, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const unfollow = (s: FollowedShelf) => {
    void save(withoutFollowed(listRef.current, s.token))
      .then(() => setNote({ text: `Unfollowed ${s.title || 'that shelf'}.` }))
      .catch(() => setNote({ text: 'Couldn’t save that. Try again.', error: true }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const token = shelfTokenFrom(draft);
    if (!token) { setNote({ text: 'That doesn’t look like a public shelf link. It ends in /public-shelf/ and a code.', error: true }); return; }
    void follow(token);
  };

  return (
    <div>
      <AddRow onSubmit={submit}>
        <LinkBox>
          <Icon name="link" size={16} strokeWidth={2} />
          <input value={draft} onChange={e => { setDraft(e.target.value); setNote(null); }}
            placeholder="Paste a public shelf link to follow it" aria-label="Public shelf link" disabled={!loaded} />
        </LinkBox>
        <PillButton type="submit" disabled={!loaded || busy || !draft.trim()}>
          <Icon name="plus" size={14} strokeWidth={2.5} />Follow
        </PillButton>
      </AddRow>
      {note && <Note $error={note.error} role="status">{note.text}</Note>}
      <Note>Only you can see who you follow. The shelves’ owners aren’t told.</Note>

      {loaded && list.length === 0 ? (
        <EmptyState message="You’re not following any shelves yet."
          submessage="Open a shelf someone shared with you and press Follow, or paste its link above." />
      ) : (
        <Grid>
          {list.map(s => {
            const peek = found[s.token];
            const data = peek?.status === 'done' ? peek.data : null;
            const title = data?.title || s.title || 'Public shelf';
            const to = `/public-shelf/${s.token}`;
            return (
              <Card key={s.token}>
                <CardHead>
                  <h3>{title}</h3>
                  {data && <span>{data.total === 1 ? '1 item' : `${data.total} items`}</span>}
                </CardHead>
                {peek?.status === 'gone' ? (
                  <Quiet>This shelf isn’t available any more. Its owner may have reset the link or turned it off.</Quiet>
                ) : peek?.status === 'error' ? (
                  <Quiet>Couldn’t load this shelf right now.</Quiet>
                ) : data && data.items.length === 0 ? (
                  <Quiet>Nothing on this shelf yet.</Quiet>
                ) : (
                  <Covers to={to} aria-label={`Open ${title}`}>
                    {Array.from({ length: COVERS_SHOWN }, (_, i) => {
                      const item = data?.items[i];
                      const cover = item ? publishableCover(item.cover) : undefined;
                      return (
                        <Cover key={i} title={item?.title}>
                          {cover ? <img src={cover} alt="" loading="lazy" decoding="async" />
                            : item ? <MaterialIcon aria-hidden $size={22}>{mediaTypeInfo(item.type).glyph}</MaterialIcon> : null}
                        </Cover>
                      );
                    })}
                  </Covers>
                )}
                <Foot>
                  {peek?.status !== 'gone' ? <OpenLink to={to}>Open shelf</OpenLink> : <span />}
                  <PillButton type="button" $variant="neutral" onClick={() => unfollow(s)}>Unfollow</PillButton>
                </Foot>
              </Card>
            );
          })}
        </Grid>
      )}
    </div>
  );
}
