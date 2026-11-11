import type { ReactNode } from 'react';
import styled from 'styled-components';
import { Icon } from '../atoms/core/Icon.jsx';
import { glassControl } from '../../styles/wallpaper.js';

/* A filter pill: "Status  All ⌄" — the name muted, the choice in bold, the
   real <select> invisible over it (a select is as wide as its longest
   option). A set filter gets an accent outline and its choice in the soft
   accent. Shared by Planning's filter row and the Media shelf. Props only. */

export const PickPill = styled.label<{ $set: boolean }>`
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  max-width: 100%;
  padding: 0 14px 0 18px;
  border: 1px solid ${({ $set }) => ($set ? 'var(--color-accent-line)' : 'var(--border-card)')};
  border-radius: 999px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-secondary);
  cursor: pointer;
  &:hover { border-color: ${({ $set }) => ($set ? 'var(--color-accent-line)' : 'var(--border-strong)')}; }
  &:focus-within { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  b {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
    color: ${({ $set }) => ($set ? 'var(--color-accent-soft)' : 'var(--text-primary)')};
  }
  & > span:last-of-type { display: inline-flex; color: var(--text-muted); }
  select {
    position: absolute;
    inset: 0;
    width: 100%;
    opacity: 0;
    cursor: pointer;
    font-size: 16px; /* no zoom on iOS */
  }
  option { color: var(--text-primary); background: var(--bg-surface); }
  ${glassControl}
`;

export function FilterPick({ name, value, set, children }: { name: string; value: string; set: boolean; children: ReactNode }) {
  return (
    <PickPill $set={set}>
      <span>{name}</span>
      <b>{value}</b>
      <span aria-hidden="true"><Icon name="chevron-down" size={14} strokeWidth={2} /></span>
      {children}
    </PickPill>
  );
}
