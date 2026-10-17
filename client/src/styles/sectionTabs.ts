import styled from 'styled-components';

/* One look for every section's tabs (Health, Kitchen, Roadmap, Finance): tracked
   uppercase labels on a hairline rule; the active tab is accent text with a 2px
   accent underline sitting on the rule — the same accent tab the nav rail uses. */
export const SectionTabBar = styled.nav`
  display: flex;
  align-items: flex-end;
  column-gap: 28px;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--border-subtle);

  @media (max-width: 480px) { column-gap: 20px; }
`;

export const SectionTab = styled.button<{ $active?: boolean }>`
  padding: 14px 0 11px;
  margin-bottom: -1px;
  font-family: var(--font-label);
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: ${({ $active }) => ($active ? 'var(--color-accent)' : 'var(--text-tab)')};
  background: transparent;
  border: none;
  border-bottom: 2px solid ${({ $active }) => ($active ? 'var(--color-accent)' : 'transparent')};
  cursor: pointer;
  white-space: nowrap;
  transition: color 120ms ease, border-color 120ms ease;

  &:hover:not([aria-selected="true"]) {
    color: var(--text-primary);
    border-bottom-color: var(--border-strong);
  }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;
