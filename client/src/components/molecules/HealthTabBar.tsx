import { useLocation, useNavigate } from 'react-router-dom';
import { SectionTabBar, SectionTab } from '../../styles/sectionTabs.js';
import { useEntriesStore } from '../../stores/entriesStore.js';

const Bar = SectionTabBar;
const TabBtn = SectionTab;

export function HealthTabBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const ff = useEntriesStore(s => s.featureFlags);

  const tabs: { label: string; path: string }[] = [{ label: 'Dashboard', path: '/health' }];
  if (ff.foodEnabled !== false) tabs.push({ label: 'Meals', path: '/health/food' });
  if (ff.exerciseEnabled !== false) tabs.push({ label: 'Exercise', path: '/health/exercise' });
  tabs.push({ label: 'Symptoms', path: '/health/symptoms' });
  if (ff.medicationEnabled !== false) tabs.push({ label: 'Med list', path: '/health/meds' }, { label: 'Med history', path: '/health/med-history' });
  if (ff.allergiesEnabled !== false) tabs.push({ label: 'Allergies', path: '/health/allergies' });
  tabs.push({ label: 'Reports', path: '/health/reporting' });

  return (
    <Bar>
      {tabs.map((t) => {
        const isActive = location.pathname === t.path || ((t.path === '/health/meds' || t.path === '/health/exercise') && location.pathname.startsWith(t.path + '/'));
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
