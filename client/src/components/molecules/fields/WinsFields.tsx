import { FormWrap } from './formKit.js';
import { ChecklistSection } from './ChecklistSection.js';
import type { WinItem } from '../../../utils/wins.js';

export interface WinsFieldValues { wins: WinItem[] }

/* Wins fields (journal editor): the day's wins as the shared list — each win
   edited in place, × to remove and "+ Add a win" (Enter adds) — with no tick
   circles, since a win is already done. Props only. */

export function WinsFields({ values, onChange }: { values: WinsFieldValues; onChange: (v: WinsFieldValues) => void }) {
  return (
    <FormWrap>
      <ChecklistSection label="Wins" noun="win" ticks={false}
        items={values.wins.map(w => ({ ...w, done: false }))}
        onChange={items => onChange({ wins: items.map(({ id, text }) => ({ id, text })) })} />
    </FormWrap>
  );
}
