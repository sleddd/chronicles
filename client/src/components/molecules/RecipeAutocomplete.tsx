import { useMemo, useState } from 'react';
import styled from 'styled-components';
import { MaterialIcon } from '../atoms/MaterialIcon.js';

/* Type-to-search recipe picker: a sunken box with an accent outline while
   focused, and a floating "Recipes" list under it — each recipe with a link
   icon. Used to link recipes (Menu tiles, shopping lists) and as the Menu's
   meal box: with `value`/`onQueryChange` the typed text is the meal name
   itself, Enter keeps it, and picking a recipe links it instead. Type-ahead:
   the best match completes inline in faint text — Tab or → takes it. Props only. */

const Wrap = styled.div`
  position: relative;
  width: 100%;
  min-width: 0;
`;

/* Inline completion: the rest of the best match, faint, right after what's
   typed (same font and padding as the box, so it lines up) */
const Ghost = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 42px;
  padding: 0 15.5px;
  display: flex;
  align-items: center;
  font-family: var(--font-sans);
  font-size: 16px;
  white-space: pre;
  overflow: hidden;
  pointer-events: none;
  & > span:first-child { visibility: hidden; }
  & > span:last-child { color: var(--text-placeholder); }
`;

const SearchInput = styled.input`
  && {
    width: 100%;
    box-sizing: border-box;
    height: 42px;
    padding: 0 14px;
    border: 1.5px solid var(--border-card) !important;
    border-radius: 8px;
    background: var(--bg-sunken) !important;
    font-family: var(--font-sans);
    font-size: 16px;
    color: var(--text-secondary);
    outline: none;
  }
  &&:focus { border-color: var(--color-accent) !important; }
  &::placeholder { color: var(--text-placeholder); }
`;

/* Floats over the grid (wider than a Menu cell), above everything around it */
const Menu = styled.div`
  position: absolute;
  top: calc(100% + 10px);
  left: 0;
  z-index: 60;
  min-width: max(100%, 300px);
  max-width: min(420px, 90vw);
  padding: 14px 10px 10px;
  background: var(--bg-tile);
  border: 1px solid var(--border-pop);
  border-radius: 10px;
  box-shadow: var(--shadow-lg);
`;

const MenuHead = styled.div`
  padding: 0 12px 8px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
`;

const Options = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 260px;
  overflow-y: auto;
`;

const Option = styled.li<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 9px 12px;
  border-radius: 6px;
  font-family: var(--font-sans);
  font-size: 16px;
  color: var(--text-secondary);
  cursor: pointer;
  background: ${({ $active }) => ($active ? 'var(--bg-row-hover)' : 'transparent')};
  & > span:first-child { flex: none; color: var(--color-accent-link); }
  & > span:last-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;

const NoMatch = styled.div`
  padding: 6px 12px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
`;

interface RecipeAutocompleteProps {
  recipes: { id: number; title: string }[];
  onSelect: (id: number) => void;
  placeholder?: string;
  /** Kept for existing callers; both sizes now share one look */
  size?: 'sm' | 'md';
  /** Free-text mode: the typed text is a value of its own (the Menu's meal name) */
  value?: string;
  onQueryChange?: (text: string) => void;
  /** Free-text mode: Enter with no recipe highlighted */
  onCommit?: () => void;
  onBlur?: () => void;
  autoFocus?: boolean;
  ariaLabel?: string;
}

export function RecipeAutocomplete({
  recipes, onSelect, placeholder = 'Link a recipe…', value, onQueryChange, onCommit, onBlur, autoFocus, ariaLabel,
}: RecipeAutocompleteProps) {
  const freeText = value !== undefined;
  const [ownQuery, setOwnQuery] = useState('');
  const query = freeText ? value : ownQuery;
  const [open, setOpen] = useState(!!autoFocus);
  // Free text starts with nothing highlighted, so Enter keeps what was typed
  const [highlight, setHighlight] = useState(freeText ? -1 : 0);

  // Titles starting with what's typed come first, then any containing it
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return recipes.slice(0, 8);
    const starts = recipes.filter(r => r.title.toLowerCase().startsWith(q));
    const contains = recipes.filter(r => !r.title.toLowerCase().startsWith(q) && r.title.toLowerCase().includes(q));
    return [...starts, ...contains].slice(0, 8);
  }, [recipes, query]);

  // Type-ahead: the best match that starts with exactly what's typed
  const completion = query && matches[0] && matches[0].title.toLowerCase().startsWith(query.toLowerCase())
    ? matches[0] : null;
  const ghostRest = completion ? completion.title.slice(query.length) : '';

  const select = (id: number) => {
    onSelect(id);
    if (!freeText) setOwnQuery('');
    setOpen(false);
  };

  // In free-text mode an empty match list just hides the menu
  const showMenu = open && (matches.length > 0 || !freeText);

  return (
    <Wrap>
      <SearchInput
        autoFocus={autoFocus}
        value={query}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        onChange={e => {
          if (freeText) onQueryChange?.(e.target.value); else setOwnQuery(e.target.value);
          setOpen(true);
          setHighlight(freeText ? -1 : 0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => { setOpen(false); onBlur?.(); }}
        onKeyDown={e => {
          // Tab or → at the end takes the inline completion (links that recipe)
          const atEnd = (e.target as HTMLInputElement).selectionStart === query.length;
          if (completion && ghostRest && (e.key === 'Tab' || (e.key === 'ArrowRight' && atEnd))) {
            e.preventDefault();
            select(completion.id);
            return;
          }
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHighlight(h => Math.min(h + 1, matches.length - 1)); }
          if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlight(h => Math.max(h - 1, freeText ? -1 : 0)); }
          if (e.key === 'Enter') {
            e.preventDefault();
            if (open && highlight >= 0 && matches[highlight]) select(matches[highlight].id);
            else if (freeText) { onCommit?.(); (e.target as HTMLInputElement).blur(); }
          }
          if (e.key === 'Escape') {
            setOpen(false);
            if (freeText) (e.target as HTMLInputElement).blur(); else setOwnQuery('');
          }
        }}
      />
      {open && ghostRest && (
        <Ghost aria-hidden="true"><span>{query}</span><span>{ghostRest}</span></Ghost>
      )}
      {showMenu && (
        <Menu role="listbox" aria-label="Recipes">
          <MenuHead>Recipes</MenuHead>
          {matches.length === 0 ? (
            <NoMatch>No matching recipes</NoMatch>
          ) : (
            <Options>
              {matches.map((r, i) => (
                <Option
                  key={r.id}
                  role="option"
                  aria-selected={i === highlight}
                  $active={i === highlight}
                  onMouseDown={e => { e.preventDefault(); select(r.id); }}
                  onMouseEnter={() => setHighlight(i)}
                >
                  <MaterialIcon $size={18} aria-hidden="true">link</MaterialIcon>
                  <span>{r.title}</span>
                </Option>
              ))}
            </Options>
          )}
        </Menu>
      )}
    </Wrap>
  );
}
