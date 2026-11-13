import type { ReactNode } from 'react';
import styled from 'styled-components';
import { ContentTemplate } from '../templates/ContentTemplate.js';
import { EmptyState } from '../atoms/EmptyState.js';
import { Spinner } from '../atoms/Spinner.js';
import { PlanningTabBar } from '../molecules/PlanningTabBar.js';
import { UnlockDialog } from './UnlockDialog.js';
import { useInitializeData } from '../../hooks/useInitializeData.js';
import { glassControl } from '../../styles/wallpaper.js';

/* The frame of Planning's pages beside the boards (Roadmap, Planner) — and,
   with another `title` and `tabs`, of Health → Habits:
   the "Planning" title with the page's controls across from it, the Planning
   tabs, then the page. Same measurements as the boards' own frame (GoalsView). */

const Page = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
`;

const Inner = styled.div<{ $wide?: boolean }>`
  width: 100%;
  /* Wide (every Planning page): the whole width of the page, with a slightly roomier gutter */
  max-width: ${({ $wide }) => ($wide ? 'none' : '1150px')};
  margin: 0 auto;
  padding: ${({ $wide }) => ($wide ? '0 32px 64px' : '0 24px 64px')};
  @media (max-width: 768px) { padding: 0 16px 48px; }
`;

const Head = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding: 53px 0 28px;
`;

const Title = styled.h1.attrs({ className: 'view-title' })`
  font-family: var(--font-display);
  font-size: 44px;
  font-weight: 200;
  line-height: 1;
  color: var(--text-primary);
  margin: 0;
  @media (max-width: 480px) { font-size: 34px; }
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
`;

const Body = styled.div`
  padding-top: 24px;
`;

/* "Today" / "This week" beside a page's ‹ › pill: the same outlined pill (frosted on a wallpaper) */
export const TodayBtn = styled.button`
  height: 40px;
  padding: 0 16px;
  border: 1px solid var(--border-card);
  border-radius: 999px;
  background: transparent;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-secondary);
  cursor: pointer;
  &:hover { color: var(--text-primary); border-color: var(--border-strong); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  ${glassControl}
`;

interface PlanningShellProps {
  /** The page's big title; "Planning" when left out */
  title?: string;
  /** The section's tab bar; Planning's when left out */
  tabs?: ReactNode;
  /** Controls across from the title (period switch, the page's main action…) */
  actions?: ReactNode;
  /** The whole page width, as every Planning page is (Health → Habits keeps the usual column) */
  wide?: boolean;
  children: ReactNode;
}

export function PlanningShell({ title = 'Planning', tabs, actions, wide, children }: PlanningShellProps) {
  const { isReady, isLoading, needsUnlock, handleUnlock } = useInitializeData();

  if (needsUnlock) {
    return (<><ContentTemplate><EmptyState message="Unlock your journal to continue" /></ContentTemplate><UnlockDialog onUnlock={handleUnlock} /></>);
  }
  if (isLoading || !isReady) {
    return (<ContentTemplate><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}><Spinner size={40} /></div></ContentTemplate>);
  }
  return (
    <ContentTemplate>
      <Page>
        <Inner $wide={wide}>
          <Head>
            <Title>{title}</Title>
            {actions && <Actions>{actions}</Actions>}
          </Head>
          {tabs ?? <PlanningTabBar />}
          <Body>{children}</Body>
        </Inner>
      </Page>
    </ContentTemplate>
  );
}
