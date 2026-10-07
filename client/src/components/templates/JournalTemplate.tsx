import styled from 'styled-components';
import type { ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronLeft } from '@fortawesome/free-solid-svg-icons';
import { useUIStore } from '../../stores/uiStore.js';
import { BACKGROUND_IMAGES } from '@chronicles/shared';

const ContentArea = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;
`;

const StyledSidePanel = styled.div<{ $hiddenMobile?: boolean; $isDark?: boolean; $lightBg?: boolean }>`
  /* Wide enough for the Date | Topic | Entry columns */
  width: 380px;
  min-width: 380px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  background: var(--bg-app);
  border-right: 1px solid var(--border-subtle);

  @media (max-width: 1024px) {
    width: 100%;
    min-width: 100%;
    max-width: 100%;
    display: ${({ $hiddenMobile }) => $hiddenMobile ? 'none' : 'flex'};
  }
`;

const StyledEditorPanel = styled.div<{ $visibleMobile?: boolean; $isDark?: boolean; $lightBg?: boolean }>`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-app);

  @media (max-width: 1024px) {
    display: ${({ $visibleMobile }) => $visibleMobile ? 'flex' : 'none'};
    width: 100%;
  }
`;

const StyledMobileBackButton = styled.button`
  display: none;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  font-family: ${({ theme }) => theme.fontFamily.ui};
  font-size: 13px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05rem;
  color: ${({ theme }) => theme.colors.text};
  background: none;
  border: none;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  cursor: pointer;
  &:hover { color: ${({ theme }) => theme.colors.text}; }

  @media (max-width: 1024px) {
    display: flex;
  }
`;

/* ── Exported sub-components ── */

interface SidePanelProps {
  hiddenMobile?: boolean;
  children: ReactNode;
}

export function SidePanel({ hiddenMobile, children }: SidePanelProps) {
  const isDark = useUIStore(s => s.themeMode) === 'dark';
  const backgroundImage = useUIStore(s => s.backgroundImage);
  const isLightBg = BACKGROUND_IMAGES.find(bg => bg.value === backgroundImage)?.light ?? false;
  return <StyledSidePanel $hiddenMobile={hiddenMobile} $isDark={isDark} $lightBg={isLightBg}>{children}</StyledSidePanel>;
}

interface EditorPanelProps {
  visibleMobile?: boolean;
  children: ReactNode;
}

export function EditorPanel({ visibleMobile, children }: EditorPanelProps) {
  const isDark = useUIStore(s => s.themeMode) === 'dark';
  const backgroundImage = useUIStore(s => s.backgroundImage);
  const isLightBg = BACKGROUND_IMAGES.find(bg => bg.value === backgroundImage)?.light ?? false;
  return <StyledEditorPanel $visibleMobile={visibleMobile} $isDark={isDark} $lightBg={isLightBg}>{children}</StyledEditorPanel>;
}

interface MobileBackButtonProps {
  onClick: () => void;
}

export function MobileBackButton({ onClick }: MobileBackButtonProps) {
  return (
    <StyledMobileBackButton onClick={onClick}>
      <FontAwesomeIcon icon={faChevronLeft} size="xs" />
      Back to entries
    </StyledMobileBackButton>
  );
}

/* ── Main template ── */

interface JournalTemplateProps {
  sidePanel: ReactNode;
  editorPanel: ReactNode;
}

/** Two-panel journal layout: side panel (list) + editor panel. */
export function JournalTemplate({ sidePanel, editorPanel }: JournalTemplateProps) {
  return (
    <ContentArea>
      {sidePanel}
      {editorPanel}
    </ContentArea>
  );
}
