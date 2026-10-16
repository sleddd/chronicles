import styled from 'styled-components';
import { Icon } from './core/Icon.jsx';

const Handle = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  opacity: 0.35;
  transition: opacity 0.15s, color 0.15s;
  background: none;
  border: none;
  cursor: grab;
  touch-action: none;
  flex-shrink: 0;
  padding: 8px;
  &:active { cursor: grabbing; }
  &:hover { opacity: 1; color: var(--text-primary); }
`;

interface DragHandleProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

export function DragHandle(props: DragHandleProps) {
  return (
    <Handle type="button" aria-label="Drag to reorder" aria-roledescription="sortable" {...props}>
      <Icon name="grip" size={16} strokeWidth={2} />
    </Handle>
  );
}
