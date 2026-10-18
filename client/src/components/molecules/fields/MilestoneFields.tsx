import { useId } from 'react';
import { Icon } from '../../atoms/core/Icon.jsx';
import type { MilestoneFieldValues } from '../../../types/fields.js';
import type { GoalOption, LinkedTask } from '../../../types/ui.js';
import {
  FormWrap, Section, SectionHead, SectionLabel, TitleInput, Chips, Chip, RowBox, LabelledRow, RowLabel, BareDate, BareSelect, BoxText,
} from './formKit.js';
export type { MilestoneFieldValues } from '../../../types/fields.js';

/* Milestone fields — the same form in the journal editor and Quick Entry: the
   objective as a big borderless title (an older milestone's text fills it
   once), then one outlined box of rows — Goal (a bare "No goal ⌄" picker),
   Status chips and Target date — each with a muted label on the left — then Notes. */

const STATUSES: { value: MilestoneFieldValues['milestoneStatus']; label: string }[] = [
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Done' },
];

interface MilestoneFieldsProps {
  values: MilestoneFieldValues;
  onChange: (values: MilestoneFieldValues) => void;
  goalOptions: GoalOption[];
  /** Kept for callers; tasks show on the Planning board */
  linkedTasks?: LinkedTask[];
  onToggleTaskComplete?: (taskId: number, completed: boolean) => void;
  onUnlinkTask?: (taskId: number) => void;
}

export function MilestoneFields({ values, onChange, goalOptions }: MilestoneFieldsProps) {
  const set = (patch: Partial<MilestoneFieldValues>) => onChange({ ...values, ...patch });
  // Done wins; a board-only "planned" (or anything unknown) shows as Not started
  const status: MilestoneFieldValues['milestoneStatus'] = values.isCompleted ? 'completed'
    : values.milestoneStatus === 'in_progress' ? 'in_progress' : 'not_started';
  const goalId = useId();
  const dateId = useId();
  const notesId = useId();

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

      <RowBox style={{ marginTop: 40 }}>
        <LabelledRow>
          <RowLabel as="label" htmlFor={goalId}>Goal</RowLabel>
          <BareSelect>
            <select id={goalId} value={values.parentGoalId?.toString() || ''}
              onChange={e => set({ parentGoalId: e.target.value ? parseInt(e.target.value, 10) : null })}>
              <option value="">No goal</option>
              {goalOptions.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
            </select>
            <span aria-hidden="true"><Icon name="chevron-down" size={14} strokeWidth={2} /></span>
          </BareSelect>
        </LabelledRow>
        <LabelledRow>
          <RowLabel>Status</RowLabel>
          <Chips role="radiogroup" aria-label="Status">
            {STATUSES.map(s => (
              <Chip key={s.value} type="button" role="radio" aria-checked={status === s.value}
                $active={status === s.value}
                onClick={() => set({ milestoneStatus: s.value, isCompleted: s.value === 'completed' })}>
                {s.label}
              </Chip>
            ))}
          </Chips>
        </LabelledRow>
        <LabelledRow>
          <RowLabel as="label" htmlFor={dateId}>Target date</RowLabel>
          <BareDate id={dateId} type="date" value={values.targetDate} onChange={e => set({ targetDate: e.target.value })} />
        </LabelledRow>
      </RowBox>

      <Section style={{ marginTop: 40 }}>
        <SectionHead><SectionLabel as="label" htmlFor={notesId}>Notes</SectionLabel></SectionHead>
        <BoxText id={notesId} value={values.notes ?? ''} placeholder="Additional details"
          onChange={e => set({ notes: e.target.value })} />
      </Section>
    </FormWrap>
  );
}
