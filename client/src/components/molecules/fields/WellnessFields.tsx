import { WellnessPanel, WATER_GOAL, type FlowIntensity } from '../WellnessPanel.js';
import { DayInventory } from '../DayInventory.js';
import type { WellnessFieldValues } from '../../../types/fields.js';
export type { WellnessFieldValues } from '../../../types/fields.js';

/* Wellness check-in fields in the journal editor and Quick entry — the same
   WellnessPanel as the dashboards, in one row (Water | Sleep | Mood | Cycle in
   one outlined box), with no title above it — and "Your day", the rest of
   the daily inventory (DayInventory), as the box's last row. */

interface WellnessFieldsProps {
  values: WellnessFieldValues;
  onChange: (values: WellnessFieldValues) => void;
  cycleTrackingEnabled?: boolean;
  onAutoSave?: () => void;
}

export function WellnessFields({ values, onChange, cycleTrackingEnabled, onAutoSave }: WellnessFieldsProps) {
  const change = (v: WellnessFieldValues) => {
    onChange(v);
    onAutoSave?.();
  };

  return (
    <>
      <WellnessPanel
        water={values.waterGlasses || 0}
        waterGoal={values.waterGoal || WATER_GOAL}
        sleep={values.sleepHours || 0}
        mood={values.moodScore || 0}
        flow={(values.flowIntensity || '') as FlowIntensity}
        onWater={v => change({ ...values, waterGlasses: v })}
        onSleep={v => change({ ...values, sleepHours: v })}
        onMood={v => change({ ...values, moodScore: v })}
        onFlow={f => change({ ...values, flowIntensity: f, periodToday: f !== '' })}
        showCycle={!!cycleTrackingEnabled}
        row
        footer={(
          <DayInventory
            inside
            values={{
              sleepQuality: values.sleepQuality || 0, wokeAtNight: values.wokeAtNight ?? null, dreamed: values.dreamed ?? null, eating: values.eating || '',
              workDay: values.workDay || 0, social: values.social || 0, procrastination: values.procrastination || 0, stress: values.stress || 0,
            }}
            onChange={patch => change({ ...values, ...patch })}
          />
        )}
      />
    </>
  );
}
