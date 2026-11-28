import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import { Icon } from '../../atoms/core/Icon.jsx';
import { Checkbox } from '../../atoms/core/Checkbox.jsx';
import { MaterialIcon } from '../../atoms/MaterialIcon.js';
import { Toggle } from '../../atoms/Toggle.js';
import type { TaskFieldValues } from '../../../types/fields.js';
import type { GoalOption, MilestoneOption } from '../../../types/ui.js';
import { BoxText, BoxInput } from './formKit.js';
import { cardLabel } from '../../../styles/cardLabel.js';
import { sameTaskType } from '../../../utils/taskTypes.js';
import { checklistOf } from '../../../utils/taskLists.js';
import { usePopover } from '../../../hooks/usePopover.js';
import { ChecklistSection } from './ChecklistSection.js';
import { taskStatusOf, taskFieldsForStatus, type TaskStatus } from '../../../types/goals.js';
import { toDateStr } from '../../../utils/dateUtils.js';
import { estimateLabel, estimateOf, parseEstimate } from '../../../utils/planner.js';
import {
  blockersOf, withBlocker, withoutBlocker, isBlockerCleared, blockerLabel, BLOCKERS_PER_TASK, BLOCKER_NOTE_MAX,
  type BlockerTask, type TaskBlocker,
} from '../../../utils/taskBlockers.js';

/* The task card (journal and Quick entry): a header with the topic picker and the
   Single task | To-do list switch, the title in a box with its Priority and tools, then
   label-left rows — To-dos (a to-do list's items), Status, Contributes to (goal, milestone
   and the task's type), Blocked by (other tasks or short notes it's waiting on), Time
   estimate, When (starts and ends, All day, Auto-migrate and the timer) and Notes. Props only. */

const PRIORITIES: { value: TaskFieldValues['priority']; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

const STATUSES: { value: TaskStatus; label: string; dot: string }[] = [
  { value: 'backlog', label: 'Idea / Backlog', dot: 'var(--text-muted)' },
  { value: 'todo', label: 'Planned', dot: 'var(--text-secondary)' },
  { value: 'in_progress', label: 'In progress', dot: 'var(--chart-amber)' },
  { value: 'done', label: 'Completed', dot: 'var(--color-accent)' },
];

const NEW_TYPE = '__new_type__';

/* ── The card's pieces ── */

/* When (an event's look): WHEN with All day under it, and one outlined box of Starts / Deadline rows,
   each a date | time */
const WhenName = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 14px;
  padding-top: 6px;
  @container entrycard (max-width: 560px) { flex-direction: row; align-items: center; justify-content: space-between; width: 100%; padding-top: 0; }
`;

const AllDay = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 12px;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-soft);
`;

export const WhenBox2 = styled.div`
  border: 1px solid var(--border-card);
  border-radius: 10px;
  overflow: hidden;
  & > * + * { border-top: 1px solid var(--border-card); }
`;

export const WhenLine = styled.div<{ $allDay: boolean }>`
  display: grid;
  grid-template-columns: 84px minmax(0, 1.5fr) ${({ $allDay }) => ($allDay ? '' : 'minmax(0, 1fr)')};
  align-items: stretch;
  @media (max-width: 560px) { grid-template-columns: 64px minmax(0, 1fr) ${({ $allDay }) => ($allDay ? '' : 'minmax(0, 1fr)')}; }
`;

export const WhenLabel = styled.span`
  display: flex;
  align-items: center;
  padding-left: 16px;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-muted);
`;

export const DateTimeInput = styled.input`
  && {
    width: 100%;
    min-width: 0;
    height: 48px;
    padding: 0 16px;
    border: none !important;
    background: transparent !important;
    outline: none;
    font-family: var(--font-sans);
    font-size: 16px;
    color: var(--text-secondary);
    color-scheme: light dark;
  }
  /* The native picker icon in the muted grey */
  &::-webkit-calendar-picker-indicator { opacity: 0.55; cursor: pointer; }
`;

export const TimeCell = styled.div`
  border-left: 1px solid var(--border-card);
`;

/* A small note under the box */
const WhenNote = styled.p`
  margin: 8px 0 0 2px;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-muted);
`;

/* Under the box: Auto-migrate on the left, the timer on the right */
const WhenTail = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  .migrate { margin-left: 2px; font-family: var(--font-sans); font-size: 15px; color: var(--text-secondary); }
  .migrate .ch-check__label { color: var(--text-secondary); font-size: 15px; }
  .migrate .ch-check__box, .migrate .ch-check__box svg { width: 14px; height: 14px; }
`;

/* A row: its name (small tracked capitals) on the left, the field on the right */
export const TaskRow = styled.div`
  display: grid;
  /* Wide enough for the longest name, "Contributes to", on one line */
  /* The field never wider than 600px beside its name, like every topic's fields (EntryForm's FIELD_MAX) */
  grid-template-columns: 140px minmax(0, 600px);
  column-gap: 24px;
  align-items: center;
  min-height: 50px;
  padding: 10px 0;
  position: relative; /* phones: the timer sits in Planned's top-right corner */
  & + & { border-top: 1px solid var(--border-subtle); }
  @container entrycard (max-width: 560px) {
    grid-template-columns: minmax(0, 1fr);
    row-gap: 10px;
    /* Short fields (Priority) stay beside their name */
    &[data-inline] { grid-template-columns: 72px minmax(0, 1fr); column-gap: 12px; }
    /* Type: Goal over Type beside the name, the name level with the first of them */
    &[data-stack] { align-items: start; }
    &[data-stack] > :first-child { line-height: 16px; padding-top: 3px; }
  }
`;

export const TaskRowName = styled.div`
  ${cardLabel}
  font-size: 12px;
  font-weight: 400; /* not bold */
  color: var(--text-soft);
`;

/* A picker as words: "Goal: Chronicles · No milestone ⌄" — the real <select> lies invisibly over it */
const Pick = styled.label`
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-primary);
  cursor: pointer;
  .name { color: var(--text-muted); margin-right: 6px; }
  .value { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  svg { flex: none; color: var(--text-muted); }
  &:hover svg { color: var(--text-primary); }
  select {
    position: absolute;
    inset: 0;
    width: 100%;
    opacity: 0;
    cursor: pointer;
    font-size: 16px; /* iOS: no zoom on focus */
  }
  /* Keyboard focus: the neutral ring round the drawn picker (the select itself is invisible) */
  &:focus-within .value, &:focus-within svg { color: var(--text-primary); }
  &:has(select:focus-visible) { outline: 2px solid var(--focus-ring); outline-offset: 3px; border-radius: 999px; }
  select:focus, select:focus-visible { outline: none !important; }
`;

const Picks = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  min-width: 0;
  /* Phones: one over the other, lined up with the fields in the rows below */
  @media (max-width: 640px) { flex-direction: column; align-items: flex-start; gap: 10px; & > * { max-width: 100%; } }
`;

const TimerBtn = styled.button<{ $running: boolean }>`
  margin-left: auto;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: none;
  color: var(--color-accent);
  cursor: pointer;
  ${({ $running }) => ($running ? 'animation: taskTimerPulse 1.6s ease-in-out infinite;' : '')}
  @keyframes taskTimerPulse { 50% { opacity: 0.55; } }
  &:hover { background: var(--bg-hover); }
  &:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
`;

const TimerPop = styled.div`
  position: fixed;
  z-index: 1000;
  width: min(380px, calc(100vw - 32px));
  max-height: min(70vh, 520px);
  overflow-y: auto;
  padding: 16px 18px 18px;
  border: 1px solid var(--border-pop);
  border-radius: 14px;
  background: var(--bg-tile);
  box-shadow: var(--shadow-lg);
`;

const TypeBox = styled.input`
  && {
    width: 180px;
    height: 34px;
    padding: 0 12px;
    border: 1px solid var(--color-accent-line);
    border-radius: 8px;
    background: transparent;
    font-family: var(--font-sans);
    font-size: 15px;
    color: var(--text-primary);
  }
`;

/* "+ New type…": the name box with a × to cancel */
const NewType = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
`;

const ClearType = styled.button`
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  &:hover { color: var(--text-primary); background: var(--bg-hover); }
`;

/* Goal and Type: the picker in an outlined pill */
export const PillPick = styled(Pick)`
  height: 36px;
  padding: 0 14px 0 16px;
  border: 1px solid var(--border-card);
  border-radius: 999px;
  &:hover { border-color: var(--border-default); }
`;

/* Status in a field row: the outlined pill with its dot */
const StatusPillPick = styled(PillPick)`
  gap: 10px;
  .dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
`;

/* A picker in the title box's foot: its name and the choice (no pill) — Priority, Category, Goal */
export const FootPickBox = styled(Pick)`
  gap: 10px;
  font-size: 15px;
  .value { font-weight: 500; }
`;

/** The Status picker of a field row: an outlined pill with the status dot and the choice ⌄ (the row already says "Status") */
export function StatusDropdown<T extends string>({ value, options, onChange }: {
  value: T; options: { value: T; label: string; dot: string }[]; onChange: (v: T) => void;
}) {
  const s = options.find(x => x.value === value) ?? options[0];
  return (
    <div>
      <StatusPillPick>
        <span className="dot" style={{ background: s.dot }} aria-hidden="true" />
        <span className="value">{s.label}</span>
        <Icon name="chevron-down" size={14} strokeWidth={2} />
        <select aria-label="Status" value={value} onChange={e => onChange(e.target.value as T)}>
          {options.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
        </select>
      </StatusPillPick>
    </div>
  );
}

/** A picker for the title box's foot with no dot: its name and the choice ⌄ (a meal's Breakfast / Lunch…) */
export function FootPick<T extends string>({ name, value, options, placeholder, onChange }: {
  name: string; value: T | ''; options: { value: T; label: string }[]; placeholder: string; onChange: (v: T) => void;
}) {
  const chosen = options.find(x => x.value === value);
  return (
    <FootPickBox>
      <span className="name">{name}</span>
      <span className="value">{chosen?.label ?? placeholder}</span>
      <Icon name="chevron-down" size={14} strokeWidth={2} />
      <select aria-label={name} value={chosen ? value : ''} onChange={e => onChange(e.target.value as T)}>
        {!chosen && <option value="">{placeholder}</option>}
        {options.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
      </select>
    </FootPickBox>
  );
}

/** The task's Status, for its field row */
export function TaskStatusPick({ values, onChange }: { values: TaskFieldValues; onChange: (v: TaskFieldValues) => void }) {
  const status = taskStatusOf(values as unknown as Record<string, unknown>);
  return <StatusDropdown value={status} options={STATUSES}
    onChange={v => onChange({ ...values, ...taskFieldsForStatus(v as TaskStatus) })} />;
}

/** The task's Priority, for the title box's foot strip (Status has the row under the title) */
export function TaskPriorityPick({ values, onChange }: { values: TaskFieldValues; onChange: (v: TaskFieldValues) => void }) {
  const priority = PRIORITIES.some(p => p.value === values.priority) ? values.priority : 'none';
  return <FootPick name="Priority" value={priority} options={PRIORITIES} placeholder="None"
    onChange={p => onChange({ ...values, priority: p as TaskFieldValues['priority'] })} />;
}

/* Single task | To-do list: a pill pair beside the picker, the chosen one lifted */
const FormatPair = styled.div`
  display: inline-flex;
  padding: 3px;
  border: 1px solid var(--border-card);
  border-radius: 999px;
  button {
    height: 32px;
    padding: 0 14px;
    border: none;
    border-radius: 999px;
    background: none;
    font-family: var(--font-sans);
    font-size: 14px;
    color: var(--text-muted);
    cursor: pointer;
    white-space: nowrap;
  }
  button[aria-checked='true'] { background: var(--bg-tab-active); color: var(--text-primary); }
  button:hover:not([aria-checked='true']) { color: var(--text-primary); }
  button:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 1px; }
`;

export function TaskFormatToggle({ values, onChange }: { values: TaskFieldValues; onChange: (v: TaskFieldValues) => void }) {
  const isList = values.taskFormat === 'list';
  return (
    <FormatPair role="radiogroup" aria-label="Format">
      {([['single', 'Single task'], ['list', 'To-do list']] as const).map(([v, label]) => (
        <button key={v} type="button" role="radio" aria-checked={(isList ? 'list' : 'single') === v}
          onClick={() => onChange({ ...values, taskFormat: v })}>{label}</button>
      ))}
    </FormatPair>
  );
}


/* ── Blocked by: what the task is waiting on ── */

const Blockers = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
`;

const BlockerList = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--border-card);
  border-radius: 10px;
  & > li + li { border-top: 1px solid var(--border-card); }
`;

/* One blocker: its name, and × to take it off. A task that's done (or gone) is shown muted and struck through */
const BlockerItem = styled.li<{ $cleared: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 4px 6px 4px 16px;
  font-family: var(--font-sans);
  font-size: 15px;
  color: ${({ $cleared }) => ($cleared ? 'var(--text-muted)' : 'var(--text-primary)')};
  .label {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
    text-decoration: ${({ $cleared }) => ($cleared ? 'line-through' : 'none')};
  }
`;

const BlockerAdd = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  min-width: 0;
  & > input { flex: 1 1 220px; min-width: 0; }
`;

/** Blocked by: the tasks and notes this task is waiting on, each with × to take it off, then a
    picker of the other open tasks and a box for a short note. At most BLOCKERS_PER_TASK */
export function BlockedBy({ values, onChange, tasks = [], selfId = null }: {
  values: TaskFieldValues;
  onChange: (values: TaskFieldValues) => void;
  /** Every task (the open ones are offered; the rest say whether a blocker has cleared) */
  tasks?: BlockerTask[];
  /** This task's own id: never offered as its own blocker */
  selfId?: number | null;
}) {
  const [note, setNote] = useState('');
  const blockers = blockersOf(values as unknown as Record<string, unknown>);
  const byId = new Map(tasks.map(t => [t.id, t]));
  const save = (next: TaskBlocker[]) => { if (next !== blockers) onChange({ ...values, blockers: next }); };
  const offered = tasks.filter(t => !t.isCompleted && t.id !== selfId && !blockers.some(b => b.taskId === t.id));
  const addNote = () => {
    if (note.trim()) save(withBlocker(blockers, { note }));
    setNote('');
  };
  const full = blockers.length >= BLOCKERS_PER_TASK;
  return (
    <Blockers>
      {blockers.length > 0 && (
        <BlockerList aria-label="Blocked by">
          {blockers.map(b => {
            const cleared = isBlockerCleared(b, byId);
            const label = blockerLabel(b, byId);
            return (
              <BlockerItem key={b.id} $cleared={cleared}>
                <span className="label">
                  {label}
                  {cleared && byId.has(b.taskId ?? -1) && <span className="sr-only"> (done)</span>}
                </span>
                <ClearType type="button" aria-label={`Take “${label}” off Blocked by`} title="Remove"
                  onClick={() => save(withoutBlocker(blockers, b.id))}>
                  <Icon name="x" size={14} strokeWidth={2} />
                </ClearType>
              </BlockerItem>
            );
          })}
        </BlockerList>
      )}
      {!full && (
        <BlockerAdd>
          {offered.length > 0 && (
            <PillPick>
              <span className="name">Task:</span>
              <span className="value">Pick one</span>
              <Icon name="chevron-down" size={14} strokeWidth={2} />
              <select aria-label="Blocked by a task" value=""
                onChange={e => { if (e.target.value) save(withBlocker(blockers, { taskId: parseInt(e.target.value, 10) }, { selfId })); }}>
                <option value="">Pick a task</option>
                {offered.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </PillPick>
          )}
          <BoxInput aria-label="Blocked by a note" placeholder="Or a short note, e.g. Waiting on the landlord" value={note}
            maxLength={BLOCKER_NOTE_MAX} onChange={e => setNote(e.target.value)} onBlur={addNote}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); addNote(); }
              if (e.key === 'Escape') { e.preventDefault(); setNote(''); }
            }} />
        </BlockerAdd>
      )}
    </Blockers>
  );
}

interface TaskCardRowsProps {
  values: TaskFieldValues;
  onChange: (values: TaskFieldValues) => void;
  goalOptions?: GoalOption[];
  milestoneOptions?: MilestoneOption[];
  /** Every task, for Blocked by (the open ones are offered) */
  blockerTasks?: BlockerTask[];
  /** This task's id, so it isn't offered as its own blocker */
  selfId?: number | null;
  types?: string[];
  onAddType?: (label: string) => void;
  /** The timer (view time, start, add time), shown from the stopwatch under When */
  timer?: ReactNode;
  timerRunning?: boolean;
}

/** The task card's rows under the title: To-dos (a to-do list's items), Status, Contributes to, Blocked by, Time estimate, When, Notes */
export function TaskCardRows({ values, onChange, goalOptions = [], milestoneOptions = [], blockerTasks, selfId = null, types = [], onAddType, timer, timerRunning = false }: TaskCardRowsProps) {
  const set = (patch: Partial<TaskFieldValues>) => onChange({ ...values, ...patch });
  const isList = values.taskFormat === 'list';
  const goalOf = (m: MilestoneOption) => (m as MilestoneOption & { parentGoalId?: number | null }).parentGoalId ?? null;

  /* Goal and Milestone, each its own picker: the milestones offered are the chosen goal's (all of
     them while no goal is chosen); picking a milestone sets its goal, and a new goal drops a
     milestone that isn't under it */
  const goal = goalOptions.find(g => g.id === values.parentGoalId);
  const milestone = milestoneOptions.find(m => m.id === values.parentMilestoneId);
  const milestoneList = goal ? milestoneOptions.filter(m => goalOf(m) === goal.id) : milestoneOptions;
  const pickGoal = (v: string) => {
    const id = v ? parseInt(v, 10) : null;
    const keep = milestone && id !== null && goalOf(milestone) === id;
    set({ parentGoalId: id, parentMilestoneId: keep ? milestone.id : null });
  };
  const pickMilestone = (v: string) => {
    if (!v) { set({ parentMilestoneId: null }); return; }
    const m = milestoneOptions.find(x => x.id === parseInt(v, 10));
    set({ parentMilestoneId: m?.id ?? null, parentGoalId: m && goalOf(m) ? goalOf(m) : values.parentGoalId });
  };

  /* Estimate: how long it's expected to take */
  const estimate = estimateOf(values as unknown as Record<string, unknown>);

  /* Type: the list, "No type", and "+ New type…" (a name box in its place) */
  const taskType = values.taskType?.trim() ?? '';
  const typeList = taskType && !types.some(t => sameTaskType(t, taskType)) ? [...types, taskType] : types;
  const [naming, setNaming] = useState(false);
  const [typeDraft, setTypeDraft] = useState('');
  const commitType = () => {
    const label = typeDraft.trim().replace(/\s+/g, ' ');
    if (label) { onAddType?.(label); set({ taskType: label }); }
    setTypeDraft(''); setNaming(false);
  };

  return (
    <>
      {isList && (
        <TaskRow style={{ alignItems: 'start', paddingBottom: 22 }}>
          <TaskRowName style={{ paddingTop: 14 }}>To-dos</TaskRowName>
          <ChecklistSection label="" noun="to-do" tickSize={16} noCount
            items={checklistOf(values as unknown as Record<string, unknown>)} onChange={checklist => set({ checklist })} />
        </TaskRow>
      )}

      {/* Status comes first under the title, where it's reached for; Priority is in the title box's foot */}
      <TaskRow data-inline="" style={{ paddingTop: 20, paddingBottom: 16 }}>
        <TaskRowName>Status</TaskRowName>
        <Picks>
          <TaskStatusPick values={values} onChange={onChange} />
        </Picks>
      </TaskRow>

      <TaskRow data-inline="" data-stack="" style={{ paddingTop: 16, paddingBottom: 22 }}>
        <TaskRowName>Contributes to</TaskRowName>
        <Picks>
          <PillPick>
            <span className="name">Goal:</span>
            <span className="value">{goal?.title ?? 'None'}</span>
            <Icon name="chevron-down" size={14} strokeWidth={2} />
            <select aria-label="Goal" value={goal ? String(goal.id) : ''} onChange={e => pickGoal(e.target.value)}>
              <option value="">None</option>
              {goalOptions.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
            </select>
          </PillPick>
          <PillPick>
            <span className="name">Milestone:</span>
            <span className="value">{milestone?.title ?? 'None'}</span>
            <Icon name="chevron-down" size={14} strokeWidth={2} />
            <select aria-label="Milestone" value={milestone ? String(milestone.id) : ''} onChange={e => pickMilestone(e.target.value)}>
              <option value="">None</option>
              {/* A milestone it's on stays listed even when it's under another goal */}
              {(milestone && !milestoneList.includes(milestone) ? [milestone, ...milestoneList] : milestoneList)
                .map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
            </select>
          </PillPick>
          {naming ? (
            <NewType>
              <TypeBox autoFocus value={typeDraft} maxLength={40} placeholder="New type" aria-label="New type"
                onChange={e => setTypeDraft(e.target.value)} onBlur={commitType}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); commitType(); }
                  if (e.key === 'Escape') { e.preventDefault(); setTypeDraft(''); setNaming(false); }
                }} />
              {/* Changed your mind: back to the list, nothing added (pressed before the box loses focus,
                  so leaving it doesn't save what was typed) */}
              <ClearType type="button" aria-label="Cancel new type" title="Cancel"
                onMouseDown={e => e.preventDefault()} onClick={() => { setTypeDraft(''); setNaming(false); }}>
                <Icon name="x" size={14} strokeWidth={2} />
              </ClearType>
            </NewType>
          ) : (
            <PillPick>
              <span className="name">Type:</span>
              <span className="value">{taskType || 'None'}</span>
              <Icon name="chevron-down" size={14} strokeWidth={2} />
              <select aria-label="Type" value={typeList.find(t => sameTaskType(t, taskType)) ?? ''}
                onChange={e => { if (e.target.value === NEW_TYPE) setNaming(true); else set({ taskType: e.target.value }); }}>
                <option value="">None</option>
                {typeList.map(t => <option key={t} value={t}>{t}</option>)}
                {onAddType && <option value={NEW_TYPE}>+ New type…</option>}
              </select>
            </PillPick>
          )}
        </Picks>
      </TaskRow>

      {/* Blocked by: other tasks or short notes it's waiting on (a quiet line on its cards while any is open) */}
      <TaskRow style={{ alignItems: 'start', paddingTop: 16, paddingBottom: 18 }}>
        <TaskRowName style={{ paddingTop: 12 }}>Blocked by</TaskRowName>
        <BlockedBy values={values} onChange={onChange} tasks={blockerTasks} selfId={selfId} />
      </TaskRow>

      {/* Estimate: how long it should take (shown on its board card; the Planner sizes it by this
          until it's given a length of its own; AI planning reads it) */}
      <TaskRow data-inline="" style={{ paddingTop: 16, paddingBottom: 16 }}>
        <TaskRowName>Time estimate</TaskRowName>
        <EstimateBox value={estimate} onChange={m => set({ estimatedMinutes: m })} />
      </TaskRow>

      {/* When: Starts (the day it's planned for, and a time) and Deadline (and a time) in one box,
          like an event's. All day drops the times */}
      <TaskRow style={{ alignItems: 'start', paddingTop: 20, paddingBottom: 18 }}>
        <WhenName>
          <TaskRowName>When</TaskRowName>
          <AllDay>
            All day
            <Toggle checked={!!values.allDay} aria-label="All day"
              onChange={v => set(v ? { allDay: true, scheduledTime: '', deadlineTime: '' } : { allDay: false })} />
          </AllDay>
        </WhenName>
        <div>
          <WhenBox2>
            <WhenLine $allDay={!!values.allDay}>
              <WhenLabel>Starts</WhenLabel>
              <DateTimeInput type="date" aria-label="Planned for" value={values.scheduledDate ?? ''}
                onChange={e => set({ scheduledDate: e.target.value, ...(e.target.value ? {} : { scheduledTime: '' }) })} />
              {!values.allDay && (
                <TimeCell>
                  {/* A time with no day yet plans it for its deadline's day, else today */}
                  <DateTimeInput type="time" step={900} aria-label="Planned time" value={values.scheduledTime ?? ''}
                    onChange={e => set({
                      scheduledTime: e.target.value,
                      ...(e.target.value && !values.scheduledDate ? { scheduledDate: values.deadline || toDateStr(new Date()) } : {}),
                    })} />
                </TimeCell>
              )}
            </WhenLine>
            <WhenLine $allDay={!!values.allDay}>
              <WhenLabel>Deadline</WhenLabel>
              <DateTimeInput type="date" aria-label="Deadline" value={values.deadline}
                onChange={e => set({ deadline: e.target.value, ...(e.target.value ? {} : { deadlineTime: '' }) })} />
              {!values.allDay && (
                <TimeCell>
                  <DateTimeInput type="time" step={900} aria-label="Deadline time" value={values.deadlineTime ?? ''}
                    onChange={e => set({ deadlineTime: e.target.value, ...(e.target.value && !values.deadline ? { deadline: values.scheduledDate || toDateStr(new Date()) } : {}) })} />
                </TimeCell>
              )}
            </WhenLine>
          </WhenBox2>
          <WhenNote>To set deadline just set the end date only.</WhenNote>
          {/* Auto-migrate on the left, the timer on the right */}
          <WhenTail>
            <span className="migrate">
              <Checkbox checked={values.isAutoMigrating} label="Auto-migrate"
                title="Move to tomorrow if unfinished" onChange={() => set({ isAutoMigrating: !values.isAutoMigrating })} />
            </span>
            {timer && <TimerPopButton timer={timer} running={timerRunning} />}
          </WhenTail>
        </div>
      </TaskRow>

      <TaskRow style={{ alignItems: 'start', paddingTop: 14 }}>
        <TaskRowName style={{ paddingTop: 14 }}>Notes</TaskRowName>
        <BoxText value={values.notes ?? ''} placeholder="Additional details" aria-label="Notes"
          style={{ minHeight: 96 }} onChange={e => set({ notes: e.target.value })} />
      </TaskRow>

    </>
  );
}

/** The stopwatch that opens an entry's Time panel (view the time, start a timer, add time) in a
    floating panel under it — the task card's When and the exercise form's Duration */
export function TimerPopButton({ timer, running = false }: { timer: ReactNode; running?: boolean }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const width = Math.min(380, window.innerWidth - 32);
    setPlace({ top: r.bottom + 8, left: Math.max(16, Math.min(r.right - width, window.innerWidth - width - 16)) });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !btn.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => { document.removeEventListener('mousedown', away); };
  }, [open]);
  // Keyboard: into the panel, Escape back to the stopwatch, focus leaving closes it
  usePopover({ open, onClose: () => setOpen(false), triggerRef: btn, panelRef: pop });
  return (
    <>
      <TimerBtn ref={btn} type="button" $running={running} aria-expanded={open} aria-haspopup="dialog"
        aria-label={running ? 'Timer running: view time' : 'Time: view, start a timer or add time'} title="Time"
        onClick={() => setOpen(o => !o)}>
        <MaterialIcon $size={22} aria-hidden="true">timer</MaterialIcon>
      </TimerBtn>
      {open && place && createPortal(
        <TimerPop ref={pop} role="dialog" aria-label="Time" style={place}>
          {timer}
        </TimerPop>,
        document.body,
      )}
    </>
  );
}

/* Time estimate as a typed box: "45 min", "1.5 h", "1 h 30 min", "2 days" (a bare number is
   minutes). Read when it's left or on Enter and shown back in the app's words; blank clears it,
   something it can't read puts the last value back with a note */
function EstimateBox({ value, onChange }: { value: number | undefined; onChange: (minutes: number | undefined) => void }) {
  const shown = value ? estimateLabel(value) : '';
  const [draft, setDraft] = useState(shown);
  const [editing, setEditing] = useState(false);
  const [bad, setBad] = useState(false);
  const cancelled = useRef(false);
  const noteId = useId();
  useEffect(() => { if (!editing) setDraft(shown); }, [shown, editing]);
  const commit = () => {
    setEditing(false);
    if (cancelled.current) { cancelled.current = false; setDraft(shown); return; }
    const m = parseEstimate(draft);
    if (m === undefined) { setBad(true); setDraft(shown); return; }
    setBad(false);
    if ((m ?? undefined) !== value) onChange(m ?? undefined);
    setDraft(m ? estimateLabel(m) : '');
  };
  return (
    <EstimateWrap>
      <BoxInput aria-label="Time estimate" placeholder="e.g. 45 min, 1.5 h, 2 days" value={draft}
        aria-invalid={bad || undefined} aria-describedby={bad ? noteId : undefined}
        onFocus={() => { setEditing(true); setBad(false); }}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
          if (e.key === 'Escape') { e.preventDefault(); cancelled.current = true; (e.target as HTMLInputElement).blur(); }
        }} />
      {bad && <EstimateNote id={noteId} role="status">Try a time like 45 min, 1.5 h or 2 days.</EstimateNote>}
    </EstimateWrap>
  );
}

const EstimateWrap = styled.div`
  width: 100%;
  max-width: 260px;
`;

const EstimateNote = styled.p`
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--text-muted);
`;
