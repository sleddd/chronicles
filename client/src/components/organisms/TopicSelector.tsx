import { useState, useRef, useEffect } from 'react';
import styled, { keyframes } from 'styled-components';
import { faChevronDown } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { SearchInput } from '../molecules/SearchInput.js';
import { TopicIcon as TopicGlyph } from '../molecules/IconPicker.js';
import { useUIStore } from '../../stores/uiStore.js';
import { DEFAULT_ACCENT_COLOR } from '../../styles/accent.js';

const dropdownSlide = keyframes`
  from { opacity: 0; transform: translateY(-8px) scaleY(0.95); }
  to { opacity: 1; transform: translateY(0) scaleY(1); }
`;

const Wrapper = styled.div`
  position: relative;
`;

const Trigger = styled.button<{ $filled?: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  /* Standard body size; icon, name and chevron share one centred line */
  font-family: var(--font-sans);
  font-size: 15px;
  line-height: 1.2;
  font-weight: 400;
  text-transform: capitalize;
  letter-spacing: normal;
  border: 1px solid var(--rule, #d4cfc5);
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  background: transparent;
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;
  transition: background 0.15s;

  &:hover {
    background: var(--paper-hover, #f0eeea);
  }
`;

const TopicIcon = styled.span<{ $color?: string }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  color: ${({ theme }) => theme.colors.text};
  font-size: 18px;
  flex-shrink: 0;
`;

const Placeholder = styled.span`
  color: ${({ theme }) => theme.colors.text};
`;

const ChevronIcon = styled.span<{ $open: boolean }>`
  display: inline-flex;
  align-items: center;
  margin-left: auto;
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textMuted};
  transition: transform 0.15s;
  transform: ${({ $open }) => $open ? 'rotate(180deg)' : 'rotate(0)'};
`;

const Dropdown = styled.div`
  position: absolute;
  z-index: 40;
  top: 100%;
  left: 0;
  margin-top: 4px;
  width: 260px;
  max-height: 320px;
  overflow-y: auto;
  background: var(--paper-surface, ${({ theme }) => theme.colors.surface});
  border: 1px solid var(--border-subtle);
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  box-shadow: ${({ theme }) => theme.shadow.lg};
  animation: ${dropdownSlide} 0.15s ease-out;
  transform-origin: top center;
`;

const SearchWrapper = styled.div`
  padding: 8px;
  border-bottom: 1px solid var(--border-subtle);
  position: sticky;
  top: 0;
  background: var(--paper-surface, ${({ theme }) => theme.colors.surface});

  /* Search field: no box/border/fill — just icon + text above the bottom divider. */
  & > div {
    border: none;
    background: transparent !important;
    box-shadow: none;
    padding-left: 6px;
  }
  & > div:focus-within { box-shadow: none; }
  input { background: transparent !important; }
  input::placeholder { color: var(--text-secondary); opacity: 1; }
  /* Magnifying glass: match the 14px input font, aligned to the text top. */
  & > div > span:first-child {
    align-self: flex-start;
    line-height: 14px;
    margin-top: 4px;
  }
  & > div > span:first-child svg {
    color: var(--text-secondary);
    width: 14px;
    height: 14px;
  }
`;

const ItemList = styled.div`
  padding: 0;
`;

const Item = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 14px;
  font-size: ${({ theme }) => theme.fontSize.sm}px;
  text-align: left;
  color: var(--text-secondary);
  background: ${({ $active }) => $active ? 'rgba(0,0,0,0.04)' : 'transparent'};
  border: none;
  border-bottom: 1px solid var(--border-subtle);
  cursor: pointer;
  transition: background 0.1s;

  /* Option icon matches the option/placeholder text color. */
  & span { color: var(--text-secondary); }

  &:last-child { border-bottom: none; }

  &:hover {
    background: rgba(0, 0, 0, 0.04);
  }
`;

const EmptyMessage = styled.div`
  padding: 16px;
  text-align: center;
  font-size: ${({ theme }) => theme.fontSize.sm}px;
  color: ${({ theme }) => theme.colors.textMuted};
`;

interface TopicSelectorProps {
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  topics: { id: number; name: string; icon: string | null; color: string | null }[];
  filled?: boolean;
  /** Hide the topic icon on the trigger (used when the picker renders as a breadcrumb). */
  hideIcon?: boolean;
}

type PickerTopic = { id: number | null; name: string; icon: string | null };
const isJournal = (t: { name: string }) => t.name.toLowerCase() === 'journal';

/** Topic picker. There is no "No topic": an entry without one is saved under
 *  Journal, so null shows — and is listed — as Journal (even before the
 *  Journal topic exists; picking it then keeps null). Always A–Z. */
export function TopicSelector({ selectedId, onSelect, topics, filled, hideIcon = false }: TopicSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const accentColor = useUIStore(s => s.accentColor) || DEFAULT_ACCENT_COLOR;

  const journalTopic = topics.find(isJournal);
  const journal: PickerTopic = journalTopic ?? { id: null, name: 'Journal', icon: 'book' };
  const selected: PickerTopic | undefined = selectedId === null ? journal : topics.find(t => t.id === selectedId);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  // Always alphabetical (case-insensitive), whatever order the topics are kept in
  const sorted: PickerTopic[] = [...topics, ...(journalTopic ? [] : [journal])]
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  const filtered = search
    ? sorted.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
    : sorted;

  return (
    <Wrapper ref={wrapperRef}>
      <Trigger $filled={filled ?? selectedId !== null} onClick={() => setOpen(!open)}>
        {selected ? (
          <>
            {!hideIcon && <TopicIcon $color={accentColor}><TopicGlyph name={selected.icon} size={17} /></TopicIcon>}
            {selected.name}
          </>
        ) : (
          <Placeholder>Journal</Placeholder>
        )}
        <ChevronIcon $open={open}>
          <FontAwesomeIcon icon={faChevronDown} />
        </ChevronIcon>
      </Trigger>

      {open && (
        <Dropdown>
          <SearchWrapper>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Type to search topics..."
              debounceMs={0}
            />
          </SearchWrapper>
          <ItemList>
            {filtered.length === 0 ? (
              <EmptyMessage>No topics found</EmptyMessage>
            ) : (
              filtered.map(t => (
                <Item
                  key={t.id ?? 'journal'}
                  $active={selectedId === t.id || (selectedId === null && isJournal(t))}
                  onClick={() => { onSelect(t.id); setOpen(false); setSearch(''); }}
                >
                  <TopicIcon $color={accentColor}><TopicGlyph name={t.icon} size={15} /></TopicIcon>
                  {t.name}
                </Item>
              ))
            )}
          </ItemList>
        </Dropdown>
      )}
    </Wrapper>
  );
}
