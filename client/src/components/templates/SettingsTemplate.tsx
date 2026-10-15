import styled from 'styled-components';
import { NAV_COMPACT } from '../../styles/breakpoints.js';
import type { ReactNode } from 'react';
import { Header } from '../organisms/Header.js';
import { Sidebar } from '../organisms/Sidebar.js';
import { Background } from '../organisms/Background.js';
import { MobileChrome } from '../organisms/MobileChrome.js';
import { SidebarToggle } from '../atoms/SidebarToggle.js';
import { useUIStore } from '../../stores/uiStore.js';
import { BACKGROUND_IMAGES } from '@chronicles/shared';

const Layout = styled.div`
  display: flex;
  flex-direction: row;
  height: 100vh;
  height: 100dvh; /* iOS Safari: 100vh extends behind the bottom toolbar */
  overflow: hidden;

  ${NAV_COMPACT} {
    padding-top: 56px;
  }
`;

/* Same mobile reveal as ContentTemplate/AppTemplate: the column sits above the
   fixed nav bar and slides right to expose it. Without this the drawer and its
   tap-to-close overlay don't line up, so the menu can't be closed. */
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

const Body = styled.div<{ $hasBackground?: boolean; $lightBg?: boolean }>`
  flex: 1;
  overflow-y: auto;
  background: ${({ $hasBackground, $lightBg, theme }) => $hasBackground ? ($lightBg ? theme.colors.surfaceOverlayLight : theme.colors.surfaceOverlay) : 'var(--paper)'};
`;

const Content = styled.div`
  max-width: 640px;
  margin: 0 auto;
  padding: ${({ theme }) => theme.spacing.xl}px;
`;

const PageTitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: ${({ theme }) => theme.spacing.xl}px;
`;

const PageTitle = styled.h1`
  font-family: ${({ theme }) => theme.typography.h1.fontFamily};
  font-size: ${({ theme }) => theme.typography.h1.fontSize};
  font-weight: 300;
  font-style: normal;
  margin: 0;
`;

interface SettingsTemplateProps {
  title: string;
  children: ReactNode;
}

export function SettingsTemplate({ title, children }: SettingsTemplateProps) {
  const backgroundImage = useUIStore(s => s.backgroundImage);
  const isLightBg = BACKGROUND_IMAGES.find(bg => bg.value === backgroundImage)?.light ?? false;
  const navOpen = useUIStore(s => s.mobileNavOpen);
  return (
    <>
      <Background />
      <div data-print-hide><MobileChrome /></div>
      <Layout>
        <div data-print-hide><Sidebar /></div>
        <MainColumn $navOpen={navOpen}>
          <Header />
          <Body $hasBackground={!!backgroundImage} $lightBg={isLightBg}>
            <Content>
              {title && (
                <PageTitleRow>
                  <SidebarToggle />
                  <PageTitle>{title}</PageTitle>
                </PageTitleRow>
              )}
              {children}
            </Content>
          </Body>
        </MainColumn>
      </Layout>
    </>
  );
}
