import styled from 'styled-components';
import { NAV_COMPACT } from '../../styles/breakpoints.js';
import type { ReactNode } from 'react';
import { Header } from '../organisms/Header.js';
import { Sidebar } from '../organisms/Sidebar.js';
import { Background } from '../organisms/Background.js';
import { MobileChrome } from '../organisms/MobileChrome.js';
import { useUIStore } from '../../stores/uiStore.js';
import { BACKGROUND_IMAGES } from '@chronicles/shared';

const SkipLink = styled.a`
  position: absolute;
  left: -9999px;
  top: auto;
  width: 1px;
  height: 1px;
  overflow: hidden;
  z-index: 9999;
  padding: var(--s-2, 8px) var(--s-4, 16px);
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: var(--text-sm, 15px);
  text-decoration: none;
  border: 2px solid var(--border-default);
  border-radius: var(--r-md, 1px);

  &:focus {
    position: fixed;
    left: var(--s-2, 8px);
    top: var(--s-2, 8px);
    width: auto;
    height: auto;
  }
`;

/* 3px accent stripe pinned to the very top of the app chrome (DS signature). */
const AccentStripe = styled.div<{ $hidden?: boolean }>`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--color-accent, ${({ theme }) => theme.colors.accent});
  z-index: 1000;
  pointer-events: none;
  display: ${({ $hidden }) => $hidden ? 'none' : 'block'};
`;

const Layout = styled.div<{ $hideAccentStripe?: boolean; $focusMode?: boolean }>`
  display: flex;
  flex-direction: row;
  height: 100vh;
  height: 100dvh; /* iOS Safari: 100vh extends behind the bottom toolbar */
  overflow: hidden;
  padding-top: ${({ $hideAccentStripe }) => $hideAccentStripe ? '0' : '3px'};

  ${NAV_COMPACT} {
    padding-top: ${({ $focusMode }) => $focusMode ? '0' : '56px'};
  }
`;

/* Main column: header bar + content, to the right of the sidebar.
   On mobile it slides right to reveal the sidebar bar underneath. */
const MainColumn = styled.div<{ $navOpen?: boolean }>`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;

  ${NAV_COMPACT} {
    position: relative;
    z-index: 2;
    background: var(--bg-app);
    transform: translateX(${({ $navOpen }) => ($navOpen ? '240px' : '0')});
    transition: transform 220ms ease-out;
    box-shadow: ${({ $navOpen }) => ($navOpen ? '-2px 0 20px rgba(0,0,0,0.25)' : 'none')};
  }
`;

const MainContent = styled.main<{ $transparent?: boolean; $hasBackground?: boolean; $lightBg?: boolean }>`
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: ${({ $transparent }) => $transparent ? 'hidden' : 'auto'};
  background: ${({ $transparent, $hasBackground, $lightBg, theme }) =>
    $transparent ? 'transparent' : $hasBackground ? ($lightBg ? theme.colors.surfaceOverlayLight : theme.colors.surfaceOverlay) : 'var(--paper)'};
  padding-bottom: 0;
`;

interface AppTemplateProps {
  children: ReactNode;
  hideSidebar?: boolean;
  transparentContent?: boolean;
  hideAccentStripe?: boolean;
}

export function AppTemplate({ children, hideSidebar, transparentContent, hideAccentStripe }: AppTemplateProps) {
  const backgroundImage = useUIStore(s => s.backgroundImage);
  const isLightBg = BACKGROUND_IMAGES.find(bg => bg.value === backgroundImage)?.light ?? false;
  const navOpen = useUIStore(s => s.mobileNavOpen);
  /* Mobile: MainColumn's transform makes it the containing block for the
     fixed full-view editor overlay, and its stacking context sits below the
     fixed nav bar — so while the overlay is open, hide the mobile chrome and
     let the overlay fill the whole viewport. */
  const focusMode = useUIStore(s => s.editorFocusMode);

  return (
    <>
      <AccentStripe $hidden={hideAccentStripe} />
      <Background />
      {!hideSidebar && !focusMode && <MobileChrome />}
      <Layout $hideAccentStripe={hideAccentStripe} $focusMode={focusMode}>
        <SkipLink href="#main-content">Skip to content</SkipLink>
        {!hideSidebar && <Sidebar />}
        <MainColumn $navOpen={!hideSidebar && navOpen}>
          <Header />
          <MainContent id="main-content" $transparent={transparentContent} $hasBackground={!!backgroundImage} $lightBg={isLightBg}>{children}</MainContent>
        </MainColumn>
      </Layout>
    </>
  );
}
