import { useLocation, useNavigate } from 'react-router-dom';
import { SectionTabBar, SectionTab } from '../../styles/sectionTabs.js';
import { KITCHEN_VIEWS } from '../../utils/sectionViews.js';

const Bar = SectionTabBar;
const TabBtn = SectionTab;

/** Section title shared by every From the Kitchen page. */
export const KITCHEN_TITLE = 'From the Kitchen';

const TABS = KITCHEN_VIEWS;

/** Tabs for the From the Kitchen section. */
export function MealsTabBar() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <Bar>
      {TABS.map((t) => {
        const isActive = location.pathname === t.path;
        return (
          <TabBtn
            key={t.path}
            $active={isActive}
            aria-selected={isActive}
            onClick={() => navigate(t.path)}
          >
            {t.label}
          </TabBtn>
        );
      })}
    </Bar>
  );
}
