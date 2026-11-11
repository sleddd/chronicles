import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import styled from 'styled-components';
import { MaterialIcon } from '../atoms/MaterialIcon.js';
import { Icon } from '../atoms/core/Icon.jsx';
import { StarRating } from './StarRating.js';
import { ProgressSlider } from './ProgressSlider.js';
import { glassCard, glassControl } from '../../styles/wallpaper.js';
import {
  SHELVES, mediaSubtitle, mediaTypeInfo, shelfLabel, progressLabel, showsProgress,
  type MediaShelf, type MediaType,
} from '../../utils/media.js';

/* The media journal's poster card, shared by the owner's shelf (interactive:
   re-rate, change the Shelf status and the progress in place, open the entry)
   and the public page (readOnly: nothing to press). The cover fills the card;
   with none, the title is written on the tile. `corner` sits over the cover's
   top-right (the public-shelf bookmark). Props only. */

export interface PosterItem {
  title: string;
  type: MediaType;
  creator: string;
  album?: string;
  season?: string;
  year: string;
  rating: number;
  shelf: MediaShelf;
  progress?: number;
}

/* A poster grid: five across on desktop, fewer as the screen narrows */
export const PosterGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 24px;
  margin-top: 28px;
  @media (max-width: 1100px) { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px; }
  @media (max-width: 860px) { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  @media (max-width: 560px) { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
`;

/* A shelf card: a lifted panel holding the cover, the stars and the shelf */
const Card = styled.article`
  position: relative;
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-lg);
  background: var(--bg-panel);
  ${glassCard}
`;

/* The cover fills the card's width, 2:3; with none, the title is written on the tile */
const coverLook = `
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  aspect-ratio: 2 / 3;
  padding: 14px 12px;
  border: 1px solid var(--border-card);
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-tile);
  color: var(--text-muted);
  text-align: center;
  img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
`;

const CoverBtn = styled.button`
  ${coverLook}
  cursor: pointer;
  &:hover { border-color: var(--control-border); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

const CoverStill = styled.div`
  ${coverLook}
`;

/* The title on a cover-less tile */
const TileTitle = styled.span`
  font-family: var(--font-display);
  font-size: clamp(15px, 1.6cqi, 19px);
  font-weight: 300;
  line-height: 1.25;
  color: var(--text-primary);
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
`;

const TileSub = styled.span`
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--text-muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

/* Whatever hangs over the cover's top edge, near its right corner (the
   public-shelf bookmark ribbon): it starts above the cover's top so it reads
   as tucked over the edge */
const Corner = styled.div`
  position: absolute;
  top: 6px;
  right: 26px;
  z-index: 1;
`;

/* How far through it: the rule under the cover, dragged to update; the figure on its right */
const ProgressRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 2px 2px 0;
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
`;

/* Stars over the shelf pill, centred under the cover, with air around them */
const Foot = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  padding: 8px 0 6px;
`;

/* The Shelf status as a small outlined pill: "Reading ⌄", the select invisible over it */
const ShelfPill = styled.label<{ $set: boolean }>`
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  max-width: 100%;
  padding: 0 8px 0 10px;
  border: 1px solid ${({ $set }) => ($set ? 'var(--color-accent-line)' : 'var(--border-pill, var(--border-card))')};
  border-radius: 999px;
  font-family: var(--font-sans);
  font-size: 13px;
  color: ${({ $set }) => ($set ? 'var(--color-accent-soft)' : 'var(--text-soft)')};
  cursor: pointer;
  &:hover { border-color: ${({ $set }) => ($set ? 'var(--color-accent-line)' : 'var(--control-border)')}; }
  &:focus-within { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  & > span:first-of-type { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  & > span:last-of-type { display: inline-flex; }
  select { position: absolute; inset: 0; width: 100%; opacity: 0; cursor: pointer; font-size: 16px; }
  option { color: var(--text-primary); background: var(--bg-surface); }
  ${glassControl}
`;

/* The Shelf status as a plain word on the public page */
const ShelfWord = styled.span`
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-muted);
`;

function CardProgress({ item, onProgress }: { item: PosterItem; onProgress: (p: number) => void }) {
  // The rule follows the drag at once; the entry is saved when the drag (or key press) ends
  const value = item.progress ?? 0;
  const [shown, setShown] = useState(value);
  useEffect(() => { setShown(value); }, [value]);
  return (
    <ProgressRow>
      <ProgressSlider value={shown} onChange={setShown} onCommit={p => { if (p !== value) onProgress(p); }}
        label={`Progress for ${item.title}`} valueText={progressLabel(shown, item.type)} />
      <span>{progressLabel(shown, item.type)}</span>
    </ProgressRow>
  );
}

interface MediaPosterCardProps {
  item: PosterItem;
  /** The cover to draw (an object URL or a data URL); none = the title on the tile */
  coverSrc?: string | null;
  coverStyle?: CSSProperties;
  /** The public page: nothing to press, the Shelf status as a word, no progress */
  readOnly?: boolean;
  onOpen?: () => void;
  onRate?: (rating: number) => void;
  onShelve?: (shelf: MediaShelf) => void;
  onProgress?: (progress: number) => void;
  /** Sits over the cover's top-right corner */
  corner?: ReactNode;
}

export function MediaPosterCard({ item, coverSrc, coverStyle, readOnly = false, onOpen, onRate, onShelve, onProgress, corner }: MediaPosterCardProps) {
  const sub = mediaSubtitle({ ...item, album: item.album ?? '', season: item.season ?? '' });
  const tip = sub ? `${item.title} · ${sub}` : item.title;
  const inside = coverSrc ? (
    <img src={coverSrc} alt="" style={coverStyle} />
  ) : (
    <>
      <MaterialIcon $size={28} aria-hidden="true">{mediaTypeInfo(item.type).glyph}</MaterialIcon>
      <TileTitle>{item.title}</TileTitle>
      {sub && <TileSub>{sub}</TileSub>}
    </>
  );
  return (
    <Card>
      {readOnly
        ? <CoverStill role="img" aria-label={tip} title={tip}>{inside}</CoverStill>
        : <CoverBtn type="button" onClick={onOpen} aria-label={`Open ${item.title}`} title={tip}>{inside}</CoverBtn>}
      {corner && <Corner>{corner}</Corner>}
      {!readOnly && onProgress && showsProgress({ shelf: item.shelf, progress: item.progress ?? 0 }) && (
        <CardProgress item={item} onProgress={onProgress} />
      )}
      <Foot>
        <StarRating value={item.rating} onChange={readOnly ? undefined : onRate} readOnly={readOnly} size={18} label={readOnly ? `${item.title} rating` : `Rating for ${item.title}`} />
        {readOnly ? (
          item.shelf ? <ShelfWord>{shelfLabel(item.shelf, item.type)}</ShelfWord> : null
        ) : (
          <ShelfPill $set={!!item.shelf}>
            <span>{shelfLabel(item.shelf, item.type)}</span>
            <span aria-hidden="true"><Icon name="chevron-down" size={13} strokeWidth={2} /></span>
            <select aria-label={`Shelf for ${item.title}`} value={item.shelf} onChange={e => onShelve?.(e.target.value as MediaShelf)}>
              <option value="">No shelf</option>
              {SHELVES.map(s => <option key={s.value} value={s.value}>{shelfLabel(s.value, item.type)}</option>)}
            </select>
          </ShelfPill>
        )}
      </Foot>
    </Card>
  );
}
