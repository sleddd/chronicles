import styled from 'styled-components';
import { TopicIcon } from './IconPicker.js';
import { Icon } from '../atoms/core/Icon.jsx';
import type { Topic } from '../../types/topics.js';

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
`;

const List = styled.div`
  max-height: 240px;
  overflow-y: auto;
  padding: 8px 0;
`;

const ListItem = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  font-family: var(--sans, ${({ theme }) => theme.fontFamily.sans});
  font-size: 14px;
  color: var(--ink, #2b2824);
  background: ${({ $active }) => $active ? 'var(--paper-hover, #f0eeea)' : 'transparent'};
  border: none;
  border-bottom: 1px solid var(--rule, #d4cfc5);
  cursor: pointer;
  text-align: left;
  transition: background 100ms;

  &:hover {
    background: var(--paper-hover, #f0eeea);
  }
`;

const ListIcon = styled.span`
  width: 16px;
  font-size: 12px;
  color: var(--ink-3, #6b645a);
  display: flex;
  align-items: center;
  justify-content: center;
`;

const ListCount = styled.span`
  margin-left: auto;
  font-family: var(--mono, 'JetBrains Mono', monospace);
  font-size: 10px;
  color: var(--ink-4, #8a857c);
`;

const ListHeader = styled.div`
  padding: 12px;
  border-bottom: 1px solid var(--rule, #d4cfc5);
  font-family: var(--sans, ${({ theme }) => theme.fontFamily.sans});
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ink-4, #8a857c);
`;

const NewEntryRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1px 50px;
  align-items: stretch;
  border-bottom: 1px solid var(--rule-2, #e5dfd2);

  & > .divider {
    background: var(--rule, #d4cfc5);
    width: 1px;
  }
`;

const NewEntryBtn = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px 12px;
  font-family: var(--ui, ${({ theme }) => theme.fontFamily.sans});
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--ink, #2b2824);
  background: transparent;
  border: none;
  border-radius: 0;
  cursor: pointer;
  transition: background 150ms, color 150ms;

  &:hover {
    background: var(--paper-hover, #f0eeea);
    color: var(--ink, #2b2824);
  }
`;

const MicBtn = styled(NewEntryBtn)``;

interface TopicQuickFilterProps {
  topics: Topic[];
  selectedTopicId: number | null;
  accentColor: string;
  entryCounts: Map<number, number>;
  onSelect: (topicId: number | null) => void;
  totalCount?: number;
  onNewEntry?: () => void;
  onDictate?: () => void;
}

export function TopicQuickFilter({ topics, selectedTopicId, entryCounts, onSelect, totalCount = 0, onNewEntry, onDictate }: TopicQuickFilterProps) {
  return (
    <Wrap>
      {onNewEntry && (
        <NewEntryRow>
          <NewEntryBtn onClick={onNewEntry}>
            <Icon name="plus" size={11} strokeWidth={2} /> New entry
          </NewEntryBtn>
          <span className="divider" aria-hidden="true" />
          <MicBtn title="Dictate" aria-label="Dictate" onClick={onDictate ?? onNewEntry}>
            <Icon name="mic" size={13} strokeWidth={2} />
          </MicBtn>
        </NewEntryRow>
      )}

      <ListHeader>Topics</ListHeader>
      <List>
        <ListItem
          $active={selectedTopicId === null}
          onClick={() => onSelect(null)}
        >
          <ListIcon />
          <span style={{ fontStyle: 'italic' }}>All Topics</span>
          <ListCount>{totalCount}</ListCount>
        </ListItem>
        {topics.map((topic) => (
          <ListItem
            key={topic.id}
            $active={selectedTopicId === topic.id}
            onClick={() => onSelect(topic.id)}
          >
            <ListIcon>
              <TopicIcon name={topic.icon} size={14} />
            </ListIcon>
            {topic.name}
            <ListCount>{entryCounts.get(topic.id) ?? 0}</ListCount>
          </ListItem>
        ))}
      </List>
    </Wrap>
  );
}
