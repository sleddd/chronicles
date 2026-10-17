import { useEffect, useRef, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { TopicIcon as TopicGlyph } from '../molecules/IconPicker.js';
import { useUIStore } from '../../stores/uiStore.js';
import type { Topic } from '../../types/topics.js';
import { DEFAULT_ACCENT_COLOR } from '../../styles/accent.js';

interface TopicSelectorDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTopicId: number | null;
  onSelect: (topicId: number | null) => void;
  topics: Topic[];
}

const slideIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(-8px) scaleY(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scaleY(1);
  }
`;

const Wrapper = styled.div`
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 50;
  margin-top: 4px;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  background: var(--paper-surface, ${({ theme }) => theme.colors.surface});
  border: 1px solid var(--accent-stroke, ${({ theme }) => theme.colors.border});
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  box-shadow: ${({ theme }) => theme.shadow.lg};
  width: 256px;
  max-height: 320px;
  overflow-y: auto;
  animation: ${slideIn} 150ms ease-out forwards;
  transform-origin: top center;
`;

const SearchInput = styled.input`
  position: sticky;
  top: 0;
  width: 100%;
  padding: 8px 12px;
  border: none;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  background: var(--paper-surface, ${({ theme }) => theme.colors.surface});
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  font-size: 18px;
  color: ${({ theme }) => theme.colors.text};
  outline: none;
  box-sizing: border-box;

  &::placeholder {
    color: ${({ theme }) => theme.colors.textMuted};
  }
`;

const ItemList = styled.div`
  display: flex;
  flex-direction: column;
`;

const Item = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 14px;
  font-size: ${({ theme }) => theme.fontSize.sm}px;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ $active }) => $active ? 'rgba(0,0,0,0.04)' : 'transparent'};
  border: none;
  cursor: pointer;
  text-align: left;

  &:hover {
    background: rgba(0, 0, 0, 0.04);
  }
`;

const TopicIcon = styled.span<{ $color?: string }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  color: ${({ theme }) => theme.colors.text};
  font-size: 18px;
  flex-shrink: 0;
`;

const ManageLink = styled.button`
  display: block;
  width: 100%;
  padding: 8px 12px;
  font-size: ${({ theme }) => theme.fontSize.sm}px;
  color: ${({ theme }) => theme.colors.accent};
  background: transparent;
  border: none;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  cursor: pointer;
  text-align: left;

  &:hover {
    text-decoration: underline;
  }
`;

export function TopicSelectorDropdown({
  isOpen,
  onClose,
  selectedTopicId,
  onSelect,
  topics,
}: TopicSelectorDropdownProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const accentColor = useUIStore(s => s.accentColor) || DEFAULT_ACCENT_COLOR;

  useEffect(() => {
    if (!isOpen) {
      setSearch('');
      return;
    }

    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        onClose();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filtered = topics.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Wrapper ref={wrapperRef}>
      <SearchInput
        type="text"
        placeholder="Search topics..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        autoFocus
      />
      <ItemList>
        <Item
          $active={selectedTopicId === null}
          onClick={() => {
            onSelect(null);
            onClose();
          }}
        >
          No topic
        </Item>
        {filtered.map((topic) => (
          <Item
            key={topic.id}
            $active={selectedTopicId === topic.id}
            onClick={() => {
              onSelect(topic.id);
              onClose();
            }}
          >
            <TopicIcon $color={accentColor}>
              <TopicGlyph name={topic.icon} size={15} />
            </TopicIcon>
            {topic.name}
          </Item>
        ))}
      </ItemList>
      <ManageLink onClick={onClose}>Manage Topics...</ManageLink>
    </Wrapper>
  );
}
