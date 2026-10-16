import { Checkbox as DSCheckbox } from './core/Checkbox.jsx';

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
}

export function Checkbox({ checked, onChange, label }: CheckboxProps) {
  return (
    <DSCheckbox
      checked={checked}
      onChange={e => onChange(e.target.checked)}
      label={label}
    />
  );
}
