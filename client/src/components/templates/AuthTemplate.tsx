import styled from 'styled-components';
import type { ReactNode } from 'react';
import { BrandMark } from '../atoms/BrandMark.js';

const Wrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: ${({ theme }) => theme.spacing.md}px;
  position: relative;
  background: var(--bg-app, ${({ theme }) => theme.colors.background});
`;

const Card = styled.div`
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 420px;
  padding: ${({ theme }) => theme.spacing.xl}px;
  font-style: normal;
  background: var(--bg-surface, ${({ theme }) => theme.colors.surface});
  border: 1px solid var(--border-subtle, ${({ theme }) => theme.colors.border});
  border-radius: var(--r-xl, ${({ theme }) => theme.borderRadius.xl}px);
  box-shadow: var(--shadow-lg, ${({ theme }) => theme.shadow.lg});
`;

const LogoMark = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 8px 0 28px;
`;

const LogoText = styled.div`
  font-family: var(--font-display, 'Work Sans', sans-serif);
  font-size: 22px;
  font-weight: 200;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--text-primary, ${({ theme }) => theme.colors.text});
`;

const PageTitle = styled.h1`
  font-family: var(--font-display, 'Work Sans', serif);
  font-size: 1.6rem;
  font-weight: 200;
  font-style: normal;
  color: var(--text-primary, ${({ theme }) => theme.colors.text});
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
  text-align: center;
`;

const Footer = styled.div`
  margin-top: ${({ theme }) => theme.spacing.lg}px;
  text-align: center;
  font-size: ${({ theme }) => theme.fontSize.sm}px;
  font-style: normal;
  color: ${({ theme }) => theme.colors.textSecondary};

  a {
    color: ${({ theme }) => theme.colors.text};
    text-decoration: none;
    &:hover { text-decoration: underline; }
  }
`;

interface AuthTemplateProps {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  brand?: boolean;
}

export function AuthTemplate({ title, children, footer, brand }: AuthTemplateProps) {
  return (
    <Wrapper>
      <Card>
        <LogoMark>
          <BrandMark size={84} gradientId="logo-auth" />
          <LogoText>Chronicles</LogoText>
        </LogoMark>
        {!brand && <PageTitle>{title}</PageTitle>}
        {children}
        {footer && <Footer>{footer}</Footer>}
      </Card>
    </Wrapper>
  );
}
