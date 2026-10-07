import styled from 'styled-components';
import { NAV_COMPACT } from '../../styles/breakpoints.js';
import type { ReactNode } from 'react';
import { Header } from '../organisms/Header.js';
import { Sidebar } from '../organisms/Sidebar.js';
import { Background } from '../organisms/Background.js';
import { MobileChrome } from '../organisms/MobileChrome.js';

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

const Body = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;
`;

interface TwoPanelTemplateProps {
  children: ReactNode;
  topBar?: ReactNode;
}

/** Full-height template: left sidebar + main column (header bar, optional topBar, two-panel content). */
export function TwoPanelTemplate({ children, topBar }: TwoPanelTemplateProps) {
  return (
    <>
      <Background />
      <div data-print-hide><MobileChrome /></div>
      <Layout>
        <div data-print-hide><Sidebar /></div>
        <MainColumn>
          <Header />
          {topBar}
          <Body>{children}</Body>
        </MainColumn>
      </Layout>
    </>
  );
}
