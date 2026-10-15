import { Checkbox } from '../../atoms/Checkbox.js';
import { Select } from '../../atoms/Select.js';
import { TextInput } from '../../atoms/TextInput.js';
import { FormField } from '../FormField.js';
import styled from 'styled-components';
import type { TaskFieldValues } from '../../../types/fields.js';
import type { MilestoneOption, GoalOption } from '../../../types/ui.js';
export type { TaskFieldValues } from '../../../types/fields.js';

const PRIORITY_OPTIONS = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'high',   label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low',    label: 'Low' },
  { value: 'none',   label: 'None' },
] as const;

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 15px;
`;

const CheckboxGroup = styled.div`
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 16px;
`;

interface TaskFieldsProps {
  values: TaskFieldValues;
  onChange: (values: TaskFieldValues) => void;
  goalOptions?: GoalOption[];
  milestoneOptions?: MilestoneOption[];
}

export function TaskFields({ values, onChange, goalOptions = [], milestoneOptions = [] }: TaskFieldsProps) {
  // When a goal is selected, narrow the milestone list to that goal's milestones.
  // MilestoneOption may carry an optional parentGoalId for filtering.
  const visibleMilestones = values.parentGoalId
    ? milestoneOptions.filter(m => (m as MilestoneOption & { parentGoalId?: number }).parentGoalId === values.parentGoalId)
    : milestoneOptions;

  const handleGoalChange = (goalId: number | null) => {
    const milestonesForNewGoal = goalId
      ? milestoneOptions.filter(m => (m as MilestoneOption & { parentGoalId?: number }).parentGoalId === goalId)
      : milestoneOptions;
    const milestoneStillValid = !values.parentMilestoneId || milestonesForNewGoal.some(m => m.id === values.parentMilestoneId);
    onChange({
      ...values,
      parentGoalId: goalId,
      parentMilestoneId: milestoneStillValid ? values.parentMilestoneId : null,
    });
  };

  return (
    <Wrapper>
      {/* No separate description field — the task is written in the main text area */}
      {goalOptions.length > 0 && (
        <FormField label="Linked Goal">
          <Select
            value={values.parentGoalId?.toString() || ''}
            onChange={e => handleGoalChange(e.target.value ? parseInt(e.target.value) : null)}
          >
            <option value="">No goal</option>
            {goalOptions.map(g => (
              <option key={g.id} value={g.id}>{g.title}</option>
            ))}
          </Select>
        </FormField>
      )}
      {milestoneOptions.length > 0 && (
        <FormField label="Linked Milestone">
          <Select
            value={values.parentMilestoneId?.toString() || ''}
            onChange={e => onChange({ ...values, parentMilestoneId: e.target.value ? parseInt(e.target.value) : null })}
          >
            <option value="">No milestone</option>
            {visibleMilestones.map(m => (
              <option key={m.id} value={m.id}>{m.title}</option>
            ))}
          </Select>
        </FormField>
      )}
      <FormField label="Priority">
        <Select
          value={values.priority || 'none'}
          onChange={e => onChange({ ...values, priority: e.target.value as TaskFieldValues['priority'] })}
        >
          {PRIORITY_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
      </FormField>
      <FormField label="Deadline">
        <TextInput
          type="date"
          value={values.deadline || ''}
          onChange={e => onChange({ ...values, deadline: e.target.value })}
        />
      </FormField>
      <FormField label="Status">
        <CheckboxGroup>
          <Checkbox
            checked={values.isInProgress}
            onChange={v => onChange({ ...values, isInProgress: v })}
            label="In Progress"
          />
          <Checkbox
            checked={values.isCompleted}
            onChange={v => onChange({ ...values, isCompleted: v })}
            label="Completed"
          />
          <Checkbox
            checked={values.isAutoMigrating}
            onChange={v => onChange({ ...values, isAutoMigrating: v })}
            label="Auto-migrate"
          />
        </CheckboxGroup>
      </FormField>
    </Wrapper>
  );
}
