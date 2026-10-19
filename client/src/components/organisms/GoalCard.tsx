import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { Icon } from '../atoms/core/Icon.jsx';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ProgressBar } from '../atoms/ProgressBar.js';
import { Badge } from '../atoms/Badge.js';
import { Checkbox } from '../atoms/Checkbox.js';
import { Spinner } from '../atoms/Spinner.js';
import { InlineEditPanel } from '../molecules/InlineEditPanel.js';
import { Editor } from './Editor.js';
import { GoalFields, type GoalFieldValues } from '../molecules/fields/GoalFields.js';
import { useEncryption } from '../../contexts/EncryptionContext.js';
import { useDecryptedImage } from '../../hooks/useDecryptedImage.js';
import { useEntriesStore } from '../../stores/entriesStore.js';
import { entries as entriesApi } from '../../services/api.js';
import type { GoalEntry, MilestoneEntryData, RoadmapStatus } from '../../types/goals.js';
import { normalizeRoadmapStatus } from '../../types/goals.js';

const Card = styled.div<{ $isDragging?: boolean; $editing?: boolean; $accentColor?: string }>`
  background: ${({ $isDragging }) => $isDragging ? 'var(--bg-surface, #fff)' : 'transparent'};
  border: none;
  border-top: 1px solid var(--border-subtle);
  border-radius: 0;
  margin: 0;
  min-width: 0;
  opacity: ${({ $isDragging }) => $isDragging ? 0.7 : 1};
  box-shadow: ${({ $isDragging }) => $isDragging ? '0 4px 12px rgba(0,0,0,0.15)' : 'none'};
`;

const CardHeader = styled.div<{ $active?: boolean }>`
  padding: 18px 12px;
  cursor: grab;
  touch-action: none;
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
  align-items: start;
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

/* Featured image banner across the top of the card */
const CardImage = styled.img`
  width: 100%;
  height: 110px;
  object-fit: cover;
  display: block;
  border-radius: var(--r-lg, 2px);
  margin-bottom: 4px;
`;

function GoalCardImage({ image }: { image: { key: string; iv: string; mimeType: string } }) {
  const { url } = useDecryptedImage(image.key, image.iv, image.mimeType);
  if (!url) return null;
  return <CardImage src={url} alt="" />;
}

const TitleRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
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


const MilestoneSectionLabel = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-top: 16px;
  padding-top: 12px;
  margin-bottom: 4px;
`;

const MilestoneRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 15px;
`;

const MilestoneTitle = styled.span<{ $completed?: boolean }>`
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

const AddRow = styled.form`
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

const AddInput = styled.input`
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

const AddBtn = styled.button<{ $color: string }>`
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
  &:hover { opacity: 0.9; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const EditWrapper = styled.div`
  margin: 20px;
`;

interface GoalCardProps {
  goal: GoalEntry;
  milestones: MilestoneEntryData[];
  accentColor: string;
  isEditing: boolean;
  onSelect: () => void;
  onClose: () => void;
  onSaved: () => void;
  onToggleMilestone: (m: MilestoneEntryData) => void;
  onUnlinkMilestone: (m: MilestoneEntryData) => void;
  onLinkMilestone: (goalId: number, milestoneId: number) => void;
  onCreateMilestone: (goalId: number, title: string) => Promise<void>;
  roadmapStatus?: RoadmapStatus;
}

export function GoalCard({ goal, milestones, accentColor, isEditing, onSelect, onClose, onSaved, onToggleMilestone, onUnlinkMilestone, onLinkMilestone, onCreateMilestone, roadmapStatus }: GoalCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: goal.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const { encryptPost } = useEncryption();
  const updateDecryptedEntry = useEntriesStore(s => s.updateDecryptedEntry);
  const removeEntry = useEntriesStore(s => s.removeEntry);

  const [editContent, setEditContent] = useState(goal.content);
  const [editFields, setEditFields] = useState<GoalFieldValues>({
    goalType: (goal.goalType as GoalFieldValues['goalType']) || 'short_term',
    goalStatus: normalizeRoadmapStatus(goal.goalStatus),
    targetDate: goal.targetDate,
  });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  // Reset edit state when card opens for editing
  useEffect(() => {
    if (isEditing) {
      setEditContent(goal.content);
      setEditFields({
        goalType: (goal.goalType as GoalFieldValues['goalType']) || 'short_term',
        goalStatus: normalizeRoadmapStatus(goal.goalStatus),
        targetDate: goal.targetDate,
      });
      setStatus('');
    }
  }, [isEditing, goal.content, goal.goalType, goal.goalStatus, goal.targetDate]);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('');
  const [creatingMilestone, setCreatingMilestone] = useState(false);

  const linkedMilestones = milestones.filter(m => m.parentGoalId === goal.id);
  const linkedIds = new Set(linkedMilestones.map(m => m.id));
  const availableMilestones = milestones.filter(m => !linkedIds.has(m.id));
  const completedCount = linkedMilestones.filter(m => m.isCompleted).length;
  const progress = linkedMilestones.length > 0 ? Math.round((completedCount / linkedMilestones.length) * 100) : 0;

  const handleSave = async () => {
    setSaving(true); setStatus('');
    try {
      const cf = { ...goal.customFields, ...editFields };
      const metadata: Record<string, unknown> = { _taxonomyId: goal.taxonomyId, _customFields: cf };
      const encrypted = await encryptPost(goal.id, editContent, metadata);
      await entriesApi.update(goal.id, {
        contentEncrypted: encrypted.contentEncrypted, contentIv: encrypted.contentIv,
        metadataEncrypted: encrypted.metadataEncrypted, metadataIv: encrypted.metadataIv,
        taxonomyIds: [goal.taxonomyId],
      });
      updateDecryptedEntry(goal.id, { content: editContent, metadata });
      onSaved();
    } catch (err) { console.error('Goal save failed:', err); setStatus('Failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    try {
      await entriesApi.delete(goal.id);
      removeEntry(goal.id);
      onClose();
    } catch (err) { console.error('Goal delete failed:', err); setStatus('Delete failed'); }
  };

  return (
    <Card ref={setNodeRef} style={style} $isDragging={isDragging} $editing={isEditing} $accentColor={accentColor}>
      <CardHeader onClick={onSelect} $active={isEditing} {...attributes} {...listeners}>
        <ContentWrap>
          {goal.featuredImage && <GoalCardImage image={goal.featuredImage} />}
          <TitleRow>
            <Title $completed={roadmapStatus === 'completed'}>{goal.title}</Title>
          </TitleRow>
          {linkedMilestones.length > 0 && <div style={{ marginTop: 6 }}><ProgressBar percent={progress} color={accentColor} /></div>}
          {linkedMilestones.length > 0 && (
            <FooterMeta>
              <span>{completedCount}/{linkedMilestones.length} milestones</span>
            </FooterMeta>
          )}
        </ContentWrap>
      </CardHeader>

      {isEditing && (
        <EditWrapper>
        <InlineEditPanel
          title="Editing Goal"
          editor={<Editor content={editContent} onChange={setEditContent} placeholder="Goal description..." />}
          fields={
            <>
              <GoalFields values={editFields} onChange={setEditFields} />
              <MilestoneSectionLabel>Milestones ({completedCount}/{linkedMilestones.length})</MilestoneSectionLabel>
              {linkedMilestones.map(m => (
                <MilestoneRow key={m.id}>
                  <Checkbox
                    checked={m.isCompleted}
                    onChange={() => onToggleMilestone(m)}
                  />
                  <MilestoneTitle $completed={m.isCompleted}>{m.title}</MilestoneTitle>
                  <RemoveBtn title="Remove from goal" onClick={() => onUnlinkMilestone(m)}>
                    <Icon name="trash" size={14} strokeWidth={2} />
                  </RemoveBtn>
                </MilestoneRow>
              ))}
              <AddRow onSubmit={async e => {
                e.preventDefault();
                if (!newMilestoneTitle.trim() || creatingMilestone) return;
                setCreatingMilestone(true);
                try {
                  await onCreateMilestone(goal.id, newMilestoneTitle.trim());
                  setNewMilestoneTitle('');
                } finally { setCreatingMilestone(false); }
              }}>
                <LinkSelect
                  value=""
                  onChange={e => {
                    const id = parseInt(e.target.value);
                    if (id) onLinkMilestone(goal.id, id);
                  }}
                >
                  <option value="">Link milestone...</option>
                  {availableMilestones.map(m => (
                    <option key={m.id} value={m.id}>{m.title}</option>
                  ))}
                </LinkSelect>
              </AddRow>
              <AddRow onSubmit={async e => {
                e.preventDefault();
                if (!newMilestoneTitle.trim() || creatingMilestone) return;
                setCreatingMilestone(true);
                try {
                  await onCreateMilestone(goal.id, newMilestoneTitle.trim());
                  setNewMilestoneTitle('');
                } finally { setCreatingMilestone(false); }
              }}>
                <AddInput
                  value={newMilestoneTitle}
                  onChange={e => setNewMilestoneTitle(e.target.value)}
                  placeholder="Or create new milestone..."
                  disabled={creatingMilestone}
                />
                <AddBtn $color={accentColor} type="submit" disabled={!newMilestoneTitle.trim() || creatingMilestone}>
                  {creatingMilestone ? '...' : 'Add'}
                </AddBtn>
              </AddRow>
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
