import { useLocation, useNavigate } from 'react-router-dom';
import { SectionTabBar, SectionTab } from '../../styles/sectionTabs.js';
import { useEntriesStore } from '../../stores/entriesStore.js';
import { healthViews, isViewActive } from '../../utils/sectionViews.js';

const Bar = SectionTabBar;
const TabBtn = SectionTab;

export function HealthTabBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const ff = useEntriesStore(s => s.featureFlags);

  const tabs = healthViews(ff);

  return (
    <Bar>
      {tabs.map((t) => {
        const isActive = isViewActive(t.path, location.pathname);
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
