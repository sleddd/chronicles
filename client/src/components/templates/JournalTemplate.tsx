import styled from 'styled-components';
import type { ReactNode } from 'react';
import { Icon } from '../atoms/core/Icon.jsx';
import { useUIStore } from '../../stores/uiStore.js';
import { BACKGROUND_IMAGES } from '@chronicles/shared';

/* Page title on top, the two panels below it — edge to edge */
const Page = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
`;

/* Title inset a little further than the list rows' 20px gutter */
const Head = styled.header`
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px 24px;
  padding: 28px 36px 20px;
  border-bottom: 1px solid var(--border-subtle);
  @media (max-width: 768px) { padding: 20px 16px 14px; }
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
  /* Hairline down its right edge, separating the list from the editor */
  border-right: 1px solid var(--border-subtle);

  @media (max-width: 1024px) {
    width: 100%;
    min-width: 100%;
    max-width: 100%;
    border-right: none; /* one pane at a time — nothing beside it */
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

/* Phones/tablets show one pane at a time: this bar takes the editor back to
   the entry list. Hidden whenever both panes are side by side. */
const StyledMobileBackButton = styled.button`
  display: none;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  min-height: 44px;
  padding: 0 20px;
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--border-subtle);
  cursor: pointer;
  &:hover { color: var(--text-primary); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: -2px; }

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
    <StyledMobileBackButton type="button" onClick={onClick} aria-label="Back to entries">
      <Icon name="chevron-left" size={16} strokeWidth={2} />
      Entries
    </StyledMobileBackButton>
  );
}

/* ── Main template ── */

interface JournalTemplateProps {
  sidePanel: ReactNode;
  editorPanel: ReactNode;
  /** Page title above both panels */
  title?: string;
  /** At the right end of the title row (the open entry's breadcrumb) */
  headerAside?: ReactNode;
}

/** Journal layout: the page title, then side panel (list) + editor panel. */
export function JournalTemplate({ sidePanel, editorPanel, title = 'Journal', headerAside }: JournalTemplateProps) {
  return (
    <Page>
      <Head><Title>{title}</Title>{headerAside}</Head>
      <ContentArea>
        {sidePanel}
        {editorPanel}
      </ContentArea>
    </Page>
  );
}
