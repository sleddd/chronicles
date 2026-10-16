import { useEffect, useState } from 'react';
import styled, { css, keyframes } from 'styled-components';
import { Icon } from '../atoms/core/Icon.jsx';
import { Spinner } from '../atoms/Spinner.js';

function isDark(bg: string): boolean {
  const c = bg.replace('#', '');
  if (c.length !== 6) return false;
  return (0.299 * parseInt(c.slice(0,2),16) + 0.587 * parseInt(c.slice(2,4),16) + 0.114 * parseInt(c.slice(4,6),16)) / 255 < 0.5;
}

const overlay = (theme: { colors: { background: string } }, alpha: number) =>
  isDark(theme.colors.background)
    ? `rgba(255,255,255,${alpha})`
    : `rgba(0,0,0,${alpha})`;

const panelExpandIn = keyframes`
  from { opacity: 0.6; transform: scale(0.985); }
  to   { opacity: 1;   transform: scale(1); }
`;

const Panel = styled.div<{ $expanded?: boolean }>`
  position: relative;
  background: var(--bg-sunken);
  margin: 0 0 20px;
  padding: 16px 36px 32px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;

  ${({ $expanded }) => $expanded && css`
    position: fixed;
    inset: 0;
    z-index: 100;
    margin: 0;
    border: none;
    border-radius: 0;
    padding: 32px 48px 48px;
    overflow-y: auto;
    animation: ${panelExpandIn} 160ms ease-out;
    @media (max-width: 640px) { padding: 20px 20px 32px; }
  `}
`;

const CollapseBtn = styled.button`
  position: absolute;
  top: 14px;
  right: 18px;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  transition: color 120ms ease;
  &:hover { color: var(--text-primary); }
`;

/* Section header: tracked uppercase label with a trailing hairline rule. */
const SectionHeader = styled.div<{ $noTopicPicker?: boolean }>`
  display: flex;
  align-items: center;
  gap: 16px;
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  margin: 32px 0 6px;

  &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border-subtle);
  }
`;

const EditorWrap = styled.div<{ $expanded?: boolean }>`
  margin: 0 0 15px;
  overflow: hidden;
  background: transparent;
  border: none;
  border-radius: 0;

  /* Compact the TipTap editor for inline use */
  & > div { min-height: unset; }
  && .tiptap {
    min-height: ${({ $expanded }) => $expanded ? '40vh' : '60px'};
    padding: 12px 0;
    font-family: var(--sans, 'Lato', sans-serif);
    font-style: italic;
    font-size: 16px;
    line-height: 1.6;
  }
`;

const FieldsWrap = styled.div`
  padding: 0;
  width: 100%;
  margin-bottom: 10px;
`;

const FieldsSectionWrap = styled.div`
  margin-top: 50px;
`;

const FieldsContent = styled.div`
  padding: 0;
`;

const Actions = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
  padding: 24px 0;
  flex-wrap: wrap;
`;

/* Catch-all delete — quiet gray text that turns red on hover. */
const DeleteBtn = styled.button`
  margin-right: auto;
  padding: 6px 0;
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-disabled);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: color 0.15s;
  &:hover { color: var(--color-danger, #dc3232); }
`;

const ActionBtn = styled.button`
  padding: 6px 16px;
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-tertiary);
  background: transparent;
  border: 1px solid var(--text-tertiary);
  border-radius: 999px;
  cursor: pointer;
  transition: opacity 0.15s;
  min-width: 80px;
  &:hover { opacity: 0.7; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const SaveBtn = styled.button<{ $error?: boolean }>`
  padding: 6px 16px;
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${({ $error }) => $error ? 'var(--color-danger, #dc3232)' : 'var(--color-accent)'};
  background: transparent;
  border: 1px solid ${({ $error }) => $error ? 'var(--color-danger, #dc3232)' : 'var(--color-accent)'};
  border-radius: 999px;
  cursor: pointer;
  transition: opacity 0.15s;
  min-width: 80px;
  &:hover:not(:disabled) { opacity: 0.7; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const EditTitle = styled.div`
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${({ theme }) => theme.colors.textMuted};
  padding: 0 0 8px;
`;

interface InlineEditPanelProps {
  /** Rich-text editor node — omit to show a fields-only panel. */
  editor?: React.ReactNode;
  fields: React.ReactNode;
  accentColor: string;
  saving: boolean;
  status: string;
  onSave: () => void;
  onCancel: () => void;
  title?: string;
  topicSelector?: React.ReactNode;
  /** Hide the "Custom fields" section label above the fields. */
  hideFieldsHeader?: boolean;
  /** Delete the entry being edited — shows a gray "Delete" (red on hover) on the left of the footer. */
  onDelete?: () => void;
}

export function InlineEditPanel({ editor, fields, accentColor, saving, status, onSave, onCancel, title, topicSelector, hideFieldsHeader, onDelete }: InlineEditPanelProps) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);

  return (
    <Panel $expanded={expanded}>
      {expanded && (
        <CollapseBtn title="Collapse" onClick={() => setExpanded(false)} type="button">
          <Icon name="x" size={18} strokeWidth={2} />
        </CollapseBtn>
      )}
      {title && <EditTitle>{title}</EditTitle>}
      {topicSelector && <FieldsWrap>{topicSelector}</FieldsWrap>}
      {editor != null && (
        <EditorWrap
          $expanded={expanded}
          onFocus={() => setExpanded(true)}
          onPointerDown={() => setExpanded(true)}
        >{editor}</EditorWrap>
      )}
      {fields && (hideFieldsHeader ? (
        <FieldsContent style={{ marginTop: 16 }}>{fields}</FieldsContent>
      ) : (
        <FieldsSectionWrap>
          <SectionHeader>Custom fields</SectionHeader>
          <FieldsContent>{fields}</FieldsContent>
        </FieldsSectionWrap>
      ))}
      <Actions>
        {onDelete && (
          <DeleteBtn type="button" onClick={() => { setExpanded(false); onDelete(); }}>
            Delete
          </DeleteBtn>
        )}
        <SaveBtn
          onClick={() => { setExpanded(false); onSave(); }}
          disabled={saving}
          $error={status.toLowerCase().includes('fail')}
        >
          {saving ? <Spinner size={14} /> : status.toLowerCase().includes('fail') ? 'Failed' : 'Save'}
        </SaveBtn>
        <ActionBtn onClick={() => { setExpanded(false); onCancel(); }}>Cancel</ActionBtn>
      </Actions>
    </Panel>
  );
}
