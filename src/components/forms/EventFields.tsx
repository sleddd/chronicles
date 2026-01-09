'use client';

import React from 'react';
import { Input, Textarea, DateTimeField } from '@/components/ui';
import type { EventFields as EventFieldValues } from '@/lib/hooks/useCustomFields';

interface EventFieldsProps {
  fields: EventFieldValues;
  onChange: <K extends keyof EventFieldValues>(key: K, value: EventFieldValues[K]) => void;
  glass?: boolean;
  noBorder?: boolean;
}

export function EventFields({ fields, onChange, glass, noBorder }: EventFieldsProps) {
  return (
    <div className={noBorder ? 'custom-fields-body-no-border space-y-3' : 'custom-fields-body space-y-3'}>
      <DateTimeField
        label="Start"
        date={fields.startDate}
        time={fields.startTime}
        onDateChange={(v) => onChange('startDate', v)}
        onTimeChange={(v) => onChange('startTime', v)}
        glass={glass}
      />
      <DateTimeField
        label="End"
        date={fields.endDate}
        time={fields.endTime}
        onDateChange={(v) => onChange('endDate', v)}
        onTimeChange={(v) => onChange('endTime', v)}
        glass={glass}
      />
      <Input
        label="Location"
        value={fields.location}
        onChange={(e) => onChange('location', e.target.value)}
        placeholder="Location name"
        glass={glass}
      />
      <Input
        label="Address"
        value={fields.address}
        onChange={(e) => onChange('address', e.target.value)}
        placeholder="Full address"
        glass={glass}
      />
      <Input
        label="Phone"
        value={fields.phone}
        onChange={(e) => onChange('phone', e.target.value)}
        placeholder="Contact phone"
        glass={glass}
      />
      <Textarea
        label="Notes"
        value={fields.notes}
        onChange={(e) => onChange('notes', e.target.value)}
        placeholder="Additional notes"
        glass={glass}
        rows={3}
      />
    </div>
  );
}
