import styled from 'styled-components';
import { MaterialIcon } from '../atoms/MaterialIcon.js';
import {
  FOCUS_SOUNDS, setFocusVolume, stopAllFocusSounds, toggleFocusSound, useFocusSounds, volumeOf,
} from '../../services/focusSounds.js';

/* The dashboard's Focus card: a tile per sound — tap to play it, tap again to stop —
   any number together, each playing one with its own volume slider. No timer. "Stop
   all" in the title row while anything plays. The player is app-wide
   (services/focusSounds), so the mix keeps going when you leave the dashboard. */

const Head = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--border-subtle);
  h2 { margin: 0; }
  button {
    padding: 0;
    border: none;
    background: none;
    font-family: var(--font-sans);
    font-size: 14px;
    color: var(--text-muted);
    cursor: pointer;
    white-space: nowrap;
  }
  button:hover { color: var(--color-accent-link); }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 10px;
`;

const Tile = styled.div<{ $on: boolean }>`
  display: flex;
  flex-direction: column;
  min-width: 0;
  border: 1px solid ${({ $on }) => ($on ? 'var(--color-accent-line, var(--color-accent))' : 'var(--border-card)')};
  border-radius: 12px;
  transition: border-color 150ms;
  &:hover { border-color: ${({ $on }) => ($on ? 'var(--color-accent-line, var(--color-accent))' : 'var(--border-strong)')}; }
`;

const TileBtn = styled.button<{ $on: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 14px 6px 12px;
  border: none;
  background: none;
  cursor: pointer;
  font-family: var(--font-sans);
  font-size: 13px;
  color: ${({ $on }) => ($on ? 'var(--text-primary)' : 'var(--text-secondary)')};
  & > span:first-child { color: ${({ $on }) => ($on ? 'var(--color-accent)' : 'var(--text-muted)')}; }
  & > span:last-child { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: -2px; border-radius: 12px; }
`;

/* A playing sound's volume: a thin accent slider under its name */
const Volume = styled.input`
  margin: 0 12px 12px;
  height: 18px;
  accent-color: var(--color-accent);
  cursor: pointer;
`;

const Note = styled.p`
  margin: 12px 0 0;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-muted);
`;

export function FocusSounds() {
  const playing = useFocusSounds(s => s.playing);
  useFocusSounds(s => s.volumes); // re-render as a volume changes
  const failed = useFocusSounds(s => s.failed);

  return (
    <section aria-label="Focus sounds">
      <Head>
        <h2>Focus</h2>
        {playing.length > 0 && <button type="button" onClick={stopAllFocusSounds}>Stop all</button>}
      </Head>
      <Grid role="group" aria-label="Sounds">
        {FOCUS_SOUNDS.map(s => {
          const on = playing.includes(s.id);
          return (
            <Tile key={s.id} $on={on}>
              <TileBtn type="button" $on={on} aria-pressed={on} onClick={() => toggleFocusSound(s.id)}
                aria-label={on ? `Stop ${s.label}` : `Play ${s.label}`}>
                <MaterialIcon $size={24} aria-hidden="true">{s.icon}</MaterialIcon>
                <span>{s.label}</span>
              </TileBtn>
              {on && (
                <Volume type="range" min={0} max={100} step={1} value={Math.round(volumeOf(s.id) * 100)}
                  aria-label={`${s.label} volume`} onChange={e => setFocusVolume(s.id, Number(e.target.value) / 100)} />
              )}
            </Tile>
          );
        })}
      </Grid>
      {failed && <Note role="status">That sound couldn’t start. Tap it again.</Note>}
    </section>
  );
}
