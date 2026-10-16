import { useState } from 'react';
import styled from 'styled-components';
import { Icon } from '../atoms/core/Icon.jsx';
import { IconPicker } from './IconPicker.js';
import { Checkbox } from '../atoms/Checkbox.js';
import type { UserFieldDef } from '../../types/userFields.js';

const Card = styled.div`
  margin: 8px;
  padding: 12px;
  border: none;
  border-radius: 0;
  background: transparent;
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const Input = styled.input`
  width: 100%;
  padding: 8px 10px;
  font-size: 16px;
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
  outline: none;
  &:focus { border-color: ${({ theme }) => theme.colors.accent}; }
`;

const IconSection = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
  padding: 8px;
`;

const IconLabel = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textMuted};
  margin-bottom: 4px;
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
`;

const PrimaryBtn = styled.button<{ $color: string; $disabled?: boolean }>`
  flex: 1;
  padding: 8px;
  font-size: 16px;
  font-weight: 600;
  color: white;
  background: ${({ $color, $disabled, theme }) => $disabled ? theme.colors.border : $color};
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  cursor: ${({ $disabled }) => $disabled ? 'not-allowed' : 'pointer'};
`;

const GhostBtn = styled.button`
  padding: 8px 16px;
  font-size: 16px;
  color: ${({ theme }) => theme.colors.textSecondary};
  background: none;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  cursor: pointer;
  &:hover { background: rgba(0, 0, 0, 0.04); }
`;

/* ── Custom fields section ── */

const FieldsSection = styled.div`
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  padding-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const FieldsSectionLabel = styled.div`
  font-size: 13px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05rem;
  color: ${({ theme }) => theme.colors.textMuted};
  margin-bottom: 2px;
`;

const FieldRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;

const FieldLabelInput = styled.input`
  flex: 1;
  padding: 5px 8px;
  font-size: 15px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
  outline: none;
  background: transparent;
  color: ${({ theme }) => theme.colors.text};
  &:focus { border-color: ${({ theme }) => theme.colors.accent}; }
`;

const TypeSelect = styled.select`
  padding: 5px 6px;
  font-size: 14px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
  background: transparent;
  color: ${({ theme }) => theme.colors.text};
  outline: none;
  cursor: pointer;
`;

const IconActionBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  background: none;
  border: none;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: 13px;
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
  &:hover { color: ${({ theme }) => theme.colors.text}; background: rgba(0,0,0,0.06); }
`;

const AddFieldRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;

const AddFieldBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textMuted};
  background: none;
  border: none;
  cursor: pointer;
  padding: 3px 0;
  &:hover { color: ${({ theme }) => theme.colors.text}; }
`;

const FIELD_TYPES: { value: UserFieldDef['type']; label: string }[] = [
  { value: 'text',    label: 'Text' },
  { value: 'number',  label: 'Number' },
  { value: 'date',    label: 'Date' },
  { value: 'boolean', label: 'Yes/No' },
  { value: 'url',     label: 'URL' },
];

interface TopicEditFormProps {
  name: string;
  icon: string | null;
  accentColor: string;
  saving?: boolean;
  saveLabel?: string;
  cancelLabel?: string;
  onNameChange: (name: string) => void;
  onIconChange: (icon: string | null) => void;
  onSave: () => void;
  onCancel: () => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  // Custom fields
  topicId?: number;
  fieldDefs?: UserFieldDef[];
  onFieldDefsChange?: (defs: UserFieldDef[]) => void;
  // Entry editor option: hide the main text area for this topic's entries
  hideTextField?: boolean;
  onHideTextFieldChange?: (hide: boolean) => void;
}

export function TopicEditForm({
  name, icon, accentColor, saving, saveLabel = 'Save', cancelLabel = 'Cancel',
  onNameChange, onIconChange, onSave, onCancel, onKeyDown,
  topicId, fieldDefs = [], onFieldDefsChange,
  hideTextField = false, onHideTextFieldChange,
}: TopicEditFormProps) {
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState<UserFieldDef['type']>('text');
  const [adding, setAdding] = useState(false);

  const handleAddField = () => {
    if (!newLabel.trim()) return;
    const def: UserFieldDef = { id: `${Date.now()}`, label: newLabel.trim(), type: newType };
    onFieldDefsChange?.([...fieldDefs, def]);
    setNewLabel('');
    setNewType('text');
    setAdding(false);
  };

  const handleRemoveField = (id: string) => {
    onFieldDefsChange?.(fieldDefs.filter(f => f.id !== id));
  };

  const handleLabelChange = (id: string, label: string) => {
    onFieldDefsChange?.(fieldDefs.map(f => f.id === id ? { ...f, label } : f));
  };

  const handleTypeChange = (id: string, type: UserFieldDef['type']) => {
    onFieldDefsChange?.(fieldDefs.map(f => f.id === id ? { ...f, type } : f));
  };

  return (
    <Card>
      <Input
        value={name}
        onChange={e => onNameChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') onSave();
          if (e.key === 'Escape') onCancel();
          onKeyDown?.(e);
        }}
        placeholder="Topic name"
        autoFocus
      />
      <IconSection>
        <IconLabel>Icon (optional)</IconLabel>
        <IconPicker selectedIcon={icon} onSelectIcon={onIconChange} />
      </IconSection>

      {topicId !== undefined && onFieldDefsChange && (
        <FieldsSection>
          <FieldsSectionLabel>Custom Fields</FieldsSectionLabel>
          {fieldDefs.map(f => (
            <FieldRow key={f.id}>
              <FieldLabelInput
                value={f.label}
                onChange={e => handleLabelChange(f.id, e.target.value)}
                onBlur={e => { if (!e.target.value.trim()) handleRemoveField(f.id); }}
              />
              <TypeSelect value={f.type} onChange={e => handleTypeChange(f.id, e.target.value as UserFieldDef['type'])}>
                {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </TypeSelect>
              <IconActionBtn onClick={() => handleRemoveField(f.id)} title="Remove field">
                <Icon name="x" size={14} strokeWidth={2} />
              </IconActionBtn>
            </FieldRow>
          ))}
          {adding ? (
            <AddFieldRow>
              <FieldLabelInput
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleAddField();
                  if (e.key === 'Escape') { setAdding(false); setNewLabel(''); }
                }}
                placeholder="Field name"
                autoFocus
              />
              <TypeSelect value={newType} onChange={e => setNewType(e.target.value as UserFieldDef['type'])}>
                {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </TypeSelect>
              <IconActionBtn onClick={handleAddField} title="Add">
                <Icon name="plus" size={14} strokeWidth={2} />
              </IconActionBtn>
              <IconActionBtn onClick={() => { setAdding(false); setNewLabel(''); }} title="Cancel">
                <Icon name="x" size={14} strokeWidth={2} />
              </IconActionBtn>
            </AddFieldRow>
          ) : (
            <AddFieldBtn onClick={() => setAdding(true)}>
              <Icon name="plus" size={10} strokeWidth={2} />
              Add field
            </AddFieldBtn>
          )}
        </FieldsSection>
      )}

      {topicId !== undefined && onHideTextFieldChange && (
        <Checkbox
          checked={hideTextField}
          onChange={onHideTextFieldChange}
          label="Hide main text field (entries use custom fields; notes can be expanded)"
        />
      )}

      <Actions>
        <PrimaryBtn $color={accentColor} $disabled={saving || !name.trim()} disabled={saving || !name.trim()} onClick={() => {
          if (adding && newLabel.trim()) handleAddField();
          onSave();
        }}>
          {saving ? 'Saving...' : saveLabel}
        </PrimaryBtn>
        <GhostBtn onClick={onCancel}>{cancelLabel}</GhostBtn>
      </Actions>
    </Card>
  );
}
