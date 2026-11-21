import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { useNavItems } from '../../hooks/useNavItems.js';
import { useEntriesStore } from '../../stores/entriesStore.js';
import { cardLabel } from '../../styles/cardLabel.js';
import { MAX_SHORTCUTS, addableShortcuts, chipLabels, cleanShortcuts, shortcutCatalog, shownShortcuts } from '../../utils/shortcuts.js';

/* The home dashboard's Shortcuts card: chips to the pages you use most. A chip opens its page;
   Edit shows a × on each and a "+ Add a shortcut" picker (every nav page, its views and each
   topic). Saved as paths in dashboardConfig.shortcuts by the dashboard. */

const Head = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-subtle);
  h2 { margin: 0; ${cardLabel} }
  button { padding: 0; border: none; background: none; font-family: var(--font-sans); font-size: 14px; font-weight: 400; color: var(--text-muted); cursor: pointer; white-space: nowrap; transition: color 120ms; }
  button:hover { color: var(--color-accent-link); }
`;

const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
`;

const Pill = styled.span`
  display: inline-flex;
  align-items: center;
  height: 38px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--border-pill, var(--border-card)) 75%, transparent);
  transition: border-color 120ms;
  &:hover, &:focus-within { border-color: var(--color-accent-line); }
`;

const Go = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 100%;
  padding: 0 16px 0 14px;
  border: none;
  border-radius: 999px;
  background: transparent;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-secondary);
  cursor: pointer;
  &:hover { color: var(--color-accent-soft); }
  &:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
  [data-editing] & { padding-right: 4px; }
`;

const Glyph = styled.span`
  font-family: 'Material Symbols Outlined';
  font-weight: 300; /* = the wght below (Safari draws the variable font at the CSS weight) */
  font-style: normal;
  font-size: 18px;
  line-height: 1;
  letter-spacing: normal;
  text-transform: none;
  white-space: nowrap;
  -webkit-font-feature-settings: 'liga';
  -webkit-font-smoothing: antialiased;
  font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24;
`;

const Remove = styled.button`
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
  margin-right: 4px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-muted);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  &:hover { color: var(--color-danger, var(--text-primary)); }
  &:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 1px; }
`;

/* "+ Add a shortcut": a dashed pill with the real <select> invisible over it */
const Add = styled.label`
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 38px;
  padding: 0 16px;
  border-radius: 999px;
  border: 1px dashed var(--border-dashed, var(--border-card));
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
  cursor: pointer;
  &:hover, &:focus-within { border-color: var(--color-accent-line); color: var(--color-accent-soft); }
  select { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; font-size: 16px; }
`;

const Note = styled.p`
  margin: 0 0 14px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
`;

export function Shortcuts({ links, onChange }: { links: string[] | undefined; onChange: (next: string[]) => void }) {
  const navigate = useNavigate();
  const nav = useNavItems();
  const topics = useEntriesStore(s => s.allTopics);
  const catalog = useMemo(() => shortcutCatalog(nav, topics), [nav, topics]);
  const saved = useMemo(() => cleanShortcuts(links), [links]);
  const shown = useMemo(() => shownShortcuts(saved, catalog), [saved, catalog]);
  const names = useMemo(() => chipLabels(shown), [shown]);
  const addable = useMemo(() => addableShortcuts(saved, catalog), [saved, catalog]);
  const [editing, setEditing] = useState(false);
  // With nothing pinned yet, the picker shows straight away
  const picking = editing || shown.length === 0;

  const add = (path: string) => { if (path && saved.length < MAX_SHORTCUTS) onChange([...saved, path]); };
  const remove = (path: string) => onChange(saved.filter(p => p !== path));

  return (
    <section aria-label="Shortcuts">
      <Head>
        <h2>Shortcuts</h2>
        {shown.length > 0 && (
          <button type="button" aria-pressed={editing} onClick={() => setEditing(e => !e)}>{editing ? 'Done' : 'Edit'}</button>
        )}
      </Head>
      {shown.length === 0 && <Note>Pin the pages you use most for one tap.</Note>}
      <Chips data-editing={editing || undefined}>
        {shown.map(s => (
          <Pill key={s.path}>
            <Go type="button" onClick={() => navigate(s.path)}>
              <Glyph aria-hidden="true">{s.icon}</Glyph>{names.get(s.path) ?? s.label}
            </Go>
            {editing && <Remove type="button" aria-label={`Remove ${names.get(s.path) ?? s.label}`} onClick={() => remove(s.path)}>×</Remove>}
          </Pill>
        ))}
        {picking && saved.length < MAX_SHORTCUTS && addable.length > 0 && (
          <Add>
            <span aria-hidden="true">+</span> Add a shortcut
            <select aria-label="Add a shortcut" value="" onChange={e => add(e.target.value)}>
              <option value="" disabled>Add a shortcut…</option>
              {addable.map(g => (
                <optgroup key={g.group} label={g.group}>
                  {g.items.map(s => <option key={s.path} value={s.path}>{s.label}</option>)}
                </optgroup>
              ))}
            </select>
          </Add>
        )}
      </Chips>
    </section>
  );
}
