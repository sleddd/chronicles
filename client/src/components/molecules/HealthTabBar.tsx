import styled from 'styled-components';
import { useLocation, useNavigate } from 'react-router-dom';
import { useEntriesStore } from '../../stores/entriesStore.js';

const Bar = styled.nav`
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  padding: 8px 0;
  border-top: 1px solid var(--border-subtle);
  border-bottom: 1px solid var(--border-subtle);
`;

const TabBtn = styled.button<{ $active?: boolean }>`
  padding: 5px 12px;
  font-family: var(--sans, 'Lato', sans-serif);
  font-size: 11px;
  font-weight: ${({ $active }) => $active ? 600 : 400};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${({ $active }) => $active ? 'var(--color-accent)' : 'var(--ink-3, #6b645a)'};
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
  transition: color 120ms ease;

  /* Align the first tab's text with the column's left edge. */
  &:first-of-type { padding-left: 0; }

  &:hover:not([aria-selected="true"]) {
    color: var(--ink, #2b2824);
    font-weight: 600;
  }
`;

export function HealthTabBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const ff = useEntriesStore(s => s.featureFlags);

  const tabs: { label: string; path: string }[] = [{ label: 'Dashboard', path: '/health' }];
  if (ff.medicationEnabled) tabs.push({ label: 'Meds', path: '/health/schedule' });
  if (ff.foodEnabled) tabs.push({ label: 'Meals', path: '/health/food' });
  if (ff.exerciseEnabled) tabs.push({ label: 'Exercise', path: '/health/exercise' });
  tabs.push({ label: 'Symptoms', path: '/health/symptoms' });
  if (ff.medicationEnabled) tabs.push({ label: 'Med List', path: '/health/meds' });
  if (ff.allergiesEnabled) tabs.push({ label: 'Allergies', path: '/health/allergies' });
  tabs.push({ label: 'Reports', path: '/health/reporting' });

  return (
    <Bar>
      {tabs.map((t) => {
        const isActive = location.pathname === t.path || (t.path === '/health/meds' && location.pathname.startsWith('/health/meds'));
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
