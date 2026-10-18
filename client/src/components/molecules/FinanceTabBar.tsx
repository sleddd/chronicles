import { useLocation, useNavigate } from 'react-router-dom';
import { SectionTabBar, SectionTab } from '../../styles/sectionTabs.js';

const Bar = SectionTabBar;
const TabBtn = SectionTab;

export const FINANCE_TITLE = 'Finance';

export const FINANCE_TABS: { label: string; path: string; reconcile?: boolean }[] = [
  { label: 'Budget & bills', path: '/finance' },
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
