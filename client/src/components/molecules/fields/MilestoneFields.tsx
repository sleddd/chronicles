import { useId, useState, type ReactNode } from 'react';
import styled from 'styled-components';
import { Icon } from '../../atoms/core/Icon.jsx';
import { Checkbox } from '../../atoms/core/Checkbox.jsx';
import type { MilestoneFieldValues } from '../../../types/fields.js';
import type { GoalOption, LinkedTask } from '../../../types/ui.js';
import {
  FormWrap, Section, SectionHead, SectionLabel, TitleInput, RowBox, LabelledRow, RowLabel, BoxText,
} from './formKit.js';
import { PillPick, StatusDropdown, WhenBox2, WhenLine, WhenLabel, DateTimeInput, TimerPopButton } from './TaskCardFields.js';
export type { MilestoneFieldValues } from '../../../types/fields.js';

/* Milestone fields — the same form in the journal editor and Quick Entry: the
   objective as the text's first line, its Status in the text box's foot strip
   (MilestoneStatusPick, like a task's and a goal's); then rows — Goal (a pill
   dropdown), When (Starts = the start date, Ends = the target date, the two ends
   of its roadmap bar, with the stopwatch in the row's top-right corner), Tasks
   (the tasks attached to it: tick, open, detach, and + Attach a task) — then Notes. */

const STATUSES: { value: MilestoneFieldValues['milestoneStatus']; label: string; dot: string }[] = [
  { value: 'not_started', label: 'Not started', dot: 'var(--text-muted)' },
  { value: 'in_progress', label: 'In progress', dot: 'var(--chart-amber)' },
  { value: 'completed', label: 'Done', dot: 'var(--color-accent)' },
];

const statusOf = (v: MilestoneFieldValues): MilestoneFieldValues['milestoneStatus'] =>
  // Done wins; a board-only "planned" (or anything unknown) shows as Not started
  v.isCompleted ? 'completed' : v.milestoneStatus === 'in_progress' ? 'in_progress' : 'not_started';

/** The milestone's Status, for the text box's foot strip (like a task's) */
export function MilestoneStatusPick({ values, onChange }: { values: MilestoneFieldValues; onChange: (v: MilestoneFieldValues) => void }) {
  return (
    <StatusDropdown value={statusOf(values)} options={STATUSES}
      onChange={s => onChange({ ...values, milestoneStatus: s, isCompleted: s === 'completed' })} />
  );
}

/* The attached tasks: a tick, the title (opens it), a × to detach; then + Attach a task */
const TaskList = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
`;

const TaskItem = styled.div<{ $done: boolean }>`
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 40px;
  & + & { border-top: 1px solid var(--border-subtle); }
  .title {
    flex: 1;
    min-width: 0;
    padding: 0;
    border: none;
    background: none;
    text-align: left;
    font-family: var(--font-sans);
    font-size: 15px;
    color: ${({ $done }) => ($done ? 'var(--text-muted)' : 'var(--text-secondary)')};
    text-decoration: ${({ $done }) => ($done ? 'line-through' : 'none')};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }
  .title:hover { color: var(--text-primary); }
  .x {
    display: grid; place-items: center; width: 28px; height: 28px; padding: 0;
    border: none; border-radius: 50%; background: none; color: var(--text-muted); cursor: pointer;
  }
  .x:hover { color: var(--text-primary); background: var(--bg-hover); }
`;

/* + New task and + Attach a task, side by side under the list */
const AddLine = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
`;

const NewTaskBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 16px;
  border: 1px solid var(--border-card);
  border-radius: 999px;
  background: none;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-primary);
  cursor: pointer;
  svg { color: var(--text-muted); }
  &:hover { border-color: var(--border-default); }
`;

const NewTaskBox = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  input {
    width: 220px;
    height: 36px;
    padding: 0 12px;
    border: 1px solid var(--color-accent-line) !important;
    border-radius: 999px;
    background: transparent;
    font-family: var(--font-sans);
    font-size: 15px;
    color: var(--text-primary);
  }
  button {
    display: grid; place-items: center; width: 28px; height: 28px; padding: 0;
    border: none; border-radius: 50%; background: none; color: var(--text-muted); cursor: pointer;
  }
  button:hover { color: var(--text-primary); background: var(--bg-hover); }
`;

const Muted = styled.p`
  margin: 0 0 10px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
`;

interface MilestoneFieldsProps {
  values: MilestoneFieldValues;
  onChange: (values: MilestoneFieldValues) => void;
  goalOptions: GoalOption[];
  /** The tasks attached to this milestone */
  linkedTasks?: LinkedTask[];
  /** Tasks that could be attached (not on this milestone yet, not done) */
  attachableTasks?: { id: number; title: string }[];
  onToggleTaskComplete?: (taskId: number, completed: boolean) => void;
  onUnlinkTask?: (taskId: number) => void;
  onLinkTask?: (taskId: number) => void;
  onOpenTask?: (taskId: number) => void;
  /** Make a task (from its name) already attached to this milestone */
  onCreateTask?: (title: string) => void;
  /** The milestone's Time panel, opened from a stopwatch in the When row's top-right corner */
  timer?: ReactNode;
  timerRunning?: boolean;
}

export function MilestoneFields({
  values, onChange, goalOptions, linkedTasks = [], attachableTasks = [],
  onToggleTaskComplete, onUnlinkTask, onLinkTask, onOpenTask, onCreateTask, timer, timerRunning,
}: MilestoneFieldsProps) {
  const set = (patch: Partial<MilestoneFieldValues>) => onChange({ ...values, ...patch });
  const notesId = useId();
  const goal = goalOptions.find(g => g.id === values.parentGoalId);
  // + New task: a name box in place of the button (Enter makes it, Escape or × cancels)
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState('');
  const createTask = () => {
    const title = draft.trim();
    if (title) onCreateTask?.(title);
    setDraft(''); setNaming(false);
  };

  return (
    <FormWrap>
      <Section>
        <TitleInput
          value={values.milestoneObjective ?? ''}
          onChange={e => set({ milestoneObjective: e.target.value })}
          placeholder="What does this milestone accomplish?"
          aria-label="Milestone"
        />
      </Section>

      <RowBox style={{ marginTop: 30 }}>
        <LabelledRow>
          <RowLabel>Goal</RowLabel>
          <div>
            <PillPick>
              <span className="value">{goal?.title ?? 'No goal'}</span>
              <Icon name="chevron-down" size={14} strokeWidth={2} />
              <select aria-label="Goal" value={values.parentGoalId?.toString() || ''}
                onChange={e => set({ parentGoalId: e.target.value ? parseInt(e.target.value, 10) : null })}>
                <option value="">No goal</option>
                {goalOptions.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
              </select>
            </PillPick>
          </div>
        </LabelledRow>

        {/* When: Starts (the start date) and Ends (the target date), the two ends of its roadmap bar */}
        <LabelledRow style={timer ? { position: 'relative' } : undefined}>
          <RowLabel>When</RowLabel>
          {/* The timer in the row's top-right corner: view the time, start one, add time */}
          {timer && <span style={{ position: 'absolute', top: 10, right: 20 }}><TimerPopButton timer={timer} running={timerRunning} /></span>}
          <WhenBox2 style={{ maxWidth: 420 }}>
            <WhenLine $allDay>
              <WhenLabel>Starts</WhenLabel>
              <DateTimeInput type="date" aria-label="Start date" value={values.startOn ?? ''} max={values.targetDate || undefined}
                onChange={e => set({ startOn: e.target.value })} />
            </WhenLine>
            <WhenLine $allDay>
              <WhenLabel>Ends</WhenLabel>
              <DateTimeInput type="date" aria-label="Target date" value={values.targetDate} onChange={e => set({ targetDate: e.target.value })} />
            </WhenLine>
          </WhenBox2>
        </LabelledRow>

        {/* The tasks attached to it */}
        <LabelledRow style={{ alignItems: 'start' }}>
          <RowLabel style={{ paddingTop: 10 }}>Tasks</RowLabel>
          <div style={{ minWidth: 0 }}>
            {linkedTasks.length === 0 ? (
              <Muted>No tasks attached yet.</Muted>
            ) : (
              <TaskList>
                {linkedTasks.map(t => (
                  <TaskItem key={t.id} $done={t.isCompleted}>
                    <Checkbox checked={t.isCompleted} aria-label={t.isCompleted ? `Mark "${t.title}" not done` : `Mark "${t.title}" done`}
                      onChange={() => onToggleTaskComplete?.(t.id, !t.isCompleted)} />
                    <button type="button" className="title" onClick={() => onOpenTask?.(t.id)} disabled={!onOpenTask}>{t.title}</button>
                    {onUnlinkTask && (
                      <button type="button" className="x" aria-label={`Detach "${t.title}"`} title="Detach from this milestone"
                        onClick={() => onUnlinkTask(t.id)}>
                        <Icon name="x" size={14} strokeWidth={2} />
                      </button>
                    )}
                  </TaskItem>
                ))}
              </TaskList>
            )}
            {(onCreateTask || (onLinkTask && attachableTasks.length > 0)) && (
              <AddLine>
                {onCreateTask && (naming ? (
                  <NewTaskBox>
                    <input autoFocus value={draft} placeholder="New task" aria-label="New task"
                      onChange={e => setDraft(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); createTask(); }
                        if (e.key === 'Escape') { e.preventDefault(); setDraft(''); setNaming(false); }
                      }} />
                    <button type="button" aria-label="Add the task" title="Add" onClick={createTask}><Icon name="check" size={14} strokeWidth={2} /></button>
                    <button type="button" aria-label="Cancel new task" title="Cancel" onClick={() => { setDraft(''); setNaming(false); }}>
                      <Icon name="x" size={14} strokeWidth={2} />
                    </button>
                  </NewTaskBox>
                ) : (
                  <NewTaskBtn type="button" onClick={() => setNaming(true)}><Icon name="plus" size={14} strokeWidth={2} /> New task</NewTaskBtn>
                ))}
                {onLinkTask && attachableTasks.length > 0 && (
                <PillPick>
                  <span className="value">+ Attach a task</span>
                  <Icon name="chevron-down" size={14} strokeWidth={2} />
                  <select aria-label="Attach a task" value=""
                    onChange={e => { if (e.target.value) onLinkTask(parseInt(e.target.value, 10)); }}>
                    <option value="">Attach a task…</option>
                    {attachableTasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                </PillPick>
                )}
              </AddLine>
            )}
          </div>
        </LabelledRow>
      </RowBox>

      <Section style={{ marginTop: 30 }}>
        <SectionHead><SectionLabel as="label" htmlFor={notesId}>Notes</SectionLabel></SectionHead>
        <BoxText id={notesId} value={values.notes ?? ''} placeholder="Additional details"
          onChange={e => set({ notes: e.target.value })} />
      </Section>
    </FormWrap>
  );
}
