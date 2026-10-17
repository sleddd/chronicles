import { useLocation, useNavigate } from 'react-router-dom';
import { SectionTabBar, SectionTab } from '../../styles/sectionTabs.js';

const Bar = SectionTabBar;
const TabBtn = SectionTab;

const TABS = [
  { label: 'Goals', path: '/goals' },
  { label: 'Milestones', path: '/goals/milestones' },
  { label: 'Tasks', path: '/goals/tasks' },
  { label: 'Todos', path: '/goals/todos' },
];

export function PlanningTabBar() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <Bar>
      {TABS.map((t) => {
        const isActive = t.path === '/goals'
          ? location.pathname === '/goals'
          : location.pathname.startsWith(t.path);
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
