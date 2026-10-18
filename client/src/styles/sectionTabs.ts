import styled from 'styled-components';

/* One look for every section's tabs (Health, Kitchen, Planning, Finance):
   sentence-case labels on a hairline rule, muted until chosen; the active tab is
   soft-accent text with a 3px accent underline sitting on the rule. */
export const SectionTabBar = styled.nav`
  display: flex;
  align-items: flex-end;
  column-gap: 36px;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--border-subtle);

  @media (max-width: 768px) { column-gap: 28px; }
  @media (max-width: 480px) { column-gap: 20px; }
`;

export const SectionTab = styled.button<{ $active?: boolean }>`
  padding: 10px 0 12px;
  margin-bottom: -1px;
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: 400;
  color: ${({ $active }) => ($active ? 'var(--color-accent-soft)' : 'var(--text-muted)')};
  background: transparent;
  border: none;
  border-bottom: 3px solid ${({ $active }) => ($active ? 'var(--color-accent)' : 'transparent')};
  cursor: pointer;
  white-space: nowrap;
  transition: color 120ms ease, border-color 120ms ease;

  &:hover:not([aria-selected="true"]) {
    color: var(--text-secondary);
    border-bottom-color: var(--border-strong);
  }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  @media (max-width: 480px) { font-size: 14px; }
`;
