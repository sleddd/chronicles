import styled from 'styled-components';
import { Icon } from './core/Icon.jsx';

const Btn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  font-family: var(--font-label);
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--text-secondary);
  background: none;
  border: none;
  cursor: pointer;
  transition: color 0.15s;

  &:hover { color: var(--text-primary); }
`;

interface HeaderAddButtonProps {
  label: string;
  onClick: () => void;
}

export function HeaderAddButton({ label, onClick }: HeaderAddButtonProps) {
  return (
    <Btn onClick={onClick} aria-label={label} data-print-hide>
      <Icon name="plus" size={14} strokeWidth={2} />
      {label}
    </Btn>
  );
}
