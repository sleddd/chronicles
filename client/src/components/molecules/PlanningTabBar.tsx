import { useLocation, useNavigate } from 'react-router-dom';
import { SectionTabBar, SectionTab } from '../../styles/sectionTabs.js';

const Bar = SectionTabBar;
const TabBtn = SectionTab;

const TABS = [
  { label: 'Goals', path: '/goals' },
  { label: 'Milestones', path: '/goals/milestones' },
  { label: 'Tasks', path: '/goals/tasks' },
  { label: 'Roadmap', path: '/goals/roadmap' },
  { label: 'Planner', path: '/goals/planner' },
];

export function PlanningTabBar() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <Bar>
      {TABS.map((t) => {
        // Todos is a view of the Tasks tab (its Show pill), reached at /goals/todos
        const isActive = t.path === '/goals'
          ? location.pathname === '/goals'
          : location.pathname.startsWith(t.path) || (t.path === '/goals/tasks' && location.pathname.startsWith('/goals/todos'));
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
