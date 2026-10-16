import { useState, useMemo } from 'react';
import styled from 'styled-components';
import { Modal } from '../atoms/Modal.js';
import { Icon } from '../atoms/core/Icon.jsx';
import { Spinner } from '../atoms/Spinner.js';
import { useDecryptedImage } from '../../hooks/useDecryptedImage.js';
import { useEntriesStore } from '../../stores/entriesStore.js';
import type { EntryImage } from '../../services/imageStorage.js';

/* =============================================================================
   ImageLibraryPicker — reuse an image already attached to any entry.

   The R2 bucket itself can't be browsed (it holds only ciphertext; the
   decryption IVs live in each entry's encrypted metadata), so the library is
   every image referenced across the user's entries, deduped by object key.
   ========================================================================== */

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 10px;
  max-height: 50vh;
  overflow-y: auto;
  padding: 4px 0;
`;

const Cell = styled.button<{ $selected?: boolean }>`
  position: relative;
  aspect-ratio: 1;
  padding: 0;
  border: 2px solid ${({ $selected }) => $selected ? 'var(--color-accent)' : 'transparent'};
  border-radius: var(--r-lg, 2px);
  background: var(--bg-sunken);
  cursor: pointer;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const CellImg = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
`;

const CheckBadge = styled.span`
  position: absolute;
  top: 6px;
  right: 6px;
  width: 20px;
  height: 20px;
  border-radius: var(--r-full, 999px);
  background: var(--color-accent);
  color: var(--on-accent, #fff);
  display: flex;
  align-items: center;
  justify-content: center;
`;

const EmptyText = styled.p`
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-secondary);
  margin: 8px 0;
  line-height: 1.5;
`;

const FooterRow = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
`;

const AddBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--on-accent, #fff);
  background: var(--color-accent);
  border: none;
  border-radius: var(--r-md, 1px);
  padding: 10px 20px;
  cursor: pointer;
  &:hover { background: var(--color-accent-hover); }
  &:disabled { opacity: 0.4; cursor: default; }
`;

const CancelBtn = styled.button`
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  padding: 10px 12px;
  cursor: pointer;
  &:hover { color: var(--text-primary); }
`;

function LibraryThumb({ image }: { image: EntryImage }) {
  const { url, loading } = useDecryptedImage(image.thumbKey, image.thumbIv, image.mimeType);
  if (url) return <CellImg src={url} alt="" />;
  return loading ? <Spinner size={16} /> : <Icon name="image" size={18} strokeWidth={1.5} />;
}

interface ImageLibraryPickerProps {
  /** Keys already on the current entry — hidden from the grid */
  excludeKeys: string[];
  /** How many more images the entry can take (7 max per entry) */
  remainingSlots: number;
  onSelect: (images: EntryImage[]) => void;
  onClose: () => void;
}

export function ImageLibraryPicker({ excludeKeys, remainingSlots, onSelect, onClose }: ImageLibraryPickerProps) {
  const entries = useEntriesStore(s => s.decryptedEntries);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Every image across all entries, deduped by key, newest entries first
  const library = useMemo(() => {
    const exclude = new Set(excludeKeys);
    const seen = new Set<string>();
    const out: EntryImage[] = [];
    const sorted = [...entries].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    for (const entry of sorted) {
      const imgs = (entry.metadata as Record<string, unknown>)?._images as EntryImage[] | undefined;
      if (!Array.isArray(imgs)) continue;
      for (const img of imgs) {
        if (typeof img?.key !== 'string' || seen.has(img.key) || exclude.has(img.key)) continue;
        seen.add(img.key);
        out.push(img);
      }
    }
    return out;
  }, [entries, excludeKeys]);

  const toggle = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else if (next.size < remainingSlots) next.add(key);
      return next;
    });
  };

  const handleAdd = () => {
    const chosen = library.filter(i => selected.has(i.key));
    if (chosen.length > 0) onSelect(chosen);
    onClose();
  };

  return (
    <Modal open onClose={onClose} title="Add from library">
      {library.length === 0 ? (
        <EmptyText>No images yet — photos you attach to entries appear here so you can reuse them.</EmptyText>
      ) : (
        <>
          <EmptyText>
            Pick from images already attached to your entries.
            {remainingSlots < 7 && ` This entry has room for ${remainingSlots} more.`}
          </EmptyText>
          <Grid>
            {library.map(img => (
              <Cell
                key={img.key}
                type="button"
                $selected={selected.has(img.key)}
                onClick={() => toggle(img.key)}
                aria-pressed={selected.has(img.key)}
              >
                <LibraryThumb image={img} />
                {selected.has(img.key) && (
                  <CheckBadge><Icon name="check" size={12} strokeWidth={3} /></CheckBadge>
                )}
              </Cell>
            ))}
          </Grid>
        </>
      )}
      <FooterRow>
        <CancelBtn type="button" onClick={onClose}>Cancel</CancelBtn>
        {library.length > 0 && (
          <AddBtn type="button" disabled={selected.size === 0} onClick={handleAdd}>
            <Icon name="plus" size={13} strokeWidth={2.5} />
            Add {selected.size > 0 ? `(${selected.size})` : ''}
          </AddBtn>
        )}
      </FooterRow>
    </Modal>
  );
}
