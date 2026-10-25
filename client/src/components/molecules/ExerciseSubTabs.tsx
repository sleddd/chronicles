import { useLocation, useNavigate } from 'react-router-dom';
import { FilterTabs } from './FilterTabs.js';

/* Health → Exercise's sub-sub tabs: History (what you did over a period), Schedule (the
   daily checklist beside this week or the list) and Training (training plans). */

const TABS = [
  { value: '/health/exercise', label: 'History' },
  { value: '/health/exercise/schedule', label: 'Schedule' },
  { value: '/health/exercise/training', label: 'Training' },
];

export function ExerciseSubTabs() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const active = TABS.find(t => t.value === pathname)?.value ?? TABS[0].value;
  return <FilterTabs options={TABS} active={active} onChange={path => navigate(path)} flush bordered={false} />;
}
