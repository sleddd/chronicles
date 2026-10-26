import styled from 'styled-components';
import type { ReactNode } from 'react';

/* Health dashboard panel — the home dashboard's widget card: a --bg-panel card
   (14px corners, no outline), the title in the Daily quote label's style (15px
   Open Sans, grey) over a light rule with a muted note or control on the right,
   16px above the content. Props only. */

export const DashPanel = styled.section`
  min-width: 0;
  padding: 28px 32px;
  background: var(--bg-panel);
  border-radius: 14px;
  @media (max-width: 480px) { padding: 22px 20px; }
`;

const Head = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 24px;
  min-height: 30px;
  padding-bottom: 12px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--border-subtle);
`;

const Title = styled.h2`
  margin: 0;
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: 400;
  line-height: 30px;
  color: var(--text-muted);
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
