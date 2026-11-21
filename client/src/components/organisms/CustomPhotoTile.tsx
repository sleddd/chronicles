import { useRef, useState } from 'react';
import styled from 'styled-components';
import { Icon } from '../atoms/core/Icon.jsx';
import { Spinner } from '../atoms/Spinner.js';
import { Tile, Pick, Chosen } from '../molecules/WallpaperPicker.js';
import { ImageLibraryPicker } from './ImageLibraryPicker.js';
import { useDecryptedImage } from '../../hooks/useDecryptedImage.js';
import { useEncryption } from '../../contexts/EncryptionContext.js';
import { uploadEntryImage, type EntryImage } from '../../services/imageStorage.js';
import { ALLOWED_IMAGE_TYPES } from '../../utils/processImage.js';

/* "Your photo": the tile in a background picker (Settings → Theme → Background, a
   Vision area's photo) for a photo of the person's own, uploaded or taken from the
   library of photos on their entries. Rendered only while Entry Images is on and set
   up (the caller checks `useImagesReady`). The photo is encrypted and stored in their
   own bucket like an entry's. With a photo, the tile picks it. The strip under it
   uploads another, opens the library or removes it. */

const Strip = styled.div`
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: center;
  gap: 12px;
  padding: 16px 8px 7px;
  font-family: var(--font-sans);
  font-size: 12px;
  &[data-on-photo] { background: linear-gradient(to top, rgba(0, 0, 0, 0.66), transparent); }
  button {
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    color: var(--color-accent-link);
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
  }
  &[data-on-photo] button { color: #fff; }
  button:disabled { opacity: 0.5; cursor: default; }
  button:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
`;

const Label = styled.span`
  padding-bottom: 22px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-secondary);
`;

const Problem = styled.p`
  grid-column: 1 / -1;
  margin: 0;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--color-danger);
`;

export function CustomPhotoTile({ image, chosen, onPick, onSet, onRemove, onModal }: {
  /** The person's photo, if they have one here */
  image: EntryImage | null;
  /** It is the background showing now */
  chosen: boolean;
  /** The tile was pressed: use the photo already here */
  onPick: () => void;
  /** A new photo, uploaded or taken from the library: use it */
  onSet: (image: EntryImage) => void;
  onRemove: () => void;
  /** The library dialog opened or closed (a floating picker must not close under it) */
  onModal?: (open: boolean) => void;
}) {
  const { encryptBytes } = useEncryption();
  const { url, loading } = useDecryptedImage(image?.thumbKey ?? null, image?.thumbIv ?? null, image?.mimeType ?? null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [library, setLibraryOpen] = useState(false);
  const setLibrary = (open: boolean) => { setLibraryOpen(open); onModal?.(open); };

  const upload = async (file: File) => {
    setBusy(true); setProblem('');
    try {
      onSet(await uploadEntryImage(file, encryptBytes));
    } catch (err) {
      console.error('Background upload failed:', err instanceof Error ? err.message : err);
      setProblem('That photo didn’t upload. Try again.');
    } finally { setBusy(false); }
  };

  return (
    <>
      <Tile $on={chosen}>
        {image ? (
          <Pick type="button" role="radio" aria-checked={chosen} aria-label="Your photo" onClick={onPick}>
            {url ? <img src={url} alt="" /> : loading || busy ? <Spinner size={16} /> : <Icon name="image" size={18} strokeWidth={1.5} />}
          </Pick>
        ) : (
          <Pick as="div"><Label>{busy ? 'Uploading…' : 'Your photo'}</Label></Pick>
        )}
        {chosen && <Chosen><Icon name="check" size={12} strokeWidth={3} /></Chosen>}
        <Strip data-on-photo={image ? '' : undefined}>
          <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}>Upload</button>
          <button type="button" disabled={busy} onClick={() => setLibrary(true)}>Library</button>
          {image && <button type="button" disabled={busy} onClick={onRemove}>Remove</button>}
        </Strip>
        <input ref={fileRef} type="file" accept={ALLOWED_IMAGE_TYPES.join(',')} style={{ display: 'none' }} aria-label="Upload a photo"
          onChange={e => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void upload(file);
          }} />
      </Tile>
      {problem && <Problem role="alert">{problem}</Problem>}
      {library && (
        <ImageLibraryPicker single excludeKeys={image ? [image.key] : []} remainingSlots={1}
          onSelect={images => { if (images[0]) onSet(images[0]); }} onClose={() => setLibrary(false)} />
      )}
    </>
  );
}
