import styled from 'styled-components';
import { useLocation, useNavigate } from 'react-router-dom';

/* Same look as the Kitchen/Health tabs: hairline rules above and below, accent text when active. */
const Bar = styled.nav`
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  padding: 8px 0;
  border-top: 1px solid var(--border-subtle);
  border-bottom: 1px solid var(--border-subtle);
`;

const TabBtn = styled.button<{ $active?: boolean }>`
  padding: 5px 12px;
  font-family: var(--font-label);
  font-size: 12.5px;
  font-weight: ${({ $active }) => ($active ? 600 : 400)};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${({ $active }) => ($active ? 'var(--color-accent)' : 'var(--text-tertiary)')};
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
  transition: color 120ms ease;
  &:first-of-type { padding-left: 0; }
  &:hover:not([aria-selected="true"]) { color: var(--text-primary); font-weight: 600; }
`;

export const FINANCE_TITLE = 'Finance';

export const FINANCE_TABS: { label: string; path: string; reconcile?: boolean }[] = [
  { label: 'Budget & Bills', path: '/finance' },
  { label: 'Goals', path: '/finance/goals' },
  { label: 'Savings', path: '/finance/savings' },
  { label: 'Reconcile', path: '/finance/reconcile', reconcile: true },
  { label: 'Reports', path: '/finance/reports' },
];

/** Tabs for the Finance section; Reconcile only when its own switch is on. */
export function FinanceTabBar({ showReconcile }: { showReconcile: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <Bar aria-label="Finance">
      {FINANCE_TABS.filter(t => !t.reconcile || showReconcile).map(t => {
        const isActive = location.pathname === t.path;
        return (
          <TabBtn key={t.path} $active={isActive} aria-selected={isActive} onClick={() => navigate(t.path)}>
            {t.label}
          </TabBtn>
        );
      })}
    </Bar>
  );
}
