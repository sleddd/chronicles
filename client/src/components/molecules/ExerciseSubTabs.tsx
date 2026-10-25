import type { ReactNode } from 'react';
import styled from 'styled-components';
import { useLocation, useNavigate } from 'react-router-dom';
import { JoinedGroup, JoinedBtn } from './fields/formKit.js';

/* Health → Exercise's sub tabs: Schedule (the daily checklist beside this week or
   the list — the default), Training (training plans) and History (what you did
   over a period). The standard joined group (formKit), the chosen tab on a
   light grey fill, with an optional control (e.g. Download CSV) across. */

const TABS = [
  { value: '/health/exercise/schedule', label: 'Schedule' },
  { value: '/health/exercise/training', label: 'Training' },
  { value: '/health/exercise/history', label: 'History' },
];

const Bar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 24px;
`;

export function ExerciseSubTabs({ aside }: { aside?: ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const active = TABS.find(t => t.value === pathname)?.value ?? TABS[0].value;
  return (
    <Bar>
      <JoinedGroup role="tablist" aria-label="Exercise">
        {TABS.map(t => (
          <JoinedBtn key={t.value} type="button" role="tab" aria-selected={active === t.value} $fill $active={active === t.value}
            onClick={() => navigate(t.value)}>{t.label}</JoinedBtn>
        ))}
      </JoinedGroup>
      {aside}
    </Bar>
  );
}
