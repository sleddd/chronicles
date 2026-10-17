import styled from 'styled-components';
import { PillButton } from '../atoms/PillButton.js';
import { useNavigate } from 'react-router-dom';
import { stripHtml, builtinEntryName } from '../../utils/stripHtml.js';
import { useUIStore } from '../../stores/uiStore.js';
import { formatCents } from '../../utils/finance.js';
import type { CalendarBillItem } from '../../types/finance.js';

import type { DecryptedPost } from '@shared/crypto/types';
import type { Topic } from '../../types/topics.js';
import type { EventFieldValues, MeetingFieldValues, TaskFieldValues } from '../../types/fields.js';

/* ── helpers ── */

function formatTime(t: string | undefined): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  if (isNaN(h)) return '';
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m || 0).padStart(2, '0')}`;
}

function parseSortableTime(t: string | undefined): number {
  if (!t) return 99999;
  const [h, m] = t.split(':').map(Number);
  return isNaN(h) ? 99999 : h * 60 + (m || 0);
}

/* ── Styled ── */

const Panel = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--bg-surface);
`;

const DayHeader = styled.div`
  padding: 24px 24px 16px;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
`;

const DayNumberRow = styled.div`
  display: flex;
  align-items: baseline;
  gap: 10px;
`;

const BigDayNumber = styled.div`
  font-family: var(--font-display);
  font-size: 64px;
  font-weight: 300;
  line-height: 1;
  color: var(--text-primary);
`;

const WeekdayLabel = styled.div`
  font-family: var(--font-label, var(--font-sans));
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-tertiary);
`;

const CountLine = styled.div`
  margin-top: 6px;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-tertiary);
`;

const List = styled.div`
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 12px 0 48px;
`;

const EventRow = styled.div<{ $accent: string }>`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 20px;
  cursor: pointer;
  &:hover { background: var(--bg-hover); }
`;

const AccentBar = styled.div<{ $color: string }>`
  width: 3px;
  min-height: 36px;
  border-radius: 2px;
  background: ${({ $color }) => $color};
  flex-shrink: 0;
  align-self: stretch;
`;

const TimeCol = styled.div`
  font-family: var(--font-label, var(--font-sans));
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.04em;
  color: var(--text-tertiary);
  width: 44px;
  flex-shrink: 0;
  padding-top: 3px;
  text-align: right;
`;


const EventContent = styled.div`
  flex: 1;
  min-width: 0;
`;

const EventTitle = styled.div`
  font-family: var(--font-sans);
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const EventMeta = styled.div`
  font-family: var(--font-label, var(--font-sans));
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  margin-top: 2px;
`;


const EmptyMsg = styled.div`
  padding: 40px 24px;
  font-size: 13px;
  color: var(--text-tertiary);
  text-align: center;
`;

/* ── Component ── */

interface CalendarDayDetailProps {
  dateStr: string;
  entries: DecryptedPost[];
  allTopics: Topic[];
  accentColor: string;
  eventTopicIds: Set<number>;
  taskTopicIds: Set<number>;
  onClose: () => void;
  /** Bills due this day (Finance, when switched on). */
  bills?: CalendarBillItem[];
}

export function CalendarDayDetail({
  dateStr, entries, allTopics, accentColor, eventTopicIds, taskTopicIds, bills = [],
}: CalendarDayDetailProps) {
  const navigate = useNavigate();
  const setSelectedEntryId = useUIStore(s => s.setSelectedEntryId);

  const date = new Date(dateStr + 'T00:00:00');
  const dayNum = date.getDate();
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();

  const eventCount = entries.filter(e => {
    const taxId = (e.metadata as Record<string, unknown>)?._taxonomyId as number | undefined;
    return taxId !== undefined && eventTopicIds.has(taxId);
  }).length;

  const taskCount = entries.filter(e => {
    const taxId = (e.metadata as Record<string, unknown>)?._taxonomyId as number | undefined;
    return taxId !== undefined && taskTopicIds.has(taxId);
  }).length;

  const countParts: string[] = [];
  if (entries.length > 0) countParts.push(`${entries.length} ${entries.length === 1 ? 'item' : 'items'}`);
  if (eventCount > 0) countParts.push(`${eventCount} ${eventCount === 1 ? 'event' : 'events'}`);
  if (taskCount > 0) countParts.push(`${taskCount} ${taskCount === 1 ? 'task' : 'tasks'}`);
  const countLine = countParts.join(' · ');

  const getTopicForEntry = (entry: DecryptedPost) => {
    const taxId = (entry.metadata as Record<string, unknown>)?._taxonomyId as number | undefined;
    return taxId ? allTopics.find(t => t.id === taxId) : undefined;
  };

  // Build display rows sorted by time (events first with their startTime, rest at EOD)
  const rows = [...entries].sort((a, b) => {
    const aMeta = a.metadata as Record<string, unknown>;
    const bMeta = b.metadata as Record<string, unknown>;
    const aTaxId = aMeta?._taxonomyId as number | undefined;
    const bTaxId = bMeta?._taxonomyId as number | undefined;
    const aIsEvent = aTaxId !== undefined && eventTopicIds.has(aTaxId);
    const bIsEvent = bTaxId !== undefined && eventTopicIds.has(bTaxId);

    const getTime = (meta: Record<string, unknown>, isEv: boolean) => {
      if (!isEv) return 99999;
      const cf = meta._customFields as Record<string, unknown> | undefined;
      return parseSortableTime(cf?.startTime as string | undefined);
    };

    return getTime(aMeta, aIsEvent) - getTime(bMeta, bIsEvent);
  });

  return (
    <Panel>
      <DayHeader>
        <DayNumberRow>
          <BigDayNumber>{dayNum}</BigDayNumber>
          <WeekdayLabel>{weekday}</WeekdayLabel>
          <PillButton type="button" style={{ marginLeft: 'auto', alignSelf: 'flex-start' }} onClick={() => navigate('/journal', { state: { newEntryDate: dateStr, from: '/calendar' } })}>
            Add entry
          </PillButton>
        </DayNumberRow>
        {countLine && <CountLine>{countLine}</CountLine>}
      </DayHeader>

      <List>
        {bills.map(b => (
          <EventRow key={b.key} $accent={accentColor} onClick={() => navigate('/finance')}>
            <TimeCol>Due</TimeCol>
            <AccentBar $color="var(--border-strong)" />
            <EventContent>
              <EventTitle>{b.name}</EventTitle>
              <EventMeta>BILL · {formatCents(b.amountCents)}</EventMeta>
            </EventContent>
          </EventRow>
        ))}
        {rows.length === 0 ? (
          bills.length === 0 && <EmptyMsg>No entries for this day.</EmptyMsg>
        ) : (
          rows.map(entry => {
            const meta = entry.metadata as Record<string, unknown>;
            const taxId = meta?._taxonomyId as number | undefined;
            const isEvent = taxId !== undefined && eventTopicIds.has(taxId);
            const isTask = taxId !== undefined && taskTopicIds.has(taxId);
            const topic = getTopicForEntry(entry);

            let timeLabel = '';
            let metaLine = '';

            if (isEvent) {
              const cf = meta._customFields as Partial<EventFieldValues & MeetingFieldValues> | undefined;
              timeLabel = formatTime(cf?.startTime);
              const typeName = topic?.name?.toUpperCase() || 'EVENT';
              const detail = (cf as Partial<MeetingFieldValues>)?.meetingTopic || cf?.location || '';
              metaLine = detail ? `${typeName} · ${detail.toUpperCase()}` : typeName;
            } else {
              const created = entry.createdAt instanceof Date ? entry.createdAt : new Date(entry.createdAt);
              timeLabel = formatTime(`${String(created.getHours()).padStart(2, '0')}:${String(created.getMinutes()).padStart(2, '0')}`);
              if (isTask) {
                const cf = meta._customFields as Partial<TaskFieldValues> | undefined;
                const priority = cf?.priority;
                metaLine = priority && priority !== 'none' ? `TASK · ${priority.toUpperCase()}` : 'TASK';
              } else {
                metaLine = topic?.name?.toUpperCase() || 'ENTRY';
              }
            }

            const title = (stripHtml(entry.content).trim() || builtinEntryName((entry.metadata as Record<string, unknown>)?._customFields as Record<string, unknown>)).slice(0, 60) || topic?.name || 'Entry';

            const handleClick = () => {
              setSelectedEntryId(entry.id);
              navigate('/journal', { state: { from: '/calendar' } });
            };

            return (
              <EventRow key={entry.id} $accent={accentColor} onClick={handleClick}>
                <TimeCol>{timeLabel}</TimeCol>
                <AccentBar $color={accentColor} />
                <EventContent>
                  <EventTitle>{title}</EventTitle>
                  <EventMeta>{metaLine}</EventMeta>
                </EventContent>
              </EventRow>
            );
          })
        )}
      </List>
    </Panel>
  );
}
