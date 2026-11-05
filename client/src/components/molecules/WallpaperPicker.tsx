import styled from 'styled-components';
import { Icon } from '../atoms/core/Icon.jsx';
import { UNSPLASH_LINK, WALLPAPERS, wallpaperLink, wallpaperThumb } from '../../utils/wallpapers.js';

/* Settings → Theme → Background: "None" (the default) then every wallpaper as
   a thumbnail, each with its credit on it — "Photo by <name> on Unsplash",
   linking to the photo and to Unsplash. The chosen one has an accent outline
   and a tick. Props only. */

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
`;

const Tile = styled.div<{ $on: boolean }>`
  position: relative;
  aspect-ratio: 16 / 10;
  border-radius: 10px;
  overflow: hidden;
  background: var(--bg-sunken);
  outline: ${({ $on }) => ($on ? '2px solid var(--color-accent)' : '1px solid var(--border-card)')};
  outline-offset: ${({ $on }) => ($on ? '2px' : '0')};
`;

/* The whole tile picks it; the credit links sit above it */
const Pick = styled.button`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-secondary);
  cursor: pointer;
  img { width: 100%; height: 100%; object-fit: cover; display: block; }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: -2px; }
`;

const Credit = styled.p`
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  margin: 0;
  padding: 18px 8px 6px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.62), transparent);
  font-family: var(--font-sans);
  font-size: 11px;
  line-height: 1.3;
  color: rgba(255, 255, 255, 0.86);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
  a { color: #fff; text-decoration: underline; text-underline-offset: 2px; pointer-events: auto; }
`;

const Chosen = styled.span`
  position: absolute;
  top: 8px;
  right: 8px;
  display: inline-flex;
  padding: 3px;
  border-radius: 50%;
  background: var(--color-accent);
  color: var(--on-accent, #fff);
  pointer-events: none;
`;

export function WallpaperPicker({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  return (
    <Grid role="radiogroup" aria-label="Background">
      <Tile $on={!value}>
        <Pick type="button" role="radio" aria-checked={!value} onClick={() => onChange(null)}>None</Pick>
        {!value && <Chosen><Icon name="check" size={12} strokeWidth={3} /></Chosen>}
      </Tile>
      {WALLPAPERS.map(w => (
        <Tile key={w.id} $on={value === w.id}>
          <Pick type="button" role="radio" aria-checked={value === w.id} aria-label={`Photo by ${w.by}`} onClick={() => onChange(w.id)}>
            <img src={wallpaperThumb(w.id)} alt="" loading="lazy" decoding="async" />
          </Pick>
          {value === w.id && <Chosen><Icon name="check" size={12} strokeWidth={3} /></Chosen>}
          <Credit>
            Photo by <a href={wallpaperLink(w)} target="_blank" rel="noopener noreferrer">{w.by}</a>
            {' '}on <a href={UNSPLASH_LINK} target="_blank" rel="noopener noreferrer">Unsplash</a>
          </Credit>
        </Tile>
      ))}
    </Grid>
  );
}
