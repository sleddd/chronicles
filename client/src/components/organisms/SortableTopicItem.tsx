import styled from 'styled-components';
import { Icon } from '../atoms/core/Icon.jsx';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TopicIcon as TopicGlyph } from '../molecules/IconPicker.js';

const Wrapper = styled.div<{ $isDragging?: boolean }>`
  opacity: ${({ $isDragging }) => $isDragging ? 0.5 : 1};
`;

const Row = styled.div<{ $active?: boolean; $accentColor?: string }>`
  display: grid;
  grid-template-columns: 14px 22px 1fr auto auto;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderSoft};
  cursor: pointer;
  position: relative;
  background: transparent;
  transition: background 0.12s;

  &:hover {
    background: ${({ theme }) => theme.colors.surface};
  }

  &:hover .tp-actions {
    opacity: 1;
  }

  ${({ $active }) => $active && `.tp-actions { opacity: 1; }`}
`;

const DragHandleBtn = styled.span`
  color: ${({ theme }) => theme.colors.textFaint};
  font-size: 11px;
  cursor: grab;
  opacity: 0.5;
  display: flex;
  align-items: center;
  flex-shrink: 0;

  &:active { cursor: grabbing; }
`;

const TopicIcon = styled.span`
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.colors.text};
  font-size: 14px;
  flex-shrink: 0;
`;

const Name = styled.span`
  font-family: ${({ theme }) => theme.fontFamily.sans};
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
`;

const MatchMark = styled.mark<{ $accentColor?: string }>`
  background: ${({ $accentColor }) => $accentColor ? `${$accentColor}26` : 'rgba(78,110,126,0.15)'};
  color: inherit;
  padding: 0 2px;
  border-radius: 2px;
`;

const Count = styled.span`
  font-family: ${({ theme }) => theme.fontFamily.mono};
  font-size: 10px;
  letter-spacing: 0.1em;
  color: ${({ theme }) => theme.colors.textFaint};
  flex-shrink: 0;
`;

const Actions = styled.span`
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 120ms ease;
  flex-shrink: 0;
`;

const ActionBtn = styled.button`
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textMuted};
  background: none;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
  cursor: pointer;
  padding: 0;

  &:hover {
    background: rgba(0, 0, 0, 0.06);
    color: ${({ theme }) => theme.colors.text};
  }
`;

interface SortableTopicItemProps {
  topic: { id: number; name: string; icon: string | null; color: string | null };
  isActive: boolean;
  count: number;
  accentColor: string;
  filterText?: string;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function highlightMatch(name: string, filter: string, accentColor: string) {
  if (!filter) return <>{name}</>;
  const idx = name.toLowerCase().indexOf(filter.toLowerCase());
  if (idx === -1) return <>{name}</>;
  return (
    <>
      {name.slice(0, idx)}
      <MatchMark $accentColor={accentColor}>{name.slice(idx, idx + filter.length)}</MatchMark>
      {name.slice(idx + filter.length)}
    </>
  );
}

export function SortableTopicItem({ topic, isActive, count, accentColor, filterText = '', onSelect, onEdit, onDelete }: SortableTopicItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: topic.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <Wrapper ref={setNodeRef} style={style} $isDragging={isDragging}>
      <Row $active={isActive} $accentColor={accentColor} onClick={onSelect}>
        <DragHandleBtn {...attributes} {...listeners} onClick={e => e.stopPropagation()}>
          <Icon name="grip" size={14} strokeWidth={2} />
        </DragHandleBtn>

        <TopicIcon>
          <TopicGlyph name={topic.icon} size={16} />
        </TopicIcon>

        <Name>{highlightMatch(topic.name, filterText, accentColor)}</Name>

<Actions className="tp-actions">
          <ActionBtn title="Edit" onClick={e => { e.stopPropagation(); onEdit(); }}>
            <Icon name="pencil" size={14} strokeWidth={2} />
          </ActionBtn>
          <ActionBtn title="Delete" onClick={e => { e.stopPropagation(); onDelete(); }}>
            <Icon name="trash" size={14} strokeWidth={2} />
          </ActionBtn>
        </Actions>
      </Row>
    </Wrapper>
  );
}
