import { useId, useMemo, useState } from 'react';
import { AddChip, AddChipBox, Chips, RemoveChip } from './formKit.js';
import { sameTag, withTag, withoutTag, TAGS_PER_ENTRY } from '../../../utils/entryTags.js';

/*
 * An entry's own tags (text entries: the journal, a plain topic, a topic with
 * fields of the person's own): the tags it has, each an accent chip whose ×
 * takes it off, then "+ Add tag", which opens a box suggesting the tags
 * already in use (Enter or a comma adds one, Escape stops). Props only.
 */
export function EntryTagsField({ value, getSuggestions, onChange }: {
  value: string[];
  /** Tags used on other entries, offered as you type — read only while the add box is
      open (it walks the whole journal, so never on every render) */
  getSuggestions: () => string[];
  onChange: (tags: string[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const listId = useId();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- read once each time the box opens
  const suggestions = useMemo(() => (adding ? getSuggestions() : []), [adding]);
  const offered = suggestions.filter(s => !value.some(v => sameTag(v, s)));

  const commit = (keepOpen: boolean) => {
    const next = withTag(value, draft);
    if (next !== value) onChange(next);
    setDraft('');
    if (!keepOpen) setAdding(false);
  };

  return (
    <Chips role="group" aria-label="Tags">
      {value.map(t => (
        <RemoveChip key={t} type="button" $active aria-label={`Remove tag ${t}`} title="Remove" onClick={() => onChange(withoutTag(value, t))}>
          {t}
        </RemoveChip>
      ))}
      {adding ? (
        <>
          <AddChipBox autoFocus value={draft} maxLength={40} placeholder="Tag name" aria-label="New tag" list={listId}
            onChange={e => {
              // A comma ends a tag, so several can be typed in a row
              if (e.target.value.includes(',')) {
                const parts = e.target.value.split(',');
                let next = value;
                for (const p of parts.slice(0, -1)) next = withTag(next, p);
                if (next !== value) onChange(next);
                setDraft(parts[parts.length - 1]);
              } else setDraft(e.target.value);
            }}
            onBlur={() => commit(false)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commit(true); }
              if (e.key === 'Escape') { e.preventDefault(); setDraft(''); setAdding(false); }
            }} />
          <datalist id={listId}>{offered.map(s => <option key={s} value={s} />)}</datalist>
        </>
      ) : value.length < TAGS_PER_ENTRY && (
        <AddChip type="button" $active={false} onClick={() => setAdding(true)}>+ Add tag</AddChip>
      )}
    </Chips>
  );
}
