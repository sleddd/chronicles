import styled from 'styled-components';
import { NAV_COMPACT } from '../../styles/breakpoints.js';
import { MaterialIcon } from '../atoms/MaterialIcon.js';
import type { ReactNode } from 'react';
import { useUIStore } from '../../stores/uiStore.js';

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
  /* The breadcrumb sits level with the middle of the title */
  align-items: center;
  justify-content: space-between;
  gap: 12px 24px;
  /* The title sits where the other pages' do (Topics, Health, Planning…: 53px) */
  padding: 53px 36px 30px;
  border-bottom: 1px solid var(--border-subtle);
  @media (max-width: 768px) { padding: 34px 24px 32px; align-items: center; row-gap: 10px; }
  /* Phones/tablets: the top bar names the page and holds New entry — this row
     is only the back caret, while an entry is open */
  ${NAV_COMPACT} {
    padding: 4px 16px;
    &:not([data-back]) { display: none; }
  }
`;

const TitleBlock = styled.div`
  display: flex;
  align-items: center;
  min-width: 0;
`;

/* Phones/tablets, while an entry is open: a back caret before the title takes
   the editor back to the entry list (same caret as a topic page's title) */
const BackBtn = styled.button`
  display: none;
  align-items: center;
  justify-content: center;
  height: 44px;
  margin-left: -14px;
  margin-right: -6px;
  padding: 0;
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  /* A touch lower, level with the title's letters */
  position: relative;
  top: 3px;
  &:hover { color: var(--color-accent); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; border-radius: 6px; }
  ${NAV_COMPACT} { display: flex; }
  /* The title's weight (200), in both themes */
  & > span { font-variation-settings: 'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 48; }
`;

const TitleAside = styled.div`
  display: flex;
  margin-left: 24px;
`;

/* The page's name — hidden on phones and tablets, where the top bar shows it (GlobalStyle) */
const Title = styled.h1.attrs({ className: 'view-title' })`
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

const StyledSidePanel = styled.div<{ $hiddenMobile?: boolean; $isDark?: boolean }>`
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

const StyledEditorPanel = styled.div<{ $visibleMobile?: boolean; $isDark?: boolean }>`
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


/* ── Exported sub-components ── */

interface SidePanelProps {
  hiddenMobile?: boolean;
  children: ReactNode;
}

export function SidePanel({ hiddenMobile, children }: SidePanelProps) {
  const isDark = useUIStore(s => s.themeMode) === 'dark';
  return <StyledSidePanel $hiddenMobile={hiddenMobile} $isDark={isDark}>{children}</StyledSidePanel>;
}

interface EditorPanelProps {
  visibleMobile?: boolean;
  children: ReactNode;
}

export function EditorPanel({ visibleMobile, children }: EditorPanelProps) {
  const isDark = useUIStore(s => s.themeMode) === 'dark';
  return <StyledEditorPanel $visibleMobile={visibleMobile} $isDark={isDark}>{children}</StyledEditorPanel>;
}


/* ── Main template ── */

interface JournalTemplateProps {
  sidePanel: ReactNode;
  editorPanel: ReactNode;
  /** Page title above both panels */
  title?: string;
  /** Right beside the title (the New entry pill) */
  titleAside?: ReactNode;
  /** At the right end of the title row (the open entry's breadcrumb) */
  headerAside?: ReactNode;
  /** Phones/tablets with an entry open: the back caret before the title */
  onBack?: () => void;
}

/** Journal layout: the page title, then side panel (list) + editor panel. */
export function JournalTemplate({ sidePanel, editorPanel, title = 'Journal', titleAside, headerAside, onBack }: JournalTemplateProps) {
  return (
    <Page>
      <Head data-back={onBack ? '' : undefined}>
        <TitleBlock>
          {onBack && (
            <BackBtn type="button" onClick={onBack} aria-label="Back to entries">
              <MaterialIcon $size={48} aria-hidden="true">chevron_left</MaterialIcon>
            </BackBtn>
          )}
          <Title>{title}</Title>
          {titleAside && <TitleAside>{titleAside}</TitleAside>}
        </TitleBlock>
        {headerAside}
      </Head>
      <ContentArea>
        {sidePanel}
        {editorPanel}
      </ContentArea>
    </Page>
  );
}
