import { useId, useState, type KeyboardEvent } from 'react';
import styled from 'styled-components';
import { Icon } from '../../atoms/core/Icon.jsx';
import { Toggle } from '../../atoms/Toggle.js';
import type { TaskFieldValues } from '../../../types/fields.js';
import type { GoalOption, MilestoneOption } from '../../../types/ui.js';
import {
  FormWrap, Section, SectionHead, SectionLabel, TitleInput, Chips, Chip, RowBox, LabelledRow, RowLabel, BareDate, BareSelect, BoxText,
  TextAction, RemoveChip, AddChip, AddChipBox,
} from './formKit.js';
import { isDefaultTaskType, sameTaskType } from '../../../utils/taskTypes.js';
import { checklistOf } from '../../../utils/taskLists.js';
import { ChecklistSection } from './ChecklistSection.js';
import { taskStatusOf, taskFieldsForStatus, type TaskStatus } from '../../../types/goals.js';
export type { TaskFieldValues } from '../../../types/fields.js';

/* Task fields — the same form in the journal editor and Quick Entry: the task
   as a big borderless title ("What needs doing?"; an older task's text fills
   it once), then one outlined box of rows — Format (Single task / To-do list),
   Part of (goal and milestone pills),
   Priority chips (no dots), Type chips (Regular task, Small victory and the
   owner's own — tap the chosen one again to clear it; + Add saves a new type,
   Edit removes the owner's own), Deadline, Status chips (To do, In progress, In review, Completed) and an Auto-migrate
   switch — then, for a todo list, its items (no limit, ticked off in place),
   then Notes. Props only. */

const FORMATS: { value: 'single' | 'list'; label: string }[] = [
  { value: 'single', label: 'Single task' },
  { value: 'list', label: 'To-do list' },
];

const PRIORITIES: { value: TaskFieldValues['priority']; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

const STATUSES: { value: TaskStatus; label: string }[] = [
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'in_review', label: 'In review' },
  { value: 'done', label: 'Completed' },
];

const PartOf = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
  min-width: 0;
`;


const MigrateRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  font-family: var(--font-sans);
  font-size: 16px;
  color: var(--text-soft);
`;

interface TaskFieldsProps {
  values: TaskFieldValues;
  onChange: (values: TaskFieldValues) => void;
  goalOptions?: GoalOption[];
  milestoneOptions?: MilestoneOption[];
  /** The types to offer (built-in + the owner's own) */
  types?: string[];
  /** Save a new type; omitted = no + Add / Edit */
  onAddType?: (label: string) => void;
  onRemoveType?: (label: string) => void;
}

export function TaskFields({ values, onChange, goalOptions = [], milestoneOptions = [], types = [], onAddType, onRemoveType }: TaskFieldsProps) {
  const set = (patch: Partial<TaskFieldValues>) => onChange({ ...values, ...patch });
  const [editingTypes, setEditingTypes] = useState(false);
  const [addingType, setAddingType] = useState(false);
  const [typeDraft, setTypeDraft] = useState('');
  const taskType = values.taskType?.trim() ?? '';
  const isList = values.taskFormat === 'list';
  // A type the task carries but the list no longer has (removed since) still shows
  const typeChips = taskType && !types.some(t => sameTaskType(t, taskType)) ? [...types, taskType] : types;
  const ownTypes = types.filter(t => !isDefaultTaskType(t));
  const commitType = () => {
    const label = typeDraft.trim().replace(/\s+/g, ' ');
    if (label) {
      onAddType?.(label);
      set({ taskType: label });
    }
    setTypeDraft('');
    setAddingType(false);
  };
  const onTypeKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); commitType(); }
    if (e.key === 'Escape') { setTypeDraft(''); setAddingType(false); }
  };
  const goalId = useId();
  const milestoneId = useId();
  const deadlineId = useId();
  const notesId = useId();

  // A goal narrows the milestones to its own (MilestoneOption may carry parentGoalId)
  const goalOf = (m: MilestoneOption) => (m as MilestoneOption & { parentGoalId?: number | null }).parentGoalId ?? null;
  const visibleMilestones = values.parentGoalId ? milestoneOptions.filter(m => goalOf(m) === values.parentGoalId) : milestoneOptions;
  const pickGoal = (id: number | null) => {
    const keepMilestone = !values.parentMilestoneId || !id
      || milestoneOptions.some(m => m.id === values.parentMilestoneId && goalOf(m) === id);
    set({ parentGoalId: id, parentMilestoneId: keepMilestone ? values.parentMilestoneId : null });
  };

  const status = taskStatusOf(values as unknown as Record<string, unknown>);
  const priority = PRIORITIES.some(p => p.value === values.priority) ? values.priority : 'none';

  return (
    <FormWrap>
      <Section>
        <TitleInput
          value={values.taskDescription ?? ''}
          onChange={e => set({ taskDescription: e.target.value })}
          placeholder={isList ? 'Name this list, e.g. First week of October' : 'What needs doing?'}
          aria-label={isList ? 'To-do list name' : 'Task'}
        />
      </Section>

      <RowBox style={{ marginTop: 30 }}>
        <LabelledRow>
          <RowLabel>Format</RowLabel>
          <Chips role="radiogroup" aria-label="Format">
            {FORMATS.map(f => {
              const on = (isList ? 'list' : 'single') === f.value;
              return (
                <Chip key={f.value} type="button" role="radio" aria-checked={on} $active={on}
                  onClick={() => set({ taskFormat: f.value })}>
                  {f.label}
                </Chip>
              );
            })}
          </Chips>
        </LabelledRow>

        <LabelledRow>
          <RowLabel>Part of</RowLabel>
          <PartOf>
            <BareSelect>
              <select id={goalId} aria-label="Goal" value={values.parentGoalId?.toString() || ''}
                onChange={e => pickGoal(e.target.value ? parseInt(e.target.value, 10) : null)}>
                <option value="">No goal</option>
                {goalOptions.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
              </select>
              <span aria-hidden="true"><Icon name="chevron-down" size={14} strokeWidth={2} /></span>
            </BareSelect>
            <BareSelect>
              <select id={milestoneId} aria-label="Milestone" value={values.parentMilestoneId?.toString() || ''}
                onChange={e => {
                  const id = e.target.value ? parseInt(e.target.value, 10) : null;
                  const m = id ? milestoneOptions.find(x => x.id === id) : undefined;
                  // Picking a milestone also sets its goal
                  set({ parentMilestoneId: id, parentGoalId: m && goalOf(m) ? goalOf(m) : values.parentGoalId });
                }}>
                <option value="">No milestone</option>
                {visibleMilestones.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
              </select>
              <span aria-hidden="true"><Icon name="chevron-down" size={14} strokeWidth={2} /></span>
            </BareSelect>
          </PartOf>
        </LabelledRow>

        <LabelledRow>
          <RowLabel>Priority</RowLabel>
          <Chips role="radiogroup" aria-label="Priority">
            {PRIORITIES.map(p => (
              <Chip key={p.value} type="button" role="radio" aria-checked={priority === p.value}
                $active={priority === p.value} onClick={() => set({ priority: p.value })}>
                {p.label}
              </Chip>
            ))}
          </Chips>
        </LabelledRow>

        <LabelledRow>
          <RowLabel>Type</RowLabel>
          {editingTypes ? (
            <Chips aria-label="Remove a type">
              {ownTypes.map(t => (
                <RemoveChip key={t} type="button" $active={false} aria-label={`Remove ${t}`} onClick={() => onRemoveType?.(t)}>{t}</RemoveChip>
              ))}
              <TextAction type="button" onClick={() => setEditingTypes(false)}>Done</TextAction>
            </Chips>
          ) : (
            <Chips role="radiogroup" aria-label="Type">
              {typeChips.map(t => {
                const on = sameTaskType(t, taskType);
                return (
                  <Chip key={t} type="button" role="radio" aria-checked={on} $active={on}
                    onClick={() => set({ taskType: on ? '' : t })}>
                    {t}
                  </Chip>
                );
              })}
              {onAddType && (addingType ? (
                <AddChipBox autoFocus value={typeDraft} maxLength={40} placeholder="New type" aria-label="New type"
                  onChange={e => setTypeDraft(e.target.value)} onKeyDown={onTypeKey} onBlur={commitType} />
              ) : (
                <AddChip type="button" $active={false} onClick={() => setAddingType(true)}>+ Add</AddChip>
              ))}
              {onRemoveType && ownTypes.length > 0 && !addingType && (
                <TextAction type="button" onClick={() => setEditingTypes(true)}>Edit</TextAction>
              )}
            </Chips>
          )}
        </LabelledRow>

        <LabelledRow>
          <RowLabel as="label" htmlFor={deadlineId}>Deadline</RowLabel>
          <BareDate id={deadlineId} type="date" value={values.deadline} onChange={e => set({ deadline: e.target.value })} />
        </LabelledRow>

        <LabelledRow>
          <RowLabel>Status</RowLabel>
          <Chips role="radiogroup" aria-label="Status">
            {STATUSES.map(s => (
              <Chip key={s.value} type="button" role="radio" aria-checked={status === s.value}
                $active={status === s.value}
                onClick={() => set(taskFieldsForStatus(s.value))}>
                {s.label}
              </Chip>
            ))}
          </Chips>
        </LabelledRow>

        <LabelledRow>
          <RowLabel>Auto-migrate</RowLabel>
          <MigrateRow>
            Move to tomorrow if unfinished
            <Toggle checked={values.isAutoMigrating} aria-label="Auto-migrate" onChange={v => set({ isAutoMigrating: v })} />
          </MigrateRow>
        </LabelledRow>
      </RowBox>

      {isList && (
        <ChecklistSection label="To-dos" noun="to-do" style={{ marginTop: 30 }}
          items={checklistOf(values as unknown as Record<string, unknown>)} onChange={checklist => set({ checklist })} />
      )}

      <Section style={{ marginTop: 30 }}>
        <SectionHead><SectionLabel as="label" htmlFor={notesId}>Notes</SectionLabel></SectionHead>
        <BoxText id={notesId} value={values.notes ?? ''} placeholder="Additional details"
          onChange={e => set({ notes: e.target.value })} />
      </Section>
    </FormWrap>
  );
}
