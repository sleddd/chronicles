import { useLocation, useNavigate } from 'react-router-dom';
import { FilterTabs } from './FilterTabs.js';

/* Health → Exercise's sub-sub tabs: Log (the exercise entries), Routines (the
   daily checklist and the routine list) and Training (training plans). */

const TABS = [
  { value: '/health/exercise', label: 'Log' },
  { value: '/health/exercise/routines', label: 'Routines' },
  { value: '/health/exercise/training', label: 'Training' },
];

export function ExerciseSubTabs() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const active = TABS.find(t => t.value === pathname)?.value ?? TABS[0].value;
  return <FilterTabs options={TABS} active={active} onChange={path => navigate(path)} flush bordered={false} />;
}
