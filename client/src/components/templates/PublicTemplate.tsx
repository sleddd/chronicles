import type { ReactNode } from 'react';
import styled from 'styled-components';
import { Link } from 'react-router-dom';
import { BrandMark } from '../atoms/BrandMark.js';
import { LIGHT_TOKENS } from '../../styles/lightTokens.js';

/* A public page someone opens from a link (the public shelf): always the
   app's light theme, whatever the visitor's device or a signed-in copy on
   this browser last used — the light tokens are pinned on the page root, as
   the landing page does. A small header with the mark and a footer line. */

const Page = styled.div`
  ${LIGHT_TOKENS}
  min-height: 100vh;
  background: var(--bg-app);
  color: var(--text-secondary);
  font-family: var(--font-sans);
  display: flex;
  flex-direction: column;
`;

const Inner = styled.div`
  width: 100%;
  max-width: 1150px;
  margin: 0 auto;
  padding: 0 24px;
  @media (max-width: 768px) { padding: 0 16px; }
`;

const Header = styled.header`
  display: flex;
  align-items: center;
  gap: 10px;
  height: 64px;
  a { display: inline-flex; align-items: center; gap: 10px; text-decoration: none; color: var(--text-primary); }
  span { font-family: var(--font-label); font-size: 13px; font-weight: 600; letter-spacing: 0.14em; }
`;

const Main = styled.main`
  flex: 1;
  padding-bottom: 64px;
`;

const Footer = styled.footer`
  padding: 24px 0 32px;
  border-top: 1px solid var(--border-subtle);
  font-size: 13px;
  color: var(--text-muted);
  a { color: var(--color-accent-link); text-decoration: none; }
  a:hover { text-decoration: underline; }
`;

export function PublicTemplate({ children }: { children: ReactNode }) {
  return (
    <Page>
      <Inner>
        <Header>
          <Link to="/" aria-label="Chronicles">
            <BrandMark size={26} gradientId="public-page-mark" />
            <span>CHRONICLES</span>
          </Link>
        </Header>
      </Inner>
      <Main><Inner>{children}</Inner></Main>
      <Inner>
        <Footer>Made with <Link to="/">Chronicles</Link>, a private journal.</Footer>
      </Inner>
    </Page>
  );
}
