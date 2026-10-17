import { WellnessPanel, WATER_GOAL, type FlowIntensity } from '../WellnessPanel.js';
import type { WellnessFieldValues } from '../../../types/fields.js';
export type { WellnessFieldValues } from '../../../types/fields.js';

/* Wellness check-in fields in the journal editor — the same WellnessPanel as
   the Health dashboard card, in its compact size, with no title above it. */

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
      compact
    />
  );
}
