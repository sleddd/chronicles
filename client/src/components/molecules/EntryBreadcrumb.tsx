import { Fragment } from 'react';
import styled from 'styled-components';
import type { TrailCrumb } from '../../utils/topicBreadcrumb.js';

/* Where the open entry lives — VIEW / SUBVIEW in tracked caps, each ancestor a
   link back. Sits at the right end of the Journal title row. Props only. */

const Row = styled.nav`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
`;

const CrumbLink = styled.button`
  padding: 0;
  background: transparent;
  border: none;
  cursor: pointer;
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  transition: color 120ms ease;
  &:hover { color: var(--text-primary); }
  &:disabled { cursor: default; }
  &:disabled:hover { color: var(--text-tertiary); }
`;

const CrumbSep = styled.span`
  font-family: var(--font-label);
  font-size: 11px;
  color: var(--text-tertiary);
`;

interface EntryBreadcrumbProps {
  trail: TrailCrumb[];
  onNavigate?: (path: string) => void;
}

export function EntryBreadcrumb({ trail, onNavigate }: EntryBreadcrumbProps) {
  return (
    <Row aria-label="Entry location">
      {trail.map((crumb, i) => (
        <Fragment key={crumb.label}>
          {i > 0 && <CrumbSep>/</CrumbSep>}
          <CrumbLink
            type="button"
            disabled={!crumb.path || !onNavigate}
            onClick={() => crumb.path && onNavigate?.(crumb.path)}
          >
            {crumb.label}
          </CrumbLink>
        </Fragment>
      ))}
    </Row>
  );
}
