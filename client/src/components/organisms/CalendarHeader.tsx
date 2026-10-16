import styled from 'styled-components';
import { Icon } from '../atoms/core/Icon.jsx';
import type { CalendarViewMode } from '../../views/CalendarView.js';

/* ── Styled ── */

export const TopBar = styled.div`
  padding: 40px 24px 16px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-shrink: 0;
  @media (max-width: 768px) {
    flex-direction: column;
    gap: 20px;
    padding-bottom: 20px;
  }
`;

export const TitleBlock = styled.div``;

export const DisplayTitle = styled.h1`
  font-family: var(--font-display);
  font-size: 48px;
  font-weight: 200;
  line-height: 1;
  color: var(--text-primary);
  letter-spacing: -0.01em;
  margin: 0;
  span { font-weight: 400; }
`;

const Controls = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  @media (max-width: 768px) {
    margin-top: 0;
    justify-content: flex-start;
  }
`;

const TabGroup = styled.div`
  display: flex;
  border: 1px solid var(--border-default);
  border-radius: 3px;
  overflow: hidden;
`;

const Tab = styled.button<{ $active?: boolean; $accent?: string }>`
  padding: 6px 14px;
  font-family: var(--font-label, var(--font-sans));
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  border: none;
  cursor: pointer;
  background: ${({ $active, $accent }) => $active ? ($accent || 'var(--color-accent)') : 'var(--bg-surface)'};
  color: ${({ $active }) => $active ? 'var(--on-accent, #fff)' : 'var(--text-secondary)'};
  transition: background 0.1s, color 0.1s;
  &:not(:last-child) { border-right: 1px solid var(--border-default); }
  &:hover:not(:disabled) {
    background: ${({ $active, $accent }) => $active ? ($accent || 'var(--color-accent)') : 'var(--bg-hover)'};
  }
`;

const TodayBtn = styled.button`
  padding: 6px 14px;
  font-family: var(--font-label, var(--font-sans));
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  border: 1px solid var(--border-default);
  border-radius: 3px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  cursor: pointer;
  &:hover { background: var(--bg-hover); }
`;

const NavGroup = styled.div`
  display: flex;
  border: 1px solid var(--border-default);
  border-radius: 3px;
  overflow: hidden;
`;

const NavBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  background: var(--bg-surface);
  border: none;
  cursor: pointer;
  color: var(--text-secondary);
  &:first-child { border-right: 1px solid var(--border-default); }
  &:hover { background: var(--bg-hover); }
`;

/* ── Component ── */

const MobileSubtitle = styled.div`
  display: none;
  @media (max-width: 768px) {
    display: block;
    font-family: var(--font-label, var(--font-sans));
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-tertiary);
    margin-top: 6px;
    margin-bottom: 8px;
  }
`;

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
          <Tab $active={viewMode === 'day'} $accent={accentColor} onClick={() => onViewMode('day')}>DAY</Tab>
          <Tab $active={viewMode === 'week'} $accent={accentColor} onClick={() => onViewMode('week')}>WEEK</Tab>
          <Tab $active={viewMode === 'month'} $accent={accentColor} onClick={() => onViewMode('month')}>MONTH</Tab>
        </TabGroup>
        <TodayBtn onClick={onToday}>TODAY</TodayBtn>
        <NavGroup>
          <NavBtn onClick={onPrev}><Icon name="chevron-left" size={14} strokeWidth={2} /></NavBtn>
          <NavBtn onClick={onNext}><Icon name="chevron-right" size={14} strokeWidth={2} /></NavBtn>
        </NavGroup>
      </Controls>
    </TopBar>
  );
}
