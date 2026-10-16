import styled from 'styled-components';
import type { InputHTMLAttributes } from 'react';
import { Input as DSInput } from './core/Input.jsx';

const Wrapper = styled.div`
  display: flex;
  align-items: flex-end;
  gap: var(--space-md, 12px);
  flex-wrap: wrap;
`;

interface DateTimeInputProps {
  dateValue: string;
  timeValue: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  dateProps?: InputHTMLAttributes<HTMLInputElement>;
  timeProps?: InputHTMLAttributes<HTMLInputElement>;
}

export function DateTimeInput({ dateValue, timeValue, onDateChange, onTimeChange, dateProps, timeProps }: DateTimeInputProps) {
  return (
    <Wrapper>
      <div style={{ flex: 1, minWidth: 0 }}>
        <DSInput
          type="date"
          value={dateValue}
          onChange={e => onDateChange(e.target.value)}
          {...dateProps}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <DSInput
          type="time"
          value={timeValue}
          onChange={e => onTimeChange(e.target.value)}
          {...timeProps}
        />
      </div>
    </Wrapper>
  );
}
