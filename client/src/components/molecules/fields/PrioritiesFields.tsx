import { FormWrap } from './formKit.js';
import { ChecklistSection } from './ChecklistSection.js';

export interface PriorityItem { id: string; text: string; done: boolean; }
export interface PrioritiesFieldValues { priorities: PriorityItem[]; }

/* Priorities fields (journal editor): the shared checklist — one row per
   priority, no limit — with a round tick, the text edited in place, × to
   remove and "+ Add a priority" (Enter adds). Props only. */

interface Props {
  values: PrioritiesFieldValues;
  onChange: (v: PrioritiesFieldValues) => void;
  /** Kept for existing callers; the tick uses the accent token */
  accentColor?: string;
}

export function PrioritiesFields({ values, onChange }: Props) {
  return (
    <FormWrap>
      <ChecklistSection label="Priorities" noun="priority" items={values.priorities}
        onChange={priorities => onChange({ priorities })} />
    </FormWrap>
  );
}
