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
  overflow: hidden;

  ${NAV_COMPACT} {
    padding-top: 56px;
  }
`;

const MainColumn = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
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
  return (
    <>
      <Background />
      <div data-print-hide><MobileChrome /></div>
      <Layout>
        <div data-print-hide><Sidebar /></div>
        <MainColumn>
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
