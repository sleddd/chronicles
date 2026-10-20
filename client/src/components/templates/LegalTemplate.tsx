import { useEffect, type ReactNode } from 'react';
import styled from 'styled-components';
import { Link, useLocation } from 'react-router-dom';
import { BrandMark } from '../atoms/BrandMark.js';

/* Public legal pages (/health-privacy, /terms): readable without signing in,
   on the page colour, one readable column. Layout only. */

const Page = styled.div`
  min-height: 100vh;
  background: var(--bg-app);
  color: var(--text-secondary);
`;

const Column = styled.main`
  max-width: 760px;
  margin: 0 auto;
  padding: 40px 24px 80px;
  font-family: var(--font-sans);
  font-size: 15px;
  line-height: 1.65;

  h1 {
    margin: 24px 0 4px;
    font-family: var(--font-display);
    font-size: 40px;
    font-weight: 200;
    line-height: 1.15;
    color: var(--text-primary);
  }
  h2 {
    margin: 36px 0 8px;
    font-family: var(--font-display);
    font-size: 24px;
    font-weight: 300;
    color: var(--text-primary);
  }
  h3 { margin: 22px 0 6px; font-size: 16px; font-weight: 600; color: var(--text-primary); }
  p { margin: 0 0 12px; }
  ul { margin: 0 0 12px; padding-left: 22px; }
  li + li { margin-top: 4px; }
  a { color: var(--color-accent-link, var(--color-accent)); }
  strong { color: var(--text-primary); font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; font-size: 14px; }
  th, td { padding: 9px 10px; border: 1px solid var(--border-card); text-align: left; vertical-align: top; }
  th { color: var(--text-primary); font-weight: 600; }
  @media (max-width: 600px) {
    h1 { font-size: 32px; }
    table { display: block; overflow-x: auto; }
  }
`;

const Top = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  a { display: inline-flex; align-items: center; gap: 10px; text-decoration: none; color: var(--text-primary); font-family: var(--font-display); font-size: 20px; font-weight: 300; }
`;

const Meta = styled.p`
  color: var(--text-muted);
  font-size: 14px;
`;

const Foot = styled.nav`
  margin-top: 48px;
  padding-top: 16px;
  border-top: 1px solid var(--border-subtle);
  display: flex;
  gap: 18px;
  flex-wrap: wrap;
  font-size: 14px;
`;

/** Public pages point the canonical link at their own address (index.html's is the home page) */
function useOwnCanonical() {
  const { pathname } = useLocation();
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) return;
    const home = link.href;
    link.href = `https://mydailychronicles.com${pathname}`;
    return () => { link.href = home; };
  }, [pathname]);
}

export function LegalTemplate({ title, meta, children }: { title: string; meta: string; children: ReactNode }) {
  useOwnCanonical();
  return (
    <Page>
      <Column>
        <Top><Link to="/"><BrandMark size={26} gradientId="logo-legal" /> Chronicles</Link></Top>
        <h1>{title}</h1>
        <Meta>{meta}</Meta>
        {children}
        <Foot aria-label="Legal">
          <Link to="/health-privacy">Health Data Privacy Policy</Link>
          <Link to="/terms">Terms of Service</Link>
        </Foot>
      </Column>
    </Page>
  );
}
