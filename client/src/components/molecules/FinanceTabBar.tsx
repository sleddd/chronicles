import { useLocation, useNavigate } from 'react-router-dom';
import { SectionTabBar, SectionTab } from '../../styles/sectionTabs.js';
import { FINANCE_VIEWS } from '../../utils/sectionViews.js';

const Bar = SectionTabBar;
const TabBtn = SectionTab;

export const FINANCE_TITLE = 'Finance';

export const FINANCE_TABS = FINANCE_VIEWS;

/** Tabs for the Finance section. */
export function FinanceTabBar() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <Bar aria-label="Finance">
      {FINANCE_TABS.map(t => {
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
