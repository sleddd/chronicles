import { useState } from 'react';
import { Icon } from '../../atoms/core/Icon.jsx';
import { PillPick } from './TaskCardFields.js';
import { TaskList, TaskItem, AddLine, NewTaskBtn, NewTaskBox, Muted } from './MilestoneFields.js';

/* A goal's Habits row: the habits that are part of it (the name opens it, its target muted,
   a × takes it off the goal), then + New habit (named in place) and + Attach a habit.
   The same look as a milestone's Tasks row. Props only. */

export interface LinkedHabit {
  id: number;
  name: string;
  /** "3 times a week" */
  target: string;
  paused: boolean;
}

interface LinkedHabitsProps {
  habits: LinkedHabit[];
  /** Habits that could join it (not on this goal yet) */
  attachable: { id: number; name: string }[];
  onOpen: (id: number) => void;
  onDetach: (id: number) => void;
  onAttach: (id: number) => void;
  onCreate: (name: string) => void;
}

export function LinkedHabits({ habits, attachable, onOpen, onDetach, onAttach, onCreate }: LinkedHabitsProps) {
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState('');
  const create = () => {
    const name = draft.trim();
    if (name) onCreate(name);
    setDraft('');
    setNaming(false);
  };
  return (
    <div style={{ minWidth: 0 }}>
      {habits.length === 0 ? <Muted>No habits are part of this goal yet.</Muted> : (
        <TaskList>
          {habits.map(h => (
            <TaskItem key={h.id} $done={false}>
              <button type="button" className="title" onClick={() => onOpen(h.id)}>
                {h.name}
                <span style={{ color: 'var(--text-muted)' }}> · {h.paused ? 'Paused' : h.target}</span>
              </button>
              <button type="button" className="x" aria-label={`Take "${h.name}" off this goal`} title="Take off this goal"
                onClick={() => onDetach(h.id)}>
                <Icon name="x" size={14} strokeWidth={2} />
              </button>
            </TaskItem>
          ))}
        </TaskList>
      )}
      <AddLine>
        {naming ? (
          <NewTaskBox>
            <input autoFocus value={draft} placeholder="New habit" aria-label="New habit"
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); create(); }
                if (e.key === 'Escape') { e.preventDefault(); setDraft(''); setNaming(false); }
              }} />
            <button type="button" aria-label="Add the habit" title="Add" onClick={create}><Icon name="check" size={14} strokeWidth={2} /></button>
            <button type="button" aria-label="Cancel new habit" title="Cancel" onClick={() => { setDraft(''); setNaming(false); }}>
              <Icon name="x" size={14} strokeWidth={2} />
            </button>
          </NewTaskBox>
        ) : (
          <NewTaskBtn type="button" onClick={() => setNaming(true)}><Icon name="plus" size={14} strokeWidth={2} /> New habit</NewTaskBtn>
        )}
        {attachable.length > 0 && (
          <PillPick>
            <span className="value">+ Attach a habit</span>
            <Icon name="chevron-down" size={14} strokeWidth={2} />
            <select aria-label="Attach a habit" value=""
              onChange={e => { if (e.target.value) onAttach(parseInt(e.target.value, 10)); }}>
              <option value="">Attach a habit…</option>
              {attachable.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </PillPick>
        )}
      </AddLine>
    </div>
  );
}
