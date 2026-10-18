import styled from 'styled-components';
import type { ReactNode } from 'react';

/* Health dashboard panel: a --bg-panel card (12px corners, no outline) with a
   thin Work Sans title on the left and a muted note or control on the right.
   Props only. */

export const DashPanel = styled.section`
  min-width: 0;
  padding: 22px 22px 24px;
  background: var(--bg-panel);
  border-radius: 12px;
  @media (max-width: 768px) { padding: 24px 20px 28px; }
`;

const Head = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 24px;
  margin-bottom: 32px;
`;

const Title = styled.h2`
  margin: 0;
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 300;
  line-height: 1.15;
  color: var(--text-secondary);
  @media (max-width: 480px) { font-size: 19px; }
`;

const Aside = styled.div`
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-muted);
`;

export function DashPanelHead({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <Head>
      <Title>{title}</Title>
      {aside != null && <Aside>{aside}</Aside>}
    </Head>
  );
}
