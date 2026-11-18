import { useEffect, useId, useRef, useState } from 'react';
import styled from 'styled-components';
import {
  FormWrap, Section, SectionHead, SectionLabel, TitleInput, Chips, Chip, RowBox, LabelledRow, RowLabel, BareInput, BoxText, FieldNote, TextAction, AddChip, AddChipBox,
} from './formKit.js';
import { MaterialIcon } from '../../atoms/MaterialIcon.js';
import { Icon } from '../../atoms/core/Icon.jsx';
import { Spinner } from '../../atoms/Spinner.js';
import { StarRating } from '../StarRating.js';
import { ProgressSlider } from '../ProgressSlider.js';
import {
  MEDIA_TYPES, SHELVES, mediaTypeInfo, shelfLabel, clampRating, clampProgress, progressLabel,
  mediaLinkUrl, mediaLinkHost, type MediaFieldValues, type MediaType, type MediaShelf, type MediaCover,
} from '../../../utils/media.js';
import { searchCovers, fetchCover, type CoverCandidate } from '../../../services/coverLookup.js';
import { applyLookupDetails, blankDetailKeys, type DetailKey, type MediaDetails } from '../../../services/mediaDetails.js';
export type { MediaFieldValues } from '../../../utils/media.js';

/* Media fields — the journal editor and the Quick entry: the title as a big
   borderless title, Type chips, then the cover beside one outlined box of
   rows (Author / Director / Artist, Album or Season, Year, Genre), Shelf
   chips, the star rating and Notes. Find cover looks the title up in a fixed
   catalogue (services/coverLookup) and keeps a small copy in the entry. */

const Details = styled.div`
  display: grid;
  grid-template-columns: 132px minmax(0, 1fr);
  gap: 24px;
  align-items: start;
  @media (max-width: 560px) { grid-template-columns: minmax(0, 1fr); }
`;

const CoverCol = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  @media (max-width: 560px) { flex-direction: row; align-items: flex-end; gap: 16px; }
`;

/* The cover, 2:3, outlined; a placeholder glyph on the tile colour until there is one */
const CoverBox = styled.div`
  position: relative;
  width: 132px;
  aspect-ratio: 2 / 3;
  border: 1px solid var(--border-card);
  border-radius: 10px;
  overflow: hidden;
  background: var(--bg-tile);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  img { width: 100%; height: 100%; object-fit: cover; display: block; }
`;

const CoverActions = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
  /* A button centres its text: wrapped onto two lines in this narrow column, keep it flush left */
  & > button { text-align: left; }
`;

const Candidates = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 14px;
`;

const Candidate = styled.button<{ $chosen: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 92px;
  padding: 0;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  img {
    width: 92px;
    aspect-ratio: 2 / 3;
    object-fit: cover;
    border-radius: 8px;
    border: 2px solid ${({ $chosen }) => ($chosen ? 'var(--color-accent-line)' : 'transparent')};
    box-shadow: 0 0 0 1px var(--border-card);
  }
  span {
    font-family: var(--font-sans);
    font-size: 12px;
    line-height: 1.3;
    color: var(--text-muted);
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  &:focus-visible img { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

const ProgressWord = styled.span`
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
`;

type Found = CoverCandidate & { cover: MediaCover };

interface MediaFieldsProps {
  values: MediaFieldValues;
  onChange: (values: MediaFieldValues) => void;
  /** With In-App AI ready: fills the details the catalogue didn't (the entry form passes `aiMediaDetails`) */
  onAiDetails?: (values: MediaFieldValues, keys: DetailKey[]) => Promise<MediaDetails>;
  /** Every tag already used on the shelf, offered as chips */
  allTags?: string[];
  /** Rename / remove a tag on every other media item (this one is changed in the form) */
  onRenameTag?: (from: string, to: string) => void;
  onRemoveTag?: (tag: string) => void;
}

/* Tags: the shelf's tags as chips — tap to put one on this item or take it off, any number;
   "+ Add" makes a new one (romantasy, book club…) and puts it on. "Edit" lists the tags to
   rename (tap one, type, Enter) or remove (× — asks once: "Remove “x” from every item?"),
   on every item that has it. Private: never on the public shelf */
function TagChips({ value, options, onChange, onRename, onRemove }: {
  value: string[]; options: string[]; onChange: (tags: string[]) => void;
  onRename?: (from: string, to: string) => void; onRemove?: (tag: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const chips = [...options, ...value.filter(v => !options.some(o => same(o, v)))];
  const has = (t: string) => value.some(v => same(v, t));
  const commit = () => {
    const tag = draft.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (tag && !has(tag)) onChange([...value, tag]);
    setDraft('');
    setAdding(false);
  };
  const commitRename = () => {
    const to = renameDraft.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (renaming && to && to !== renaming) onRename?.(renaming, to);
    setRenaming(null);
  };

  if (editing) return (
    <Chips role="group" aria-label="Edit tags">
      {chips.map(t => renaming === t ? (
        <AddChipBox key={t} autoFocus value={renameDraft} maxLength={40} aria-label={`Rename ${t}`}
          onChange={e => setRenameDraft(e.target.value)} onBlur={commitRename}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitRename(); } if (e.key === 'Escape') { e.preventDefault(); setRenaming(null); } }} />
      ) : confirming === t ? (
        <Chip key={t} type="button" $active={false} style={{ color: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}
          autoFocus onBlur={() => setConfirming(null)} onClick={() => { onRemove?.(t); setConfirming(null); }}>
          Remove “{t}” from every item?
        </Chip>
      ) : (
        <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
          <Chip type="button" $active={false} title="Rename" onClick={() => { setRenaming(t); setRenameDraft(t); }}>{t}</Chip>
          <TextAction type="button" aria-label={`Remove ${t}`} title="Remove" onClick={() => setConfirming(t)}
            style={{ padding: '0 6px', fontSize: 16 }}>×</TextAction>
        </span>
      ))}
      <TextAction type="button" onClick={() => { setEditing(false); setRenaming(null); setConfirming(null); }}>Done</TextAction>
    </Chips>
  );

  return (
    <Chips role="group" aria-label="Tags">
      {chips.map(t => {
        const on = has(t);
        return (
          <Chip key={t} type="button" aria-pressed={on} $active={on}
            onClick={() => onChange(on ? value.filter(v => !same(v, t)) : [...value, t])}>{t}</Chip>
        );
      })}
      {adding ? (
        <AddChipBox autoFocus value={draft} maxLength={40} placeholder="New tag" aria-label="New tag"
          onChange={e => setDraft(e.target.value)} onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') { e.preventDefault(); setDraft(''); setAdding(false); } }} />
      ) : (
        <AddChip type="button" $active={false} onClick={() => setAdding(true)}>+ Add</AddChip>
      )}
      {(onRename || onRemove) && chips.length > 0 && !adding && (
        <TextAction type="button" onClick={() => setEditing(true)}>Edit</TextAction>
      )}
    </Chips>
  );
}

const SOURCE_NAMES: Record<string, string> = { openlibrary: 'Open Library', itunes: 'Apple’s catalogue', tvmaze: 'TVmaze', wikipedia: 'Wikipedia' };
const KEY_WORDS: Record<DetailKey, string> = { creator: 'who made it', year: 'the year', genre: 'the genre', album: 'the album', season: 'the season' };
const listWords = (keys: DetailKey[]) => keys.map(k => KEY_WORDS[k]).join(', ').replace(/, ([^,]*)$/, ' and $1');

const LINK_PLACEHOLDER: Record<MediaType, string> = {
  book: 'Goodreads, StoryGraph…', movie: 'Rotten Tomatoes, IMDb, Letterboxd…', tv: 'Rotten Tomatoes, IMDb…', music: 'Spotify, Apple Music, Bandcamp…',
};

/* The link's input with an open-in-new-tab button once it's a real address */
const LinkCell = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
`;

const OpenLink = styled.a`
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  color: var(--color-accent-link);
  &:hover { color: var(--color-accent); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

export function MediaFields({ values, onChange, onAiDetails, allTags, onRenameTag, onRemoveTag }: MediaFieldsProps) {
  // Cover fetches finish after more typing: patch the latest values, never a stale copy
  const latest = useRef(values);
  latest.current = values;
  const set = (patch: Partial<MediaFieldValues>) => onChange({ ...latest.current, ...patch });
  const info = mediaTypeInfo(values.mediaType);
  const type: MediaType = info.value;
  const ids = { creator: useId(), album: useId(), season: useId(), year: useId(), genre: useId(), link: useId(), notes: useId() };

  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<Found[] | null>(null);
  const [lookupNote, setLookupNote] = useState('');
  // Which detail fields a lookup filled (so a different cover's details may replace them; typed ones stay)
  const filledRef = useRef<DetailKey[]>([]);
  const title = values.mediaTitle?.trim() ?? '';
  const linkUrl = mediaLinkUrl(values.link);
  // Said once the field is left (not while the address is still being typed)
  const [linkFocused, setLinkFocused] = useState(false);
  const linkRefused = !linkUrl && !!values.link?.trim() && !linkFocused;
  const linkHost = linkUrl ? mediaLinkHost(linkUrl) : '';
  // A new title clears the last search's candidates
  useEffect(() => { setFound(null); setLookupNote(''); }, [title, type]);

  /** Put a cover and its catalogue details on the form; returns the keys it filled */
  const choose = (f: Found): DetailKey[] => {
    const { patch, filled } = applyLookupDetails(latest.current, f.details, filledRef.current);
    const before = new Set(filledRef.current);
    filledRef.current = filled;
    set({ ...patch, cover: f.cover });
    return (Object.keys(patch) as DetailKey[]).filter(k => !before.has(k) || patch[k] !== undefined);
  };

  /** With AI ready: the details the catalogue left blank */
  const fillWithAi = async (): Promise<DetailKey[]> => {
    if (!onAiDetails) return [];
    const keys = blankDetailKeys(latest.current);
    if (!keys.length) return [];
    try {
      const details = await onAiDetails(latest.current, keys);
      const { patch, filled } = applyLookupDetails(latest.current, details, filledRef.current);
      filledRef.current = filled;
      if (Object.keys(patch).length) set(patch);
      return Object.keys(patch) as DetailKey[];
    } catch {
      return [];
    }
  };

  const findCover = async () => {
    if (!title || searching) return;
    setSearching(true); setLookupNote(''); setFound(null);
    try {
      const candidates = (await searchCovers(type, title, values.creator ?? '', values.year ?? '')).slice(0, 6);
      const fetched = await Promise.allSettled(candidates.map(c => fetchCover(c).then(cover => ({ ...c, cover }))));
      const ok = fetched.filter((r): r is PromiseFulfilledResult<Found> => r.status === 'fulfilled').map(r => r.value);
      const notes: string[] = [];
      if (ok.length) {
        setFound(ok);
        // The best match goes straight on; the rest wait underneath in case it's wrong
        const fromCatalogue = choose(ok[0]);
        if (fromCatalogue.length) notes.push(`Filled ${listWords(fromCatalogue)} from ${SOURCE_NAMES[ok[0].source] ?? 'the catalogue'}.`);
      } else {
        notes.push(`No cover found for “${title}”.`);
      }
      const fromAi = await fillWithAi();
      if (fromAi.length) notes.push(`Filled ${listWords(fromAi)} with AI — worth a glance.`);
      if (ok.length > 1) notes.push('Not the right cover? Pick another below.');
      setLookupNote(notes.join(' '));
    } catch (err) {
      setLookupNote(err instanceof Error ? err.message : 'The lookup failed.');
    } finally {
      setSearching(false);
    }
  };

  // Only an image kept inside the entry: anything else here (an address, say)
  // would make the page call out when the entry opens
  const savedCover = values.cover?.dataUrl;
  const chosenUrl = typeof savedCover === 'string' && savedCover.startsWith('data:image/') ? savedCover : undefined;

  return (
    <FormWrap>
      <Section>
        <TitleInput
          value={values.mediaTitle ?? ''}
          onChange={e => set({ mediaTitle: e.target.value })}
          placeholder={info.titlePlaceholder}
          aria-label="Title"
        />
      </Section>

      <Section style={{ marginTop: 30 }}>
        <SectionHead><SectionLabel>Type</SectionLabel></SectionHead>
        <Chips role="radiogroup" aria-label="Type">
          {MEDIA_TYPES.map(t => (
            <Chip key={t.value} type="button" role="radio" aria-checked={type === t.value} $active={type === t.value}
              onClick={() => set({ mediaType: t.value })}>
              {t.label}
            </Chip>
          ))}
        </Chips>
      </Section>

      <Section style={{ marginTop: 30 }} aria-label="Details">
        <SectionHead><SectionLabel>Details</SectionLabel></SectionHead>
        <Details>
          <CoverCol>
            <CoverBox aria-label={chosenUrl ? 'Cover' : 'No cover yet'}>
              {chosenUrl
                ? <img src={chosenUrl} alt="" />
                : <MaterialIcon $size={44} aria-hidden="true">{info.glyph}</MaterialIcon>}
            </CoverBox>
            <CoverActions>
              <TextAction type="button" onClick={findCover} disabled={!title || searching} title={title ? undefined : 'Type a title first'}>
                {searching ? <><Spinner size={12} /> Looking…</> : chosenUrl ? 'Look up again' : 'Find cover & details'}
              </TextAction>
              {chosenUrl && (
                <TextAction type="button" onClick={() => { set({ cover: null }); setFound(null); setLookupNote(''); }} style={{ color: 'var(--text-muted)' }}>
                  Remove cover
                </TextAction>
              )}
              {/* No cover found (or not the one you want): a photo of your own */}
            </CoverActions>
          </CoverCol>

          <RowBox>
            <LabelledRow>
              <RowLabel as="label" htmlFor={ids.creator}>{info.creatorLabel}</RowLabel>
              <BareInput id={ids.creator} value={values.creator ?? ''} placeholder={info.creatorLabel} onChange={e => set({ creator: e.target.value })} />
            </LabelledRow>
            {type === 'music' && (
              <LabelledRow>
                <RowLabel as="label" htmlFor={ids.album}>Album</RowLabel>
                <BareInput id={ids.album} value={values.album ?? ''} placeholder="For a song, the album it’s on" onChange={e => set({ album: e.target.value })} />
              </LabelledRow>
            )}
            {type === 'tv' && (
              <LabelledRow>
                <RowLabel as="label" htmlFor={ids.season}>Season</RowLabel>
                <BareInput id={ids.season} value={values.season ?? ''} placeholder="Season 2" onChange={e => set({ season: e.target.value })} />
              </LabelledRow>
            )}
            <LabelledRow>
              <RowLabel as="label" htmlFor={ids.year}>Year</RowLabel>
              <BareInput id={ids.year} value={values.year ?? ''} placeholder="Year" inputMode="numeric" onChange={e => set({ year: e.target.value })} />
            </LabelledRow>
            <LabelledRow>
              <RowLabel as="label" htmlFor={ids.genre}>Genre</RowLabel>
              <BareInput id={ids.genre} value={values.genre ?? ''} placeholder="Genre" onChange={e => set({ genre: e.target.value })} />
            </LabelledRow>
            <LabelledRow>
              <RowLabel as="label" htmlFor={ids.link}>Link</RowLabel>
              <LinkCell>
                <BareInput id={ids.link} type="url" inputMode="url" autoComplete="off" spellCheck={false} value={values.link ?? ''}
                  placeholder={LINK_PLACEHOLDER[type]} onChange={e => set({ link: e.target.value })}
                  onFocus={() => setLinkFocused(true)} onBlur={() => setLinkFocused(false)}
                  aria-invalid={linkRefused || undefined} aria-describedby={linkRefused ? `${ids.link}-note` : undefined} />
                {linkUrl && (
                  <OpenLink href={linkUrl} target="_blank" rel="noopener noreferrer" title={`Open ${linkHost} in a new tab`} aria-label={`Open ${linkHost} in a new tab`}>
                    <Icon name="external-link" size={16} strokeWidth={2} />
                  </OpenLink>
                )}
              </LinkCell>
            </LabelledRow>
          </RowBox>
        </Details>
        {linkRefused && <FieldNote id={`${ids.link}-note`} role="status">That link won’t open: links can only go to the major book, film and music sites, like Goodreads, Barnes &amp; Noble, Amazon, IMDb, Rotten Tomatoes, Letterboxd, Apple, Spotify or YouTube.</FieldNote>}
        {lookupNote && <FieldNote role="status">{lookupNote}</FieldNote>}
        {found && found.length > 1 && (
          <Candidates role="list" aria-label="Covers found">
            {found.map((f, i) => (
              <Candidate key={`${f.imageUrl}-${i}`} type="button" role="listitem" $chosen={f.cover.dataUrl === chosenUrl}
                onClick={() => { const keys = choose(f); setLookupNote(keys.length ? `Filled ${listWords(keys)} from ${SOURCE_NAMES[f.source] ?? 'the catalogue'}.` : ''); }} aria-pressed={f.cover.dataUrl === chosenUrl}>
                <img src={f.cover.dataUrl} alt="" />
                <span>{f.title}{f.detail ? ` · ${f.detail}` : ''}</span>
              </Candidate>
            ))}
          </Candidates>
        )}
        <FieldNote>
          Find cover &amp; details sends the title{values.creator?.trim() ? ` and ${info.creatorLabel.toLowerCase()}` : ''} to {type === 'book' ? 'Open Library' : type === 'music' ? 'Apple’s music catalogue' : type === 'tv' ? 'TVmaze (or Wikipedia)' : 'Wikipedia'}{onAiDetails ? ', and to your In-App AI for anything still blank' : ''}, fills the empty fields from what comes back (nothing you typed is changed) and keeps a small copy of the cover in this entry. A photo added with Add images is shown instead when there is one, at the bottom of this card.
        </FieldNote>
      </Section>

      <Section style={{ marginTop: 30 }}>
        <SectionHead><SectionLabel>Shelf</SectionLabel></SectionHead>
        <Chips role="radiogroup" aria-label="Shelf">
          {SHELVES.map(s => {
            const active = values.shelf === s.value;
            return (
              <Chip key={s.value} type="button" role="radio" aria-checked={active} $active={active}
                onClick={() => set({ shelf: (active ? '' : s.value) as MediaShelf })}>
                {shelfLabel(s.value, type)}
              </Chip>
            );
          })}
        </Chips>
      </Section>

      <Section style={{ marginTop: 30 }}>
        <SectionHead><SectionLabel>Tags</SectionLabel></SectionHead>
        <TagChips value={values.tags ?? []} options={allTags ?? []} onChange={tags => set({ tags })}
          onRename={onRenameTag ? (from, to) => {
            // This item too, in the form (the others are saved by the page)
            const cur = latest.current.tags ?? [];
            if (cur.some(t => t.toLowerCase() === from.toLowerCase())) set({ tags: [...new Set(cur.map(t => (t.toLowerCase() === from.toLowerCase() ? to : t)))] });
            onRenameTag(from, to);
          } : undefined}
          onRemove={onRemoveTag ? tag => {
            const cur = latest.current.tags ?? [];
            if (cur.some(t => t.toLowerCase() === tag.toLowerCase())) set({ tags: cur.filter(t => t.toLowerCase() !== tag.toLowerCase()) });
            onRemoveTag(tag);
          } : undefined} />
      </Section>

      <Section style={{ marginTop: 30 }}>
        <SectionHead>
          <SectionLabel>Progress</SectionLabel>
          <ProgressWord>{progressLabel(clampProgress(values.progress), type)}</ProgressWord>
        </SectionHead>
        <ProgressSlider tall value={clampProgress(values.progress)} onChange={p => set({ progress: p })}
          label="Progress" valueText={progressLabel(clampProgress(values.progress), type)} />
      </Section>

      <Section style={{ marginTop: 30 }}>
        <SectionHead><SectionLabel>Rating</SectionLabel></SectionHead>
        <StarRating value={clampRating(values.rating)} onChange={r => set({ rating: r })} size={28} showValue />
      </Section>

      <Section style={{ marginTop: 30 }}>
        <SectionHead><SectionLabel as="label" htmlFor={ids.notes}>Notes</SectionLabel></SectionHead>
        <BoxText id={ids.notes} value={values.notes ?? ''} placeholder="What did you think?"
          onChange={e => set({ notes: e.target.value })} />
      </Section>
    </FormWrap>
  );
}
