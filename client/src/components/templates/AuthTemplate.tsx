import styled from 'styled-components';
import type { ReactNode } from 'react';
import { BrandMark } from '../atoms/BrandMark.js';

/* The sign-in screens' frame: one card on the page colour. Narrow (sign in,
   recovery, the passkey and recovery-key steps): the mark and the CHRONICLES
   wordmark centred over a thin title, the form, the footer line, then the
   policy links under a hairline. Wide (create account): the mark and wordmark
   at the left of a header row with the title across from it, a hairline under
   it, then the form's own two columns and foot. */

const Wrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: calc(40px + env(safe-area-inset-top, 0px)) 16px 40px;
  position: relative;
  background: var(--bg-app);
`;

const Card = styled.div<{ $wide: boolean }>`
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: ${({ $wide }) => ($wide ? '1000px' : '460px')};
  padding: ${({ $wide }) => ($wide ? '32px 36px 30px' : '48px 40px 28px')};
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: 24px;
  box-shadow: var(--shadow-card);
  @media (max-width: 560px) { padding: 32px 22px 22px; border-radius: 18px; }
`;

const LogoMark = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 22px;
  padding-bottom: 26px;
`;

const LogoText = styled.div`
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 300;
  letter-spacing: 0.32em;
  /* The tracking adds room after the last letter; this keeps the word centred */
  margin-right: -0.32em;
  text-transform: uppercase;
  color: var(--text-primary);
`;

const PageTitle = styled.h1`
  margin: 0 0 32px;
  font-family: var(--font-display);
  font-size: 32px;
  font-weight: 300;
  line-height: 1.15;
  color: var(--text-primary);
  text-align: center;
`;

/* Wide: the mark + wordmark on the left, the title on the right, a hairline under */
const WideHead = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px 24px;
  padding-bottom: 26px;
  margin-bottom: 28px;
  border-bottom: 1px solid var(--border-subtle);
  & > div { display: flex; align-items: center; gap: 22px; }
  & ${LogoText} { font-size: 20px; margin-right: 0; }
  h1 { margin: 0; font-family: var(--font-display); font-size: 30px; font-weight: 300; color: var(--text-primary); }
  @media (max-width: 560px) { h1 { font-size: 26px; } }
`;

const Footer = styled.div`
  margin-top: 28px;
  text-align: center;
  font-family: var(--font-sans);
  font-size: 16px;
  color: var(--text-secondary);
  a { font-weight: 600; color: var(--color-accent-link, var(--color-accent)); text-decoration: none; &:hover { text-decoration: underline; } }
`;

/* Privacy policy and terms under every sign-in screen (new tab, so nothing typed is lost) */
const Legal = styled.nav`
  margin-top: 26px;
  padding-top: 20px;
  border-top: 1px solid var(--border-subtle);
  display: flex;
  justify-content: center;
  gap: 28px;
  font-family: var(--font-sans);
  font-size: 14px;
  a { color: var(--text-muted); text-decoration: none; &:hover { color: var(--text-secondary); text-decoration: underline; } }
`;

interface AuthTemplateProps {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** No title under the wordmark (the 2FA code screen names itself) */
  brand?: boolean;
  /** The wide two-column card (create account): the form brings its own foot */
  wide?: boolean;
}

export function AuthTemplate({ title, children, footer, brand, wide = false }: AuthTemplateProps) {
  const legal = (
    <Legal aria-label="Legal">
      <a href="/health-privacy" target="_blank" rel="noopener noreferrer">Health Data Privacy</a>
      <a href="/terms" target="_blank" rel="noopener noreferrer">Terms</a>
    </Legal>
  );
  if (wide) return (
    <Wrapper>
      <Card $wide>
        <WideHead>
          <div><BrandMark size={44} gradientId="logo-auth" /><LogoText>Chronicles</LogoText></div>
          <h1>{title}</h1>
        </WideHead>
        {children}
        {footer && <Footer>{footer}</Footer>}
        {legal}
      </Card>
    </Wrapper>
  );
  return (
    <Wrapper>
      <Card $wide={false}>
        <LogoMark>
          <BrandMark size={64} gradientId="logo-auth" />
          <LogoText>Chronicles</LogoText>
        </LogoMark>
        {!brand && <PageTitle>{title}</PageTitle>}
        {children}
        {footer && <Footer>{footer}</Footer>}
        {legal}
      </Card>
    </Wrapper>
  );
}
