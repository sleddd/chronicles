import { memo, useState } from 'react';
import styled from 'styled-components';
import { Icon } from '../../../../design-system/components/core/Icon.jsx';
import { useEntriesStore } from '../../stores/entriesStore.js';
import { useUIStore } from '../../stores/uiStore.js';
import { TopicIcon as TopicGlyph } from '../molecules/IconPicker.js';
import { TopicSelectorDropdown } from './TopicSelectorDropdown.js';
import { Editor } from './Editor.js';
import { stripHtml } from '../../utils/stripHtml.js';

interface QuickEntryProps {
  onCreateEntry: (content: string, topicId: number | null) => void;
}

const Container = styled.div`
  padding: 16px;
  background: transparent;
`;

const HeaderRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  position: relative;
`;

const TopicTrigger = styled.button<{ $hasColor?: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  font-family: ${({ theme }) => theme.fontFamily.ui};
  font-size: 13px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05rem;
  color: ${({ theme }) => theme.colors.textSecondary};
  background: transparent;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  cursor: pointer;

  &:hover {
    background: rgba(0, 0, 0, 0.04);
  }
`;

const TopicIconSmall = styled.span`
  display: flex;
  align-items: center;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text};
  flex-shrink: 0;
`;

const PlaceholderText = styled.span`
  color: ${({ theme }) => theme.colors.textMuted};
`;

const ChevronIcon = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textMuted};
  margin-left: 2px;
`;

const EditorWrap = styled.div`
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  margin-bottom: 10px;

  /* Compact the TipTap editor for quick entry use */
  & > div { min-height: unset; }
  && .tiptap {
    min-height: 48px;
    padding: 20px 0;
    font-size: 17px;
    font-style: italic;
    line-height: 1.6;
  }
`;

const FooterRow = styled.div`
  display: flex;
  justify-content: flex-end;
`;

const SubmitButton = styled.button<{ $disabled?: boolean }>`
  padding: 0;
  font-family: ${({ theme }) => theme.fontFamily.ui};
  font-size: 13px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05rem;
  color: ${({ theme, $disabled }) =>
    $disabled ? theme.colors.textMuted : theme.colors.text};
  background: transparent;
  border: none;
  cursor: ${({ $disabled }) => ($disabled ? 'not-allowed' : 'pointer')};
  transition: color 0.15s ease;
  white-space: nowrap;

  &:hover {
    color: ${({ theme, $disabled }) =>
      $disabled ? theme.colors.border : theme.colors.text};
  }
`;

export const QuickEntry = memo(function QuickEntry({ onCreateEntry }: QuickEntryProps) {
  const topics = useEntriesStore((s) => s.topics);
  const accentColor = useUIStore(s => s.accentColor) || '#4A5568';

  const [content, setContent] = useState('');
  const [quickTopicId, setQuickTopicId] = useState<number | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const selectedTopic = topics.find((t) => t.id === quickTopicId);
  const isEmpty = !stripHtml(content).trim() && !content.includes('data-type="drawing"');

  function handleSubmit() {
    if (isEmpty) return;
    onCreateEntry(content, quickTopicId);
    setContent('');
  }

  return (
    <Container>
      <HeaderRow>
        <TopicTrigger onClick={() => setDropdownOpen(!dropdownOpen)}>
          {selectedTopic ? (
            <>
              <TopicIconSmall>
                <TopicGlyph name={selectedTopic.icon} size={14} />
              </TopicIconSmall>
              {selectedTopic.name}
            </>
          ) : (
            <PlaceholderText>No topic</PlaceholderText>
          )}
          <ChevronIcon><Icon name="chevron-down" size={14} strokeWidth={2} /></ChevronIcon>
        </TopicTrigger>
        <TopicSelectorDropdown
          isOpen={dropdownOpen}
          onClose={() => setDropdownOpen(false)}
          selectedTopicId={quickTopicId}
          onSelect={setQuickTopicId}
          topics={topics}
        />
      </HeaderRow>
      <EditorWrap>
        <Editor
          content={content}
          onChange={setContent}
          placeholder="Quick entry..."
          onEnterSave={handleSubmit}
          hideToolbarToggle={false}
        />
      </EditorWrap>
      <FooterRow>
        <SubmitButton $disabled={isEmpty} onClick={handleSubmit} disabled={isEmpty}>
          Add
        </SubmitButton>
      </FooterRow>
    </Container>
  );
});
