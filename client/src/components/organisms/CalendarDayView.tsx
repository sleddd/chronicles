import styled from 'styled-components';
import { PillButton } from '../atoms/PillButton.js';
import { useNavigate } from 'react-router-dom';
import { CalendarHeader } from './CalendarHeader.js';
import { stripHtml, builtinEntryName } from '../../utils/stripHtml.js';
import { useUIStore } from '../../stores/uiStore.js';
import type { DecryptedPost } from '@shared/crypto/types';
import type { Topic } from '../../types/topics.js';
import type { CalendarViewMode } from '../../views/CalendarView.js';
import type { CalendarBillItem } from '../../types/finance.js';
import { formatCents } from '../../utils/finance.js';

const NO_BILLS: CalendarBillItem[] = [];

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function extractTitle(html: string, fallback?: string): string {
  const headingMatch = html.match(/<h[1-4][^>]*>(.*?)<\/h[1-4]>/i);
  if (headingMatch) {
    // Sanitized text extraction — never parse raw entry HTML into the live DOM
    const text = stripHtml(headingMatch[1]).trim();
    if (text) return text;
  }
  return stripHtml(html).trim().slice(0, 80) || fallback || 'Untitled';
}

/* ── Styled ── */

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--bg-app);
`;

/* "Thursday, October 15" with Add entry across, a firmer rule under */
const DayHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 0 24px;
  padding: 4px 0 18px;
  border-bottom: 1px solid var(--border-default);
  flex-shrink: 0;
`;

const DayTitle = styled.h2`
  margin: 0;
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 300;
  color: var(--text-secondary);
  @media (max-width: 480px) { font-size: 22px; }
`;

const List = styled.div`
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 0 24px;
`;

const EmptyMsg = styled.div`
  padding: 28px 0;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
`;

/* time | kind over title */
const EntryRow = styled.div`
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: 20px;
  align-items: start;
  padding: 18px 0;
  cursor: pointer;
  border-bottom: 1px solid var(--border-subtle);
  &:hover h3 { color: var(--text-primary); }
  @media (max-width: 640px) { grid-template-columns: 76px minmax(0, 1fr); gap: 12px; }
`;

const TimeLabel = styled.span`
  padding-top: 2px;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-muted);
`;

const TopicLabel = styled.div`
  margin-bottom: 4px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--color-accent-link);
`;

const EntryTitle = styled.h3`
  margin: 0;
  font-family: var(--font-sans);
  font-size: 17px;
  font-weight: 400;
  line-height: 1.35;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const BillDot = styled.i`
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-right: 8px;
  border-radius: 50%;
  vertical-align: middle;
  background: var(--chart-amber);
`;

/* ── helpers ── */
function getTimeLabel(entry: DecryptedPost, eventTopicIds: Set<number>): string {
  const meta = entry.metadata as Record<string, unknown>;
  const taxId = meta?._taxonomyId as number | undefined;
  if (taxId !== undefined && eventTopicIds.has(taxId)) {
    const cf = meta._customFields as Record<string, unknown> | undefined;
    const t = cf?.startTime as string | undefined;
    if (t) {
      const [h, m] = t.split(':').map(Number);
      if (!isNaN(h)) {
        const suffix = h >= 12 ? 'PM' : 'AM';
        return `${h % 12 || 12}:${String(m || 0).padStart(2, '0')} ${suffix}`;
      }
    }
  }
  const created = entry.createdAt instanceof Date ? entry.createdAt : new Date(entry.createdAt);
  const h = created.getHours();
  const m = created.getMinutes();
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/* ── Component ── */

interface CalendarDayViewProps {
  dateStr: string;
  entries: DecryptedPost[];
  allTopics: Topic[];
  accentColor: string;
  eventTopicIds: Set<number>;
  taskTopicIds: Set<number>;
  viewMode: CalendarViewMode;
  currentDate: Date;
  getTopicForEntry: (entry: DecryptedPost) => Topic | undefined;
  /** Bills due this day (Finance on) */
  bills?: CalendarBillItem[];
  onBillClick?: (bill: CalendarBillItem) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onViewMode: (mode: CalendarViewMode) => void;
}

export function CalendarDayView({
  dateStr, entries, accentColor, eventTopicIds, viewMode,
  getTopicForEntry, onPrev, onNext, onToday, onViewMode, bills = NO_BILLS, onBillClick,
}: CalendarDayViewProps) {
  const navigate = useNavigate();
  const setSelectedEntryId = useUIStore(s => s.setSelectedEntryId);
  const date = new Date(dateStr + 'T00:00:00');
  const monthYear = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const title = (
    <>{monthYear.split(' ')[0]} <span>{date.getFullYear()}</span></>
  );

  const dateSubtitle = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <Wrapper>
      <CalendarHeader
        title={title}
        viewMode={viewMode}
        accentColor={accentColor}
        onPrev={onPrev}
        onNext={onNext}
        onToday={onToday}
        onViewMode={onViewMode}
      />
      <DayHead>
        <DayTitle>{dateSubtitle}</DayTitle>
        <PillButton type="button" onClick={() => navigate('/journal', { state: { newEntryDate: dateStr, from: '/calendar' } })}>
          Add entry
        </PillButton>
      </DayHead>

      <List>
        {bills.map(b => (
          <EntryRow key={b.key} onClick={() => onBillClick?.(b)}>
            <TimeLabel>Due</TimeLabel>
            <div>
              <TopicLabel style={{ color: 'var(--text-muted)' }}><BillDot />Bill</TopicLabel>
              <EntryTitle>{b.name} · {formatCents(b.amountCents)}</EntryTitle>
            </div>
          </EntryRow>
        ))}
        {entries.length === 0 && bills.length === 0 ? (
          <EmptyMsg>Nothing on this day.</EmptyMsg>
        ) : (
          entries.map(entry => {
            const topic = getTopicForEntry(entry);
            const timeLabel = getTimeLabel(entry, eventTopicIds);
            const title = extractTitle(entry.content, builtinEntryName((entry.metadata as Record<string, unknown>)?._customFields as Record<string, unknown>));
            return (
              <EntryRow key={entry.id} onClick={() => { setSelectedEntryId(entry.id); navigate('/journal', { state: { from: '/calendar' } }); }}>
                <TimeLabel>{timeLabel}</TimeLabel>
                <div style={{ minWidth: 0 }}>
                  {topic && <TopicLabel>{topic.name}</TopicLabel>}
                  <EntryTitle>{title}</EntryTitle>
                </div>
              </EntryRow>
            );
          })
        )}
      </List>
    </Wrapper>
  );
}
