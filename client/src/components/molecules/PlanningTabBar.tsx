import { useLocation, useNavigate } from 'react-router-dom';
import { SectionTabBar, SectionTab } from '../../styles/sectionTabs.js';
import { PLANNING_VIEWS, isViewActive } from '../../utils/sectionViews.js';

const Bar = SectionTabBar;
const TabBtn = SectionTab;

const TABS = PLANNING_VIEWS;

export function PlanningTabBar() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <Bar aria-label="Planning sections">
      {TABS.map((t) => {
        // Todos is a view of the Tasks tab (its Show pill), reached at /goals/todos
        const isActive = isViewActive(t.path, location.pathname);
        return (
          <TabBtn
            key={t.path}
            $active={isActive}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => navigate(t.path)}
          >
            {t.label}
          </TabBtn>
        );
      })}
    </Bar>
  );
}
