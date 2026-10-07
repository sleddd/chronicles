import styled from 'styled-components';
import { useLocation, useNavigate } from 'react-router-dom';

/* Same look as the Health tabs: hairline rules above and below, accent text when active. */
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

/** Section title shared by every From the Kitchen page. */
export const KITCHEN_TITLE = 'From the Kitchen';

const TABS: { label: string; path: string }[] = [
  { label: 'Dashboard', path: '/kitchen' },
  { label: 'Menu', path: '/menu' },
  { label: 'Recipes', path: '/menu/recipes' },
  { label: 'Shopping Lists', path: '/shopping' },
];

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
