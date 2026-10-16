import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { CSS } from '@dnd-kit/utilities';
import { useSortable } from '@dnd-kit/sortable';
import { Icon } from '../atoms/core/Icon.jsx';
import { ProgressBar } from '../atoms/ProgressBar.js';
import { Badge } from '../atoms/Badge.js';
import { Checkbox } from '../atoms/Checkbox.js';
import { InlineEditPanel } from '../molecules/InlineEditPanel.js';
import { Editor } from './Editor.js';
import { MilestoneFields, type MilestoneFieldValues } from '../molecules/fields/MilestoneFields.js';
import { useEncryption } from '../../contexts/EncryptionContext.js';
import { useEntriesStore } from '../../stores/entriesStore.js';
import { entries as entriesApi } from '../../services/api.js';
import type { MilestoneEntryData, TaskEntryData } from '../../types/goals.js';

const Card = styled.div<{ $editing?: boolean; $dragging?: boolean; $accentColor?: string }>`
  background: ${({ $dragging }) => $dragging ? 'var(--bg-surface, #fff)' : 'transparent'};
  border: none;
  border-top: 1px solid var(--border-subtle);
  border-radius: 0;
  margin: 0;
  min-width: 0;
  opacity: ${({ $dragging }) => $dragging ? 0.6 : 1};
  box-shadow: ${({ $dragging }) => $dragging ? '0 4px 12px rgba(0,0,0,0.15)' : 'none'};
`;

const CardHeader = styled.div<{ $active?: boolean }>`
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
  align-items: start;
  padding: 18px 12px;
  cursor: grab;
  touch-action: none;
  background: ${({ $active }) => $active ? 'var(--bg-hover, rgba(0,0,0,0.03))' : 'transparent'};
  border-radius: 6px;
  transition: background 120ms;
  &:hover { background: var(--bg-hover, rgba(0,0,0,0.03)); }
  &:active { cursor: grabbing; }
`;

const DateCol = styled.div`
  font-family: var(--mono, 'JetBrains Mono', monospace);
  font-size: 10px;
  color: var(--ink-4, #8a857c);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-align: right;
  line-height: 1.3;
  padding-right: 7px;
`;

const DayNum = styled.span`
  font-family: var(--serif, 'Playfair Display', Georgia, serif);
  font-style: normal;
  font-size: 26px;
  color: var(--ink, #2b2824);
  letter-spacing: 0;
  display: block;
  line-height: 1;
  margin-bottom: 7px;
  padding-bottom: 5px;
`;

const ContentWrap = styled.div`
  min-width: 0;
`;

const TitleRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
`;

const FooterMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-family: var(--mono, 'JetBrains Mono', monospace);
  font-size: 9.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-4, #8a857c);
  flex-wrap: wrap;
`;


const Title = styled.div<{ $completed?: boolean }>`
  flex: 1;
  font-family: var(--sans, 'Lato', sans-serif);
  font-size: 15px;
  font-style: normal;
  color: ${({ $completed }) => $completed ? 'var(--ink-4, #8a857c)' : 'var(--ink, #2b2824)'};
  line-height: 1.4;
  text-decoration: ${({ $completed }) => $completed ? 'line-through' : 'none'};
  margin-bottom: 3px;
  min-width: 0;
`;

const TaskRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 15px;
`;

const TaskTitle = styled.span<{ $completed?: boolean }>`
  flex: 1;
  color: ${({ theme, $completed }) => $completed ? theme.colors.textMuted : theme.colors.text};
  text-decoration: ${({ $completed }) => $completed ? 'line-through' : 'none'};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
`;

const RemoveBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  color: ${({ theme }) => theme.colors.textMuted};
  background: none;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
  flex-shrink: 0;
  &:hover { color: ${({ theme }) => theme.colors.text}; background: rgba(0,0,0,0.06); }
`;


const TaskSectionLabel = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-top: 24px;
  padding-top: 16px;
  margin-bottom: 4px;
`;


const AddTaskRow = styled.form`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 0;
`;

const LinkSelect = styled.select`
  flex: 1;
  padding: 6px 10px;
  font-size: 16px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
  background: transparent;
  color: ${({ theme }) => theme.colors.text};
  outline: none;
  appearance: none;
  cursor: pointer;
  &:focus { border-color: ${({ theme }) => theme.colors.text}; }
`;

const AddTaskInput = styled.input`
  flex: 1;
  padding: 6px 10px;
  font-size: 16px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
  background: transparent;
  color: ${({ theme }) => theme.colors.text};
  outline: none;
  &:focus { border-color: ${({ theme }) => theme.colors.text}; }
  &::placeholder { color: ${({ theme }) => theme.colors.textMuted}; }
`;

const AddTaskBtn = styled.button<{ $color: string }>`
  padding: 4px 10px;
  font-family: var(--font-label);
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${({ theme }) => theme.colors.text};
  background: none;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
  cursor: pointer;
  white-space: nowrap;
  &:hover { background: rgba(0,0,0,0.04); }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const EditWrapper = styled.div`
  margin: 20px;
`;

interface MilestoneCardProps {
  milestone: MilestoneEntryData;
  tasks: TaskEntryData[];
  goalTitle: string | null;
  goalOptions: { id: number; title: string }[];
  accentColor: string;
  isEditing: boolean;
  onSelect: () => void;
  onClose: () => void;
  onSaved: () => void;
  onToggleTask: (t: TaskEntryData) => void;
  onUnlinkTask: (t: TaskEntryData) => void;
  onCreateTask: (milestoneId: number, title: string) => Promise<void>;
  onLinkTask?: (milestoneId: number, taskId: number) => void;
}

export function MilestoneCard({ milestone, tasks, goalTitle, goalOptions, accentColor, isEditing, onSelect, onClose, onSaved, onToggleTask, onUnlinkTask, onCreateTask, onLinkTask }: MilestoneCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: milestone.id });
  const dragStyle = { transform: CSS.Transform.toString(transform), transition };

  const { encryptPost } = useEncryption();
  const updateDecryptedEntry = useEntriesStore(s => s.updateDecryptedEntry);
  const removeEntry = useEntriesStore(s => s.removeEntry);

  const [editContent, setEditContent] = useState(milestone.content);
  const [editFields, setEditFields] = useState<MilestoneFieldValues>({
    milestoneStatus: (milestone.milestoneStatus as MilestoneFieldValues['milestoneStatus']) || 'not_started',
    targetDate: milestone.targetDate,
    isCompleted: milestone.isCompleted,
    parentGoalId: milestone.parentGoalId,
  });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [creatingTask, setCreatingTask] = useState(false);

  // Reset edit state when card opens for editing
  useEffect(() => {
    if (isEditing) {
      setEditContent(milestone.content);
      setEditFields({
        milestoneStatus: (milestone.milestoneStatus as MilestoneFieldValues['milestoneStatus']) || 'not_started',
        targetDate: milestone.targetDate,
        isCompleted: milestone.isCompleted,
        parentGoalId: milestone.parentGoalId,
      });
      setStatus('');
      setNewTaskTitle('');
    }
  }, [isEditing, milestone.content, milestone.milestoneStatus, milestone.targetDate, milestone.isCompleted, milestone.parentGoalId]);

  const linkedTasks = tasks.filter(t => t.parentMilestoneId === milestone.id);
  const availableTasks = tasks.filter(t => t.parentMilestoneId !== milestone.id);
  const completedCount = linkedTasks.filter(t => t.isCompleted).length;
  const progress = linkedTasks.length > 0 ? Math.round((completedCount / linkedTasks.length) * 100) : 0;

  const handleSave = async () => {
    setSaving(true); setStatus('');
    try {
      const cf = { ...milestone.customFields, ...editFields };
      const metadata: Record<string, unknown> = { _taxonomyId: milestone.taxonomyId, _customFields: cf };
      const encrypted = await encryptPost(editContent, metadata);
      await entriesApi.update(milestone.id, {
        contentEncrypted: encrypted.contentEncrypted, contentIv: encrypted.contentIv,
        metadataEncrypted: encrypted.metadataEncrypted, metadataIv: encrypted.metadataIv,
        taxonomyIds: [milestone.taxonomyId],
      });
      updateDecryptedEntry(milestone.id, { content: editContent, metadata });
      onSaved();
    } catch (err) { console.error('Milestone save failed:', err); setStatus('Failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    try {
      await entriesApi.delete(milestone.id);
      removeEntry(milestone.id);
      onClose();
    } catch (err) { console.error('Milestone delete failed:', err); setStatus('Delete failed'); }
  };

  return (
    <Card ref={setNodeRef} style={dragStyle} $editing={isEditing} $dragging={isDragging} $accentColor={accentColor}>
      <CardHeader onClick={onSelect} $active={isEditing} {...attributes} {...listeners}>
        <ContentWrap>
          <TitleRow>
            <Title $completed={milestone.isCompleted}>{milestone.title}</Title>
          </TitleRow>
          {linkedTasks.length > 0 && <div style={{ marginTop: 6 }}><ProgressBar percent={progress} color={accentColor} /></div>}
          <FooterMeta>
            {goalTitle && <><span>Goal: {goalTitle}</span><span>·</span></>}
            <span>{milestone.isCompleted ? 'Completed' : milestone.milestoneStatus === 'in_progress' ? 'In Progress' : 'Not Started'}</span>
            {linkedTasks.length > 0 && <><span>·</span><span>{completedCount}/{linkedTasks.length} tasks</span></>}
          </FooterMeta>
        </ContentWrap>
      </CardHeader>
      {isEditing && (
        <EditWrapper>
        <InlineEditPanel
          title="Editing Milestone"
          editor={<Editor content={editContent} onChange={setEditContent} placeholder="Milestone description..." />}
          fields={
            <>
              <MilestoneFields
                values={editFields}
                onChange={setEditFields}
                goalOptions={goalOptions}
                linkedTasks={linkedTasks.map(t => ({ id: t.id, title: t.title, isCompleted: t.isCompleted }))}
              />
              <TaskSectionLabel>Tasks ({completedCount}/{linkedTasks.length})</TaskSectionLabel>
              {linkedTasks.map(t => (
                <TaskRow key={t.id}>
                  <Checkbox
                    checked={t.isCompleted}
                    onChange={() => onToggleTask(t)}
                  />
                  <TaskTitle $completed={t.isCompleted}>{t.title}</TaskTitle>
                  <RemoveBtn title="Remove from milestone" onClick={() => onUnlinkTask(t)}>
                    <Icon name="trash" size={14} strokeWidth={2} />
                  </RemoveBtn>
                </TaskRow>
              ))}
              {onLinkTask && (
                <AddTaskRow onSubmit={e => e.preventDefault()}>
                  <LinkSelect
                    value=""
                    onChange={e => {
                      const id = parseInt(e.target.value);
                      if (id) onLinkTask(milestone.id, id);
                    }}
                  >
                    <option value="">Link task...</option>
                    {availableTasks.map(t => (
                      <option key={t.id} value={t.id}>{t.title}</option>
                    ))}
                  </LinkSelect>
                </AddTaskRow>
              )}
              <AddTaskRow onSubmit={async e => {
                e.preventDefault();
                if (!newTaskTitle.trim() || creatingTask) return;
                setCreatingTask(true);
                try {
                  await onCreateTask(milestone.id, newTaskTitle.trim());
                  setNewTaskTitle('');
                } finally { setCreatingTask(false); }
              }}>
                <AddTaskInput
                  value={newTaskTitle}
                  onChange={e => setNewTaskTitle(e.target.value)}
                  placeholder="Or create new task..."
                  disabled={creatingTask}
                />
                <AddTaskBtn $color={accentColor} type="submit" disabled={!newTaskTitle.trim() || creatingTask}>
                  {creatingTask ? '...' : 'Add'}
                </AddTaskBtn>
              </AddTaskRow>
            </>
          }
          accentColor={accentColor}
          saving={saving}
          status={status}
          onSave={handleSave}
          onCancel={onClose}
          onDelete={handleDelete}
        />
        </EditWrapper>
      )}
    </Card>
  );
}
