import styled from 'styled-components';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  [key: string]: unknown;
}

const Label = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
`;

const HiddenInput = styled.input.attrs({ type: 'checkbox' })`
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
`;

const Track = styled.span<{ $checked: boolean }>`
  position: relative;
  display: inline-block;
  width: 38px;
  height: 22px;
  border-radius: 999px;
  flex-shrink: 0;
  background: ${({ $checked }) => $checked ? 'var(--color-accent)' : 'var(--border-strong)'};
  transition: background 180ms ease;
`;

const Thumb = styled.span<{ $checked: boolean }>`
  position: absolute;
  top: 3px;
  left: ${({ $checked }) => $checked ? '19px' : '3px'};
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0,0,0,0.25);
  transition: left 180ms ease;
`;

const LabelText = styled.span`
  font-size: 13px;
  color: var(--text-primary);
`;

export function Toggle({ checked, onChange, label, ...rest }: ToggleProps) {
  return (
    <Label>
      <HiddenInput
        aria-label={(rest['aria-label'] as string | undefined) ?? label}
        checked={checked}
        onChange={e => onChange(e.target.checked)}
      />
      <Track $checked={checked}>
        <Thumb $checked={checked} />
      </Track>
      {label && <LabelText>{label}</LabelText>}
    </Label>
  );
}
