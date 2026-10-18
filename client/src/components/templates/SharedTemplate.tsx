import styled from 'styled-components';
import type { ReactNode } from 'react';

const Page = styled.div`
  min-height: 100vh;
  background: var(--bg-app, ${({ theme }) => theme.colors.background});
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 16px;
`;

interface SharedTemplateProps {
  children: ReactNode;
}

/** Centered page template for public-facing shared content (no header, no auth). */
export function SharedTemplate({ children }: SharedTemplateProps) {
  return <Page>{children}</Page>;
}
