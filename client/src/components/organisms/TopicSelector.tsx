import { useState, useRef, useEffect, useId } from 'react';
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
  color: var(--text-primary, ${({ theme }) => theme.colors.text});
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
  border: 1px solid var(--border-faint);
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  box-shadow: ${({ theme }) => theme.shadow.lg};
  animation: ${dropdownSlide} 0.15s ease-out;
  transform-origin: top center;
`;

const SearchWrapper = styled.div`
  padding: 8px;
  border-bottom: 1px solid color-mix(in srgb, var(--border-faint) 50%, transparent); /* faded: the rows read as one list */
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
  border-bottom: 1px solid color-mix(in srgb, var(--border-faint) 50%, transparent);
  cursor: pointer;
  transition: background 0.1s;

  /* Option icon matches the option/placeholder text color. */
  & span { color: var(--text-secondary); }

  &:last-child { border-bottom: none; }
  /* Journal pinned on top (the Quick entry): set apart by a sunken shade, its rule
     the same faint one as every row */
  &[data-pinned], &[data-pinned]:hover { background: var(--bg-sunken); }
  /* Dark: a soft lift, not the near-black sunken colour */
  html[data-theme='dark'] &[data-pinned], html[data-theme='dark'] &[data-pinned]:hover { background: rgba(255, 255, 255, 0.05); }

  &:hover {
    background: rgba(0, 0, 0, 0.04);
  }
`;

/* The way back to the default: quieter than a topic, ruled off from them */
const ResetItem = styled(Item)`
  color: var(--text-muted);
  border-bottom: 1px solid var(--border-subtle);
  & > span:first-child { width: 17px; text-align: center; font-size: 16px; line-height: 1; color: var(--text-muted); }
  & > small { font-size: inherit; color: var(--text-muted); opacity: 0.8; }
`;

/* The Quick entry's Clear: small tracked capitals with a ×, the rows' own faint rule */
const ClearItem = styled(Item)`
  font-family: var(--font-sans);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-muted);
  & > span:first-child { width: 17px; text-align: center; font-size: 15px; line-height: 1; letter-spacing: 0; color: var(--text-muted); }
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
  /** Choices that aren't topics, listed A–Z among them (the Quick entry's Bill and Spending) */
  extras?: { key: string; name: string; icon: string }[];
  /** The extra chosen, shown on the trigger in place of the topic */
  selectedExtra?: string | null;
  onSelectExtra?: (key: string) => void;
  /** The trigger's words for the chosen topic (the Quick entry: "a journal entry") */
  label?: (name: string) => string;
  /** Journal pinned first, ruled off from the rest (A–Z under it) — the Quick entry */
  journalFirst?: boolean;
  /** No "Clear topic · back to Journal" row: the list stays the same whatever is
   *  chosen (the Quick entry, whose Clear sits beside its question) */
  noClearRow?: boolean;
  /** A small "× CLEAR" row first in the list that calls this (the Quick entry, once
   *  open: back to the question, as when it first loads) */
  onClear?: () => void;
}

type PickerTopic = { id: number | null; name: string; icon: string | null; extra?: string };
const isJournal = (t: { name: string }) => t.name.toLowerCase() === 'journal';

/** Topic picker. There is no "No topic": an entry without one is saved under
 *  Journal, so null shows — and is listed — as Journal (even before the
 *  Journal topic exists; picking it then keeps null). Always A–Z. While another
 *  topic is chosen the list opens with "Clear topic · back to Journal". */
export function TopicSelector({ selectedId, onSelect, topics, filled, hideIcon = false, extras = [], selectedExtra = null, onSelectExtra, label, journalFirst = false, noClearRow = false, onClear }: TopicSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const accentColor = useUIStore(s => s.accentColor) || DEFAULT_ACCENT_COLOR;

  const journalTopic = topics.find(isJournal);
  const journal: PickerTopic = journalTopic ?? { id: null, name: 'Journal', icon: 'book' };
  const extra = selectedExtra ? extras.find(x => x.key === selectedExtra) : undefined;
  const selected: PickerTopic | undefined = extra ? { id: null, name: extra.name, icon: extra.icon, extra: extra.key } : (selectedId === null ? journal : topics.find(t => t.id === selectedId));

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    // Escape closes the list and puts focus back on the trigger
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
      setSearch('');
      triggerRef.current?.focus();
    };
    document.addEventListener('mousedown', handle);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  // Always alphabetical (case-insensitive), whatever order the topics are kept in
  const sorted: PickerTopic[] = [...topics, ...(journalTopic ? [] : [journal]), ...extras.map(x => ({ id: null, name: x.name, icon: x.icon, extra: x.key }))]
    .sort((a, b) => (journalFirst ? Number(isJournal(b)) - Number(isJournal(a)) : 0)
      || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  const filtered = search
    ? sorted.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
    : sorted;

  return (
    <Wrapper ref={wrapperRef}>
      <Trigger
        ref={triggerRef}
        type="button"
        $filled={filled ?? selectedId !== null}
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`Topic: ${selected ? selected.name : 'Journal'}`}
      >
        {selected ? (
          <>
            {!hideIcon && <TopicIcon $color={accentColor}><TopicGlyph name={selected.icon} size={17} /></TopicIcon>}
            {label ? label(selected.name) : selected.name}
          </>
        ) : (
          <Placeholder>{label ? label('Journal') : 'Journal'}</Placeholder>
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
              ariaLabel="Search topics"
              autoFocus
            />
          </SearchWrapper>
          <ItemList id={listId} role="listbox" aria-label="Topics">
            {/* After flipping through topics: one tap back to the default (no topic = Journal) */}
            {!search && onClear && (
              <ClearItem type="button" role="option" aria-selected={false} onClick={() => { onClear(); setOpen(false); setSearch(''); }}>
                <span aria-hidden="true">×</span>
                Clear
              </ClearItem>
            )}
            {!search && !noClearRow && !onClear && !(selected && !selected.extra && isJournal(selected)) && (
              <ResetItem type="button" role="option" aria-selected={false} onClick={() => { onSelect(journal.id); setOpen(false); setSearch(''); }}>
                <span aria-hidden="true">×</span>
                Clear topic<small>· back to Journal</small>
              </ResetItem>
            )}
            {filtered.length === 0 ? (
              <EmptyMessage role="status">No topics found</EmptyMessage>
            ) : (
              filtered.map(t => {
                const active = t.extra ? selectedExtra === t.extra : !selectedExtra && (selectedId === t.id || (selectedId === null && isJournal(t)));
                return (
                <Item
                  key={t.extra ? `x:${t.extra}` : t.id ?? 'journal'}
                  type="button"
                  role="option"
                  aria-selected={active}
                  data-pinned={journalFirst && !t.extra && isJournal(t) ? '' : undefined}
                  $active={active}
                  onClick={() => { if (t.extra) onSelectExtra?.(t.extra); else onSelect(t.id); setOpen(false); setSearch(''); }}
                >
                  <TopicIcon $color={accentColor}><TopicGlyph name={t.icon} size={15} /></TopicIcon>
                  {t.name}
                </Item>
                );
              })
            )}
          </ItemList>
        </Dropdown>
      )}
    </Wrapper>
  );
}
