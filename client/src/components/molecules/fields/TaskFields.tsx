import { useId } from 'react';
import styled from 'styled-components';
import { Icon } from '../../atoms/core/Icon.jsx';
import { Toggle } from '../../atoms/Toggle.js';
import type { TaskFieldValues } from '../../../types/fields.js';
import type { GoalOption, MilestoneOption } from '../../../types/ui.js';
import {
  FormWrap, Section, SectionHead, SectionLabel, TitleInput, Chips, Chip, RowBox, LabelledRow, RowLabel, BareDate, BareSelect, BoxText,
} from './formKit.js';
export type { TaskFieldValues } from '../../../types/fields.js';

/* Task fields — the same form in the journal editor and Quick Entry: the task
   as a big borderless title ("What needs doing?"; an older task's text fills
   it once), then one outlined box of rows — Part of (goal and milestone pills),
   Priority chips (no dots), Deadline, Status chips and an
   Auto-migrate switch — then Notes. Props only. */

const PRIORITIES: { value: TaskFieldValues['priority']; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

type Status = 'todo' | 'in_progress' | 'done';
const STATUSES: { value: Status; label: string }[] = [
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
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
}

export function TaskFields({ values, onChange, goalOptions = [], milestoneOptions = [] }: TaskFieldsProps) {
  const set = (patch: Partial<TaskFieldValues>) => onChange({ ...values, ...patch });
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

  const status: Status = values.isCompleted ? 'done' : values.isInProgress ? 'in_progress' : 'todo';
  const priority = PRIORITIES.some(p => p.value === values.priority) ? values.priority : 'none';

  return (
    <FormWrap>
      <Section>
        <TitleInput
          value={values.taskDescription ?? ''}
          onChange={e => set({ taskDescription: e.target.value })}
          placeholder="What needs doing?"
          aria-label="Task"
        />
      </Section>

      <RowBox style={{ marginTop: 30 }}>
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
          <RowLabel as="label" htmlFor={deadlineId}>Deadline</RowLabel>
          <BareDate id={deadlineId} type="date" value={values.deadline} onChange={e => set({ deadline: e.target.value })} />
        </LabelledRow>

        <LabelledRow>
          <RowLabel>Status</RowLabel>
          <Chips role="radiogroup" aria-label="Status">
            {STATUSES.map(s => (
              <Chip key={s.value} type="button" role="radio" aria-checked={status === s.value}
                $active={status === s.value}
                onClick={() => set({ isInProgress: s.value === 'in_progress', isCompleted: s.value === 'done' })}>
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

      <Section style={{ marginTop: 30 }}>
        <SectionHead><SectionLabel as="label" htmlFor={notesId}>Notes</SectionLabel></SectionHead>
        <BoxText id={notesId} value={values.notes ?? ''} placeholder="Additional details"
          onChange={e => set({ notes: e.target.value })} />
      </Section>
    </FormWrap>
  );
}
