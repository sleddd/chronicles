import { useState, type KeyboardEvent } from 'react';
import { Chips, Chip, RemoveChip, AddChip, AddChipBox, TextAction } from './formKit.js';

/* One-of-a-list chips the person can add to and prune (goal categories; the
   same behaviour as a task's Type): tap one to pick it, tap it again to clear;
   "+ Add" saves a new one and picks it; "Edit" swaps the chips for ones with
   an × to remove. A value no longer in the list still shows. Props only. */

interface PickChipsProps {
  /** Names the group for assistive tech and the add box ("Category") */
  label: string;
  value: string;
  options: string[];
  onPick: (value: string) => void;
  /** Save a new option; omitted = no + Add */
  onAdd?: (label: string) => void;
  /** Remove an option; omitted = no Edit */
  onRemove?: (label: string) => void;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function PickChips({ label, value, options, onPick, onAdd, onRemove }: PickChipsProps) {
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const chosen = value.trim();
  const chips = chosen && !options.some(o => same(o, chosen)) ? [...options, chosen] : options;
  const noun = label.toLowerCase();

  const commit = () => {
    const name = draft.trim().replace(/\s+/g, ' ');
    if (name) { onAdd?.(name); onPick(name); }
    setDraft('');
    setAdding(false);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { setDraft(''); setAdding(false); }
  };

  if (editing) {
    return (
      <Chips aria-label={`Remove a ${noun}`}>
        {options.map(o => (
          <RemoveChip key={o} type="button" $active={false} aria-label={`Remove ${o}`} onClick={() => onRemove?.(o)}>{o}</RemoveChip>
        ))}
        <TextAction type="button" onClick={() => setEditing(false)}>Done</TextAction>
      </Chips>
    );
  }
  return (
    <Chips role="radiogroup" aria-label={label}>
      {chips.map(o => {
        const on = same(o, chosen);
        return (
          <Chip key={o} type="button" role="radio" aria-checked={on} $active={on} onClick={() => onPick(on ? '' : o)}>{o}</Chip>
        );
      })}
      {onAdd && (adding ? (
        <AddChipBox autoFocus value={draft} maxLength={40} placeholder={`New ${noun}`} aria-label={`New ${noun}`}
          onChange={e => setDraft(e.target.value)} onKeyDown={onKey} onBlur={commit} />
      ) : (
        <AddChip type="button" $active={false} onClick={() => setAdding(true)}>+ Add</AddChip>
      ))}
      {onRemove && options.length > 0 && !adding && (
        <TextAction type="button" onClick={() => setEditing(true)}>Edit</TextAction>
      )}
    </Chips>
  );
}
