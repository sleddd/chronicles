import styled from 'styled-components';
import { Icon } from '../atoms/core/Icon.jsx';
import type { CalendarViewMode } from '../../views/CalendarView.js';

/* ── Styled ── */

export const TopBar = styled.div`
  padding: 40px 24px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-shrink: 0;
  @media (max-width: 768px) {
    flex-direction: column;
    align-items: flex-start;
    gap: 26px;
    padding-bottom: 44px;
  }
`;

export const TitleBlock = styled.div``;

/* "October 2026": the month in soft white, the year in muted grey, both thin */
export const DisplayTitle = styled.h1`
  font-family: var(--font-display);
  font-size: 44px;
  font-weight: 300;
  line-height: 1;
  color: var(--text-secondary);
  margin: 0;
  span { font-weight: 300; color: var(--text-muted); }
  @media (max-width: 480px) { font-size: 34px; }
`;

const Controls = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
`;

const box = `
  display: flex;
  align-items: center;
  height: 40px;
  border: 1px solid var(--border-card);
  border-radius: 10px;
`;

/* Day / Week / Month — the chosen one lifted onto --bg-active, its text the standard colour (no accent) */
const TabGroup = styled.div`
  ${box}
  gap: 2px;
  padding: 4px;
`;

const Tab = styled.button<{ $active?: boolean; $accent?: string }>`
  height: 30px;
  padding: 0 14px;
  border: none;
  border-radius: 7px;
  background: ${({ $active }) => ($active ? 'var(--bg-active)' : 'transparent')};
  font-family: var(--font-sans);
  font-size: 14px;
  color: ${({ $active }) => ($active ? 'var(--text-primary)' : 'var(--text-muted)')};
  cursor: pointer;
  &:hover { color: ${({ $active }) => ($active ? 'var(--text-primary)' : 'var(--text-secondary)')}; }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 1px; }
`;

const TodayBtn = styled.button`
  ${box}
  padding: 0 18px;
  background: transparent;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-secondary);
  cursor: pointer;
  &:hover { border-color: var(--control-border); }
`;

const NavGroup = styled.div`
  ${box}
  padding: 0 4px;
`;

const NavBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: transparent;
  border: none;
  border-radius: 7px;
  cursor: pointer;
  color: var(--text-muted);
  &:hover { color: var(--text-primary); }
`;

const MobileSubtitle = styled.div`
  display: none;
  @media (max-width: 768px) {
    display: block;
    font-family: var(--font-sans);
    font-size: 14px;
    color: var(--text-muted);
    margin-top: 8px;
  }
`;

/* ── Component ── */

interface CalendarHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  viewMode: CalendarViewMode;
  accentColor: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onViewMode: (mode: CalendarViewMode) => void;
}

export function CalendarHeader({ title, subtitle, viewMode, accentColor, onPrev, onNext, onToday, onViewMode }: CalendarHeaderProps) {
  return (
    <TopBar>
      <TitleBlock>
        <DisplayTitle>{title}</DisplayTitle>
        {subtitle && <MobileSubtitle>{subtitle}</MobileSubtitle>}
      </TitleBlock>
      <Controls>
        <TabGroup>
          <Tab $active={viewMode === 'day'} $accent={accentColor} onClick={() => onViewMode('day')}>Day</Tab>
          <Tab $active={viewMode === 'week'} $accent={accentColor} onClick={() => onViewMode('week')}>Week</Tab>
          <Tab $active={viewMode === 'month'} $accent={accentColor} onClick={() => onViewMode('month')}>Month</Tab>
        </TabGroup>
        <TodayBtn onClick={onToday}>Today</TodayBtn>
        <NavGroup>
          <NavBtn onClick={onPrev} aria-label="Previous"><Icon name="chevron-left" size={14} strokeWidth={2} /></NavBtn>
          <NavBtn onClick={onNext} aria-label="Next"><Icon name="chevron-right" size={14} strokeWidth={2} /></NavBtn>
        </NavGroup>
      </Controls>
    </TopBar>
  );
}
