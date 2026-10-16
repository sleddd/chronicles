import styled from 'styled-components';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Icon } from '../atoms/core/Icon.jsx';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 15px;
`;

const StatusBtn = styled.button<{ $color: string }>`
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ $color }) => $color};
  font-size: 16px;
  flex-shrink: 0;
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  &:hover { background: rgba(0,0,0,0.06); }
`;

const Title = styled.span<{ $completed?: boolean }>`
  flex: 1;
  color: ${({ theme, $completed }) => $completed ? theme.colors.textMuted : theme.colors.text};
  text-decoration: ${({ $completed }) => $completed ? 'line-through' : 'none'};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
`;

const UnlinkBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: ${({ theme }) => theme.colors.textMuted};
  background: none;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  flex-shrink: 0;
  &:hover { color: ${({ theme }) => theme.colors.text}; background: rgba(0,0,0,0.06); }
`;

interface SubItemRowProps {
  icon: IconDefinition;
  iconColor: string;
  title: string;
  isCompleted: boolean;
  statusLabel: string;
  onToggleStatus: () => void;
  onUnlink: () => void;
}

export function SubItemRow({ icon, iconColor, title, isCompleted, statusLabel, onToggleStatus, onUnlink }: SubItemRowProps) {
  return (
    <Row>
      <StatusBtn $color={iconColor} aria-label={`${statusLabel} — click to change`} onClick={e => { e.stopPropagation(); onToggleStatus(); }}>
        <FontAwesomeIcon icon={icon} />
      </StatusBtn>
      <Title $completed={isCompleted}>{title}</Title>
      <UnlinkBtn aria-label="Remove item" onClick={e => { e.stopPropagation(); onUnlink(); }}>
        <Icon name="x" size={14} strokeWidth={2} />
      </UnlinkBtn>
    </Row>
  );
}
