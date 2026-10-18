import { useState, useCallback } from 'react';
import styled from 'styled-components';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark, faMagnifyingGlass, faArrowDownAZ, faPlus } from '@fortawesome/free-solid-svg-icons';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { EmptyState } from '../atoms/EmptyState.js';
import { TopicEditForm } from '../molecules/TopicEditForm.js';
import { SortableTopicItem } from './SortableTopicItem.js';
import { SidebarToggle } from '../atoms/SidebarToggle.js';
import type { Topic } from '../../types/topics.js';
import { useUIStore } from '../../stores/uiStore.js';
import { useEntriesStore } from '../../stores/entriesStore.js';
import { settings as settingsApi } from '../../services/api.js';
import { usePrivateSettings } from '../../services/privateSettings.js';
import type { UserFieldDef } from '../../types/userFields.js';
import { DEFAULT_ACCENT_COLOR } from '../../styles/accent.js';

const Pane = styled.div<{ $hidden?: boolean }>`
  width: 300px;
  min-width: 300px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--paper);
  border-right: 1px solid ${({ theme }) => theme.colors.border};
  @media (max-width: 1024px) {
    width: 100%;
    min-width: 100%;
    display: ${({ $hidden }) => $hidden ? 'none' : 'flex'};
  }
`;

const Head = styled.div`
  padding: 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  display: flex;
  justify-content: space-between;
  align-items: baseline;
`;

const HeadTitle = styled.h2`
  font-family: ${({ theme }) => theme.fontFamily.serif};
  font-style: normal;
  font-size: 20px;
  font-weight: 300;
  color: ${({ theme }) => theme.colors.text};
  margin: 0;
`;

const HeadSub = styled.span`
  font-family: var(--font-sans);
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textFaint};
`;

const SearchBar = styled.div`
  padding: 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderSoft};
  position: relative;
`;

const SearchIconWrap = styled.span`
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: ${({ theme }) => theme.colors.textFaint};
  font-size: 13px;
  pointer-events: none;
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 10px 32px 10px 36px;
  background: transparent;
  border: none;
  border-radius: 0;
  font-family: ${({ theme }) => theme.fontFamily.sans};
  font-size: 15px;
  color: ${({ theme }) => theme.colors.text};
  outline: none;

  &::placeholder {
    color: ${({ theme }) => theme.colors.textFaint};
    font-style: italic;
  }
`;

const ClearBtn = styled.button`
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.colors.textFaint};
  background: none;
  border: none;
  cursor: pointer;
  font-size: 11px;
  padding: 0;
  &:hover { color: ${({ theme }) => theme.colors.text}; }
`;

const ScrollHint = styled.div`
  padding: 12px 12px;
  font-family: ${({ theme }) => theme.fontFamily.mono};
  font-size: 9.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.textFaint};
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderSoft};
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const SortToggle = styled.button`
  display: flex;
  align-items: center;
  gap: 4px;
  font-family: ${({ theme }) => theme.fontFamily.mono};
  font-size: 9.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.textFaint};
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  &:hover { color: ${({ theme }) => theme.colors.text}; }
`;

const AllRow = styled.button<{ $active?: boolean; $accentColor?: string }>`
  display: grid;
  grid-template-columns: 14px 22px 1fr auto;
  gap: 10px;
  align-items: center;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderSoft};
  font-family: ${({ theme }) => theme.fontFamily.sans};
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text};
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s;
  &:hover { background: rgba(0, 0, 0, 0.04); }
`;

const AllName = styled.span`
  grid-column: 2 / 4;
  font-style: italic;
  color: ${({ theme }) => theme.colors.textMuted};
`;

const AllCount = styled.span`
  font-family: ${({ theme }) => theme.fontFamily.mono};
  font-size: 10px;
  letter-spacing: 0.1em;
  color: ${({ theme }) => theme.colors.textFaint};
`;

const List = styled.div`
  flex: 1;
  overflow-y: auto;
`;

const NoMatch = styled.div`
  padding: 16px 12px;
  font-family: ${({ theme }) => theme.fontFamily.sans};
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textMuted};
  text-align: center;
`;

const AddBar = styled.div`
  padding: 8px 12px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  display: flex;
  gap: 8px;
  align-items: center;
  flex-shrink: 0;
`;

const AddInput = styled.input`
  flex: 1;
  padding: 6px 10px;
  font-family: ${({ theme }) => theme.fontFamily.sans};
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
  outline: none;
  &::placeholder { color: ${({ theme }) => theme.colors.textFaint}; font-style: italic; }
  &:focus { border-color: ${({ theme }) => theme.colors.borderFocus}; }
`;

const AddIconBtn = styled.button`
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textMuted};
  background: none;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
  cursor: pointer;
  flex-shrink: 0;
  &:hover { background: ${({ theme }) => theme.colors.surface}; }
`;

const AddSubmitBtn = styled.button<{ $accentColor?: string }>`
  padding: 6px 14px;
  font-family: ${({ theme }) => theme.fontFamily.ui};
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #fff;
  background: ${({ $accentColor }) => $accentColor || DEFAULT_ACCENT_COLOR};
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
  cursor: pointer;
  flex-shrink: 0;
  white-space: nowrap;
  &:hover { opacity: 0.85; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

interface TopicSidebarPanelProps {
  topics: Topic[];
  selectedTopicId: number | null;
  totalEntryCount: number;
  entryCounts: Map<number, number>;
  accentColor: string;
  hiddenMobile?: boolean;
  // Edit form state
  editingId: number | null;
  editName: string;
  editIcon: string | null;
  onEditNameChange: (name: string) => void;
  onEditIconChange: (icon: string | null) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  // Actions
  onSelectTopic: (id: number | null) => void;
  onStartEdit: (topic: Topic) => void;
  onDelete: (id: number) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onAdd: (name: string, icon: string | null) => Promise<void>;
}

export function TopicSidebarPanel({
  topics, selectedTopicId, totalEntryCount, entryCounts, accentColor, hiddenMobile,
  editingId, editName, editIcon, onEditNameChange, onEditIconChange, onEditSave, onEditCancel,
  onSelectTopic, onStartEdit, onDelete, onDragEnd, onAdd,
}: TopicSidebarPanelProps) {
  const [filter, setFilter] = useState('');
  const [sortAZ, setSortAZ] = useState(false);
  const [addName, setAddName] = useState('');
  const [isAdding, setIsAdding] = useState(false);


  const entries = useEntriesStore(s => s.decryptedEntries);
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recentCount = entries.filter(e => new Date(e.createdAt).getTime() >= cutoff).length;

  const topicCustomFields = useUIStore(s => s.topicCustomFields);
  const topicHideText = useUIStore(s => s.topicHideText);
  const updateTopicFields = useUIStore(s => s.updateTopicFields);
  const { savePrivateSetting } = usePrivateSettings();

  const handleFieldDefsChange = useCallback((topicId: number, defs: UserFieldDef[]) => {
    updateTopicFields(topicId, defs);
    const currentFields = useUIStore.getState().topicCustomFields;
    const updated = { ...currentFields, [topicId]: defs };
    savePrivateSetting('topicCustomFields', updated)
      .catch(err => console.error('Failed to save topic fields:', err));
  }, [updateTopicFields, savePrivateSetting]);

  const handleHideTextChange = useCallback((topicId: number, hide: boolean) => {
    useUIStore.getState().updateTopicHideText(topicId, hide);
    settingsApi.upsert('topicHideText', useUIStore.getState().topicHideText)
      .catch(err => console.error('Failed to save topic option:', err));
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const isFiltering = filter.trim().length > 0;

  let displayTopics = isFiltering
    ? topics.filter(t => t.name.toLowerCase().includes(filter.toLowerCase()))
    : [...topics];

  if (sortAZ) {
    displayTopics = [...displayTopics].sort((a, b) => a.name.localeCompare(b.name));
  }

  const handleAdd = async () => {
    if (!addName.trim() || isAdding) return;
    setIsAdding(true);
    try {
      await onAdd(addName.trim(), null);
      setAddName('');
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <Pane $hidden={hiddenMobile}>
      <Head>
        <HeadTitle>Your Topics</HeadTitle>
      </Head>

      <SearchBar>
        <SearchIconWrap><FontAwesomeIcon icon={faMagnifyingGlass} /></SearchIconWrap>
        <SearchInput
          type="text"
          placeholder="Filter topics…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
        {isFiltering && (
          <ClearBtn onClick={() => setFilter('')} title="Clear">
            <FontAwesomeIcon icon={faXmark} />
          </ClearBtn>
        )}
      </SearchBar>

      <ScrollHint>
        <span>
          {isFiltering
            ? `${displayTopics.length} match${displayTopics.length !== 1 ? 'es' : ''}`
            : `${topics.length} topic${topics.length !== 1 ? 's' : ''}`}
        </span>
        <SortToggle onClick={() => setSortAZ(v => !v)} title={sortAZ ? 'Manual order' : 'Sort A–Z'}>
          <FontAwesomeIcon icon={faArrowDownAZ} style={{ fontSize: 10 }} />
          {sortAZ ? 'A–Z' : 'Manual'}
        </SortToggle>
      </ScrollHint>

      <List>
        {!isFiltering && (
          <AllRow $active={selectedTopicId === null} $accentColor={accentColor} onClick={() => onSelectTopic(null)}>
            <span />
            <AllName>All Topics</AllName>
          </AllRow>
        )}

        {isFiltering ? (
          <>
            {displayTopics.map(topic => (
              <div key={topic.id}>
                <SortableTopicItem
                  topic={topic}
                  isActive={selectedTopicId === topic.id}
                  count={entryCounts.get(topic.id) || 0}
                  accentColor={accentColor}
                  filterText={filter}
                  onSelect={() => onSelectTopic(topic.id)}
                  onEdit={() => onStartEdit(topic)}
                  onDelete={() => onDelete(topic.id)}
                />
                {editingId === topic.id && (
                  <TopicEditForm
                    name={editName}
                    icon={editIcon}
                    accentColor={accentColor}
                    cancelLabel="Close"
                    onNameChange={onEditNameChange}
                    onIconChange={onEditIconChange}
                    onSave={onEditSave}
                    onCancel={onEditCancel}
                    topicId={topic.id}
                    fieldDefs={topicCustomFields[topic.id] ?? []}
                    onFieldDefsChange={defs => handleFieldDefsChange(topic.id, defs)}
                    hideTextField={!!topicHideText[topic.id]}
                    onHideTextFieldChange={hide => handleHideTextChange(topic.id, hide)}
                  />
                )}
              </div>
            ))}
            {displayTopics.length === 0 && (
              <NoMatch>No topics match "{filter}"</NoMatch>
            )}
          </>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={topics.map(t => t.id)} strategy={verticalListSortingStrategy}>
              {displayTopics.map(topic => (
                <div key={topic.id}>
                  <SortableTopicItem
                    topic={topic}
                    isActive={selectedTopicId === topic.id}
                    count={entryCounts.get(topic.id) || 0}
                    accentColor={accentColor}
                    onSelect={() => onSelectTopic(topic.id)}
                    onEdit={() => onStartEdit(topic)}
                    onDelete={() => onDelete(topic.id)}
                  />
                  {editingId === topic.id && (
                    <TopicEditForm
                      name={editName}
                      icon={editIcon}
                      accentColor={accentColor}
                      cancelLabel="Close"
                      onNameChange={onEditNameChange}
                      onIconChange={onEditIconChange}
                      onSave={onEditSave}
                      onCancel={onEditCancel}
                      topicId={topic.id}
                      fieldDefs={topicCustomFields[topic.id] ?? []}
                      onFieldDefsChange={defs => handleFieldDefsChange(topic.id, defs)}
                    />
                  )}
                </div>
              ))}
            </SortableContext>
          </DndContext>
        )}

        {topics.length === 0 && !isFiltering && (
          <EmptyState message="No topics yet. Add one below." />
        )}
      </List>

      <AddBar>
        <AddInput
          placeholder="New topic…"
          value={addName}
          onChange={e => setAddName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
        />
        <AddIconBtn title="Choose icon">
          <FontAwesomeIcon icon={faPlus} />
        </AddIconBtn>
        <AddSubmitBtn $accentColor={accentColor} onClick={handleAdd} disabled={!addName.trim() || isAdding}>
          {isAdding ? 'Adding…' : 'Add'}
        </AddSubmitBtn>
      </AddBar>
    </Pane>
  );
}
