import { useState } from 'react';
import styled from 'styled-components';
import { Icon } from '../atoms/core/Icon.jsx';
import { Toggle } from '../atoms/Toggle.js';
import { PillButton } from '../atoms/PillButton.js';
import { IconPicker, TopicIcon } from './IconPicker.js';
import type { UserFieldDef } from '../../types/userFields.js';

/* Topic editor: an outlined icon tile (tap to pick an icon) beside the name as
   a big thin title; "Custom fields" — one outlined box of rows (name typed in
   place, a type pill, ×) ending in "+ Add field"; a "Hide main text field"
   card with a switch; Close + Save topic. Props only. */

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  padding: 8px 0;
`;

const Top = styled.div`
  display: flex;
  align-items: center;
  gap: 20px;
`;

const IconTile = styled.button<{ $open: boolean }>`
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  padding: 0;
  border: 1px solid ${({ $open }) => ($open ? 'var(--color-accent)' : 'var(--border-card)')};
  border-radius: 10px;
  background: transparent;
  color: var(--color-accent);
  cursor: pointer;
  &:hover { border-color: var(--control-border); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

const NameInput = styled.input`
  && {
    flex: 1;
    min-width: 0;
    padding: 0;
    border: none !important;
    background: transparent !important;
    outline: none;
    font-family: var(--font-display);
    font-size: 32px;
    font-weight: 300;
    line-height: 1.2;
    color: var(--text-primary);
  }
  &::placeholder { color: var(--text-hint); }
`;

const PickerBox = styled.div`
  margin-top: 14px;
  padding: 12px;
  border: 1px solid var(--border-card);
  border-radius: 10px;
`;

const Label = styled.div`
  margin-top: 32px;
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: 500;
  color: var(--text-soft);
`;

const Sub = styled.div`
  margin: 4px 0 12px;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-muted);
`;

const Box = styled.div`
  border: 1px solid var(--border-card);
  border-radius: 10px;
  overflow: hidden;
`;

const FieldRow = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 48px;
  padding: 6px 12px 6px 16px;
  & + & { border-top: 1px solid color-mix(in srgb, var(--border-card) 70%, var(--bg-app)); }
`;

const LabelInput = styled.input`
  && {
    flex: 1;
    min-width: 0;
    padding: 0;
    border: none !important;
    background: transparent !important;
    outline: none;
    font-family: var(--font-sans);
    font-size: 15px;
    color: var(--text-secondary);
  }
  &::placeholder { color: var(--text-hint); }
`;

/* "Text ⌄" — an outlined pill holding the select */
const TypePill = styled.label`
  position: relative;
  flex: none;
  display: inline-flex;
  align-items: center;
  height: 30px;
  border: 1px solid var(--border-card);
  border-radius: 999px;
  &:focus-within { border-color: var(--color-accent); }
  select {
    height: 100%;
    padding: 0 30px 0 14px;
    border: none;
    background: transparent;
    appearance: none;
    outline: none;
    font-family: var(--font-sans);
    font-size: 13px;
    color: var(--text-soft);
    cursor: pointer;
  }
  option { color: var(--text-primary); background: var(--bg-surface); }
  & > span { position: absolute; right: 10px; display: inline-flex; color: var(--text-muted); pointer-events: none; }
`;

const RemoveBtn = styled.button`
  flex: none;
  display: inline-flex;
  padding: 4px;
  border: none;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  &:hover { color: var(--color-danger); }
`;

const AddField = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 46px;
  padding: 0 16px;
  border: none;
  border-top: 1px solid color-mix(in srgb, var(--border-card) 70%, var(--bg-app));
  background: transparent;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--color-accent-link);
  cursor: pointer;
  text-align: left;
  &:hover:not(:disabled) { background: var(--bg-row-hover); }
  &:disabled { color: var(--text-disabled); cursor: default; }
  &:first-child { border-top: none; }
`;

const OptionCard = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 20px;
  padding: 14px 18px;
  border: 1px solid var(--border-card);
  border-radius: 10px;
  font-family: var(--font-sans);
  /* Scoped to the text block — a bare "span" rule would reach the switch's knob */
  .opt-title { display: block; font-weight: 400; font-size: 15px; color: var(--text-secondary); }
  .opt-note { display: block; margin-top: 3px; font-size: 13px; color: var(--text-muted); }
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 28px;
`;

/* Delete topic: neutral until hovered, then danger red; on the left */
const DeleteBtn = styled(PillButton)`
  margin-right: auto;
  &&:hover:not(:disabled) { color: var(--color-danger); border-color: var(--color-danger); background: transparent; }
`;

/* The inline "are you sure": its own grey-shaded box above the action
   row — the question, then red Delete beside Keep it */
const Confirm = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 14px 20px;
  margin-top: 28px;
  padding: 18px 20px;
  border: 1px solid var(--border-card);
  border-radius: var(--r-lg, 6px);
  background: var(--bg-panel);
  font-size: 15px;
  line-height: 1.45;
  color: var(--text-secondary);
  & > div { display: flex; gap: 10px; flex-shrink: 0; }
`;

const DangerPill = styled(PillButton)`
  && { color: var(--color-danger); border-color: var(--color-danger); }
  &&:hover:not(:disabled) { background: color-mix(in srgb, var(--color-danger) 12%, transparent); }
`;

const FIELD_TYPES: { value: UserFieldDef['type']; label: string }[] = [
  { value: 'text',    label: 'Text' },
  { value: 'number',  label: 'Number' },
  { value: 'date',    label: 'Date' },
  { value: 'boolean', label: 'Yes/No' },
  { value: 'url',     label: 'URL' },
];

function TypeSelect({ value, onChange, label }: { value: UserFieldDef['type']; onChange: (t: UserFieldDef['type']) => void; label: string }) {
  return (
    <TypePill>
      <select aria-label={label} value={value} onChange={e => onChange(e.target.value as UserFieldDef['type'])}>
        {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
      <span aria-hidden="true"><Icon name="chevron-down" size={13} strokeWidth={2} /></span>
    </TypePill>
  );
}

interface TopicEditFormProps {
  name: string;
  icon: string | null;
  /** Kept for existing callers; the form draws in the accent token */
  accentColor?: string;
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
  /** Delete the topic (asks once, inline). Left out → no Delete button */
  onDelete?: () => void;
}

export function TopicEditForm({
  name, icon, saving, saveLabel = 'Save topic', cancelLabel = 'Cancel',
  onNameChange, onIconChange, onSave, onCancel, onKeyDown,
  topicId, fieldDefs = [], onFieldDefsChange,
  hideTextField = false, onHideTextFieldChange, onDelete,
}: TopicEditFormProps) {
  const [picking, setPicking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState<UserFieldDef['type']>('text');
  const [adding, setAdding] = useState(false);

  const handleAddField = (keepAdding = false) => {
    if (!newLabel.trim()) return;
    const def: UserFieldDef = { id: `${Date.now()}`, label: newLabel.trim(), type: newType };
    onFieldDefsChange?.([...fieldDefs, def]);
    setNewLabel('');
    setNewType('text');
    setAdding(keepAdding);
  };

  // "+ Add field" is always there: it keeps a field being typed and opens
  // another blank row, so several fields can be added in one go
  const addAnother = () => {
    if (adding && newLabel.trim()) handleAddField(true);
    else setAdding(true);
  };

  const removeField = (id: string) => onFieldDefsChange?.(fieldDefs.filter(f => f.id !== id));
  const patchField = (id: string, patch: Partial<UserFieldDef>) =>
    onFieldDefsChange?.(fieldDefs.map(f => (f.id === id ? { ...f, ...patch } : f)));

  return (
    <Wrap>
      <Top>
        <IconTile type="button" $open={picking} aria-expanded={picking} aria-label="Choose an icon" title="Choose an icon" onClick={() => setPicking(p => !p)}>
          <TopicIcon name={icon} size={24} />
        </IconTile>
        <NameInput
          value={name}
          onChange={e => onNameChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') onSave();
            if (e.key === 'Escape') onCancel();
            onKeyDown?.(e);
          }}
          placeholder="Topic name"
          aria-label="Topic name"
          autoFocus
        />
      </Top>
      {picking && (
        <PickerBox>
          <IconPicker selectedIcon={icon} onSelectIcon={i => { onIconChange(i); setPicking(false); }} />
        </PickerBox>
      )}

      {topicId !== undefined && onFieldDefsChange && (
        <>
          <Label>Custom fields</Label>
          <Sub>Shown on every entry in this topic</Sub>
          <Box>
            {fieldDefs.map(f => (
              <FieldRow key={f.id}>
                <LabelInput
                  aria-label="Field name"
                  value={f.label}
                  onChange={e => patchField(f.id, { label: e.target.value })}
                  onBlur={e => { if (!e.target.value.trim()) removeField(f.id); }}
                />
                <TypeSelect label={`${f.label} type`} value={f.type} onChange={t => patchField(f.id, { type: t })} />
                <RemoveBtn type="button" onClick={() => removeField(f.id)} aria-label={`Remove ${f.label}`} title="Remove field">
                  <Icon name="x" size={14} strokeWidth={2} />
                </RemoveBtn>
              </FieldRow>
            ))}
            {adding && (
              <FieldRow>
                <LabelInput
                  aria-label="New field name"
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); handleAddField(true); }
                    if (e.key === 'Escape') { setAdding(false); setNewLabel(''); }
                  }}
                  placeholder="Field name"
                  autoFocus
                />
                <TypeSelect label="New field type" value={newType} onChange={setNewType} />
                <RemoveBtn type="button" onClick={() => { setAdding(false); setNewLabel(''); }} aria-label="Cancel new field" title="Cancel">
                  <Icon name="x" size={14} strokeWidth={2} />
                </RemoveBtn>
              </FieldRow>
            )}
            {/* Disabled only while the blank row is still empty */}
            <AddField type="button" disabled={adding && !newLabel.trim()} onClick={addAnother}>+ Add field</AddField>
          </Box>
        </>
      )}

      {topicId !== undefined && onHideTextFieldChange && (
        <OptionCard>
          <div>
            <strong className="opt-title">Hide main text field</strong>
            <span className="opt-note">Entries use custom fields; notes can be expanded</span>
          </div>
          <Toggle checked={hideTextField} aria-label="Hide main text field" onChange={onHideTextFieldChange} />
        </OptionCard>
      )}

      {onDelete && confirmDelete && (
        <Confirm role="alert">
          <span>Delete “{name.trim() || 'this topic'}”? Entries keep their data but lose this topic.</span>
          <div>
            <DangerPill type="button" onClick={onDelete}>Delete</DangerPill>
            <PillButton type="button" $variant="neutral" onClick={() => setConfirmDelete(false)}>Keep it</PillButton>
          </div>
        </Confirm>
      )}

      <Actions>
        {onDelete && !confirmDelete && (
          <DeleteBtn type="button" $variant="neutral" onClick={() => setConfirmDelete(true)}>Delete topic</DeleteBtn>
        )}
        <PillButton type="button" $variant="neutral" onClick={onCancel}>{cancelLabel}</PillButton>
        <PillButton type="button" disabled={saving || !name.trim()} onClick={() => {
          if (adding && newLabel.trim()) handleAddField();
          onSave();
        }}>
          {saving ? 'Saving…' : saveLabel}
        </PillButton>
      </Actions>
    </Wrap>
  );
}
