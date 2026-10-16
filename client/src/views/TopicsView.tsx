import { useState, useMemo, useCallback } from 'react';
import { entryRowPlain, rowHoverHandlers, clearRowHover } from '../styles/entryRow.js';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { ContentTemplate } from '../components/templates/ContentTemplate.js';
import { EmptyState } from '../components/atoms/EmptyState.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { UnlockDialog } from '../components/organisms/UnlockDialog.js';
import { TopicEditForm } from '../components/molecules/TopicEditForm.js';
import { SwipeActions } from '../components/molecules/SwipeActions.js';
import { MaterialIcon } from '../components/atoms/MaterialIcon.js';
import { TopicIcon } from '../components/molecules/IconPicker.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { useUIStore } from '../stores/uiStore.js';
import { useInitializeData } from '../hooks/useInitializeData.js';
import { topics as topicsApi, settings as settingsApi } from '../services/api.js';
import { usePrivateSettings } from '../services/privateSettings.js';
import type { Topic } from '../types/topics.js';
import type { UserFieldDef } from '../types/userFields.js';

/* ── Layout ── */

const Page = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
`;

const Inner = styled.div`
  width: 100%;
  max-width: 1150px;
  margin: 0 auto;
  padding: 0 24px 64px;
  @media (max-width: 768px) { padding: 0 16px 48px; }
`;

/* ── Header ── */

const Head = styled.div`
  padding: 53px 0 20px;
`;

const Title = styled.h1`
  font-family: var(--font-display);
  font-size: 44px;
  font-weight: 200;
  line-height: 1;
  color: var(--text-primary);
  margin: 0;
  @media (max-width: 480px) { font-size: 34px; }
`;

/* ── Topic rows ── */

const List = styled.div`
  display: flex;
  flex-direction: column;
`;

/* Shared row style (styles/entryRow) — same as every entry list. */
const Row = styled.button<{ $hint?: boolean }>`
  display: grid;
  grid-template-columns: 32px 1fr auto 20px;
  align-items: center;
  gap: 16px;
  width: 100%;
  padding: 20px 16px;
  border: none;
  border-top: 1px solid var(--border-subtle);
  cursor: pointer;
  text-align: left;
  color: var(--text-primary);
  ${entryRowPlain}
`;

const RowIcon = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-primary);
`;

const RowName = styled.span`
  font-family: var(--font-sans);
  font-size: 20px;
  font-weight: 400;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const RowCount = styled.span`
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  white-space: nowrap;
`;

const RowChevron = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
`;

const Confirm = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 4px;
  border-top: 1px solid var(--border-subtle);
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-secondary);
`;

const ConfirmBtn = styled.button<{ $danger?: boolean }>`
  padding: 6px 14px;
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  border: 1px solid ${({ $danger }) => ($danger ? 'transparent' : 'var(--border-default)')};
  border-radius: var(--r-md, 4px);
  background: ${({ $danger }) => ($danger ? '#e11d48' : 'transparent')};
  color: ${({ $danger }) => ($danger ? '#fff' : 'var(--text-secondary)')};
  cursor: pointer;
  &:hover { opacity: 0.85; }
`;

/* ── Add-topic row ── */

const AddRow = styled.button`
  display: grid;
  grid-template-columns: 32px 1fr;
  align-items: center;
  gap: 16px;
  width: 100%;
  padding: 20px 4px;
  background: transparent;
  border: none;
  border-top: 1px solid var(--border-subtle);
  border-bottom: 1px solid var(--border-subtle);
  cursor: pointer;
  text-align: left;
  color: var(--text-tertiary);
  transition: color 120ms ease, background 120ms ease;

  &:hover { color: var(--text-primary); background: var(--bg-hover); }
`;

const AddLabel = styled.span`
  font-family: var(--font-sans);
  font-size: 20px;
  font-weight: 400;
  font-style: italic;
`;

const EditWrap = styled.div`
  border-top: 1px solid var(--border-subtle);
  padding: 8px 0;
`;

/* ── View ── */

export function TopicsView() {
  const { isReady, isLoading, needsUnlock, handleUnlock } = useInitializeData();
  const navigate = useNavigate();
  const allTopics = useEntriesStore(s => s.allTopics);
  const topics = useEntriesStore(s => s.topics);
  const entries = useEntriesStore(s => s.decryptedEntries);
  const setTopics = useEntriesStore(s => s.setTopics);
  const accentColor = useUIStore(s => s.accentColor) || '#4A5568';
  const topicCustomFields = useUIStore(s => s.topicCustomFields);
  const topicHideText = useUIStore(s => s.topicHideText);
  const updateTopicFields = useUIStore(s => s.updateTopicFields);
  const { savePrivateSetting } = usePrivateSettings();

  // Add row
  const [adding, setAdding] = useState(false);
  const [addName, setAddName] = useState('');
  const [addIcon, setAddIcon] = useState<string | null>(null);
  // Edit row
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState<string | null>(null);
  // Delete confirm
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const entryCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const entry of entries) {
      const taxId = (entry.metadata as Record<string, unknown>)?._taxonomyId as number | undefined;
      if (taxId) counts.set(taxId, (counts.get(taxId) || 0) + 1);
    }
    return counts;
  }, [entries]);

  const handleAddSave = useCallback(async () => {
    if (!addName.trim()) return;
    try {
      const created = await topicsApi.create({ name: addName.trim(), icon: addIcon || undefined });
      setTopics([...allTopics, created]);
      setAdding(false);
      setAddName('');
      setAddIcon(null);
    } catch (err) { console.error('Failed to create topic:', err); }
  }, [addName, addIcon, allTopics, setTopics]);

  const handleFieldDefsChange = useCallback((topicId: number, defs: UserFieldDef[]) => {
    updateTopicFields(topicId, defs);
    const current = useUIStore.getState().topicCustomFields;
    savePrivateSetting('topicCustomFields', { ...current, [topicId]: defs })
      .catch(err => console.error('Failed to save topic fields:', err));
  }, [updateTopicFields, savePrivateSetting]);

  const handleHideTextChange = useCallback((topicId: number, hide: boolean) => {
    useUIStore.getState().updateTopicHideText(topicId, hide);
    settingsApi.upsert('topicHideText', useUIStore.getState().topicHideText)
      .catch(err => console.error('Failed to save topic option:', err));
  }, []);

  const handleEditSave = useCallback(async () => {
    if (editingId === null || !editName.trim()) return;
    try {
      const updated = await topicsApi.update(editingId, { name: editName.trim(), icon: editIcon || undefined });
      setTopics(allTopics.map(t => (t.id === editingId ? updated : t)));
      setEditingId(null);
    } catch (err) { console.error('Failed to update topic:', err); }
  }, [editingId, editName, editIcon, allTopics, setTopics]);

  const handleDelete = useCallback(async (id: number) => {
    try {
      await topicsApi.delete(id);
      setTopics(allTopics.filter(t => t.id !== id));
      setConfirmDeleteId(null);
    } catch (err) { console.error('Failed to delete topic:', err); }
  }, [allTopics, setTopics]);

  const startEdit = (topic: Topic) => {
    setConfirmDeleteId(null);
    setEditingId(topic.id);
    setEditName(topic.name);
    setEditIcon(topic.icon);
  };

  if (needsUnlock) return (
    <>
      <ContentTemplate><EmptyState message="Unlock your journal to view topics" /></ContentTemplate>
      <UnlockDialog onUnlock={handleUnlock} />
    </>
  );

  if (isLoading || !isReady) return (
    <ContentTemplate>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
        <Spinner size={40} />
      </div>
    </ContentTemplate>
  );

  return (
    <ContentTemplate>
      <Page>
        <Inner>
          <Head>
            <Title>Topics</Title>
          </Head>

          <List>
            {topics.map((topic, i) => {
              const count = entryCounts.get(topic.id) ?? 0;
              return (
                <div key={topic.id}>
                  <SwipeActions
                    accentColor={accentColor}
                    onEdit={() => startEdit(topic)}
                    onDelete={() => { setConfirmDeleteId(topic.id); setEditingId(null); }}
                  >
                    <Row $hint={i === 0} onClick={() => { clearRowHover(); navigate(`/topics/${topic.id}`); }} {...rowHoverHandlers}>
                      <RowIcon><TopicIcon name={topic.icon} size={22} /></RowIcon>
                      <RowName>{topic.name}</RowName>
                      <RowCount>{count.toLocaleString()} {count === 1 ? 'entry' : 'entries'}</RowCount>
                      <RowChevron><MaterialIcon $size={20} aria-hidden="true">chevron_right</MaterialIcon></RowChevron>
                    </Row>
                  </SwipeActions>

                  {confirmDeleteId === topic.id && (
                    <Confirm>
                      Delete “{topic.name}”? Entries keep their data but lose this topic.
                      <ConfirmBtn $danger onClick={() => handleDelete(topic.id)}>Delete</ConfirmBtn>
                      <ConfirmBtn onClick={() => setConfirmDeleteId(null)}>Cancel</ConfirmBtn>
                    </Confirm>
                  )}

                  {editingId === topic.id && (
                    <EditWrap>
                      <TopicEditForm
                        name={editName}
                        icon={editIcon}
                        accentColor={accentColor}
                        cancelLabel="Close"
                        onNameChange={setEditName}
                        onIconChange={setEditIcon}
                        onSave={handleEditSave}
                        onCancel={() => setEditingId(null)}
                        topicId={topic.id}
                        fieldDefs={topicCustomFields[topic.id] ?? []}
                        onFieldDefsChange={defs => handleFieldDefsChange(topic.id, defs)}
                        hideTextField={!!topicHideText[topic.id]}
                        onHideTextFieldChange={hide => handleHideTextChange(topic.id, hide)}
                      />
                    </EditWrap>
                  )}
                </div>
              );
            })}

            {/* Add new topic — final row */}
            {adding ? (
              <EditWrap>
                <TopicEditForm
                  name={addName}
                  icon={addIcon}
                  accentColor={accentColor}
                  saveLabel="Add topic"
                  cancelLabel="Cancel"
                  onNameChange={setAddName}
                  onIconChange={setAddIcon}
                  onSave={handleAddSave}
                  onCancel={() => { setAdding(false); setAddName(''); setAddIcon(null); }}
                />
              </EditWrap>
            ) : (
              <AddRow onClick={() => { setAdding(true); setEditingId(null); setConfirmDeleteId(null); }}>
                <RowIcon><MaterialIcon $size={22} aria-hidden="true">add</MaterialIcon></RowIcon>
                <AddLabel>Add new topic…</AddLabel>
              </AddRow>
            )}
          </List>
        </Inner>
      </Page>
    </ContentTemplate>
  );
}
