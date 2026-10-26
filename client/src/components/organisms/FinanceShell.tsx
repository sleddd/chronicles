import type { ReactNode } from 'react';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { ContentTemplate } from '../templates/ContentTemplate.js';
import { EmptyState } from '../atoms/EmptyState.js';
import { Spinner } from '../atoms/Spinner.js';
import { PillButton } from '../atoms/PillButton.js';
import { UnlockDialog } from './UnlockDialog.js';
import { FINANCE_TITLE, FinanceTabBar } from '../molecules/FinanceTabBar.js';
import { ErrorNote, Note } from '../molecules/FinanceParts.js';
import { useInitializeData } from '../../hooks/useInitializeData.js';
import { useEntriesStore } from '../../stores/entriesStore.js';
import { useFinanceStore } from '../../stores/financeStore.js';

/* Layout mirrors the Kitchen / Health dashboards. */
const Page = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
`;

const Inner = styled.div`
  width: 100%;
  max-width: 1150px;
  margin: 0 auto;
  padding: 0 24px 64px;
  @media (max-width: 768px) { padding: 0 16px 48px; }
`;

/* Title on the left, the tab's own control (Budget's month) across from it */
const Head = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px 24px;
  padding: 53px 0 28px; /* room under the title before the tabs */
`;

/* The page's name — hidden on phones and tablets, where the top bar shows it (GlobalStyle) */
const Title = styled.h1.attrs({ className: 'view-title' })`
  font-family: var(--font-display);
  font-size: 44px;
  font-weight: 200;
  line-height: 1;
  color: var(--text-primary);
  margin: 0;
  @media (max-width: 480px) { font-size: 34px; }
`;

const Off = styled.div`
  margin-top: 32px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 16px;
`;

/* Every tab's first block sits just under the tabs: no top rule, same 24px gap. */
const Body = styled.div`
  & > :first-child {
    margin-top: 24px;
    border-top: none;
    padding-top: 0;
  }
`;

const Center = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
`;

/**
 * Frame for every Finance tab: unlock / loading states, the title + tabs, and
 * a note when Finance (or, for Reconcile, its own switch) is off in Settings
 * — routes aren't gated, so a bookmarked link lands here. Children render
 * only when it's on.
 */
export function FinanceShell({ children, requiresReconcile = false, headerAside }: { children: ReactNode; requiresReconcile?: boolean; headerAside?: ReactNode }) {
  const { isReady, isLoading, needsUnlock, handleUnlock } = useInitializeData();
  const enabled = useEntriesStore(s => s.featureFlags.financeEnabled === true);
  const reconcileOn = useEntriesStore(s => s.featureFlags.reconcileEnabled === true);
  const error = useFinanceStore(s => s.error);
  const navigate = useNavigate();

  if (needsUnlock) return (
    <>
      <ContentTemplate><EmptyState message="Unlock your journal to continue" /></ContentTemplate>
      <UnlockDialog onUnlock={handleUnlock} />
    </>
  );

  if (isLoading || !isReady) return (
    <ContentTemplate><Center><Spinner size={40} /></Center></ContentTemplate>
  );

  return (
    <ContentTemplate>
      <Page>
        <Inner>
          <Head><Title>{FINANCE_TITLE}</Title>{enabled && headerAside}</Head>
          {enabled ? (
            <>
              <FinanceTabBar showReconcile={reconcileOn} />
              {error && <ErrorNote role="alert">{error}</ErrorNote>}
              <Body>
                {requiresReconcile && !reconcileOn ? (
                  <Off>
                    <Note>Paycheck reconcile is off. Turn it on in Settings → Features (under Finance) to pay bills from each paycheck and tick them off as they clear.</Note>
                    <PillButton type="button" onClick={() => navigate('/settings')}>Open Settings</PillButton>
                  </Off>
                ) : children}
              </Body>
            </>
          ) : (
            <Off>
              <Note>Finance is off. Turn it on in Settings → Features to track your budget, bills and subscriptions, goals and savings.</Note>
              <PillButton type="button" onClick={() => navigate('/settings')}>Open Settings</PillButton>
            </Off>
          )}
        </Inner>
      </Page>
    </ContentTemplate>
  );
}
