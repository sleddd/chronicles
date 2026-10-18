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
  background: var(--bg-app);
`;

const DayHeader = styled.div`
  margin: 0 24px;
  padding: 24px 0 18px;
  border-bottom: 1px solid var(--border-default);
  flex-shrink: 0;
  @media (max-width: 900px) { margin: 0; }
`;

const DayNumberRow = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
`;

const BigDayNumber = styled.div`
  font-family: var(--font-display);
  font-size: 56px;
  font-weight: 300;
  line-height: 1;
  color: var(--text-secondary);
`;

const WeekdayLabel = styled.div`
  font-family: var(--font-sans);
  font-size: 18px;
  font-weight: 400;
  letter-spacing: normal;
  text-transform: none;
  color: var(--text-muted);
`;

const CountLine = styled.div`
  margin-top: 6px;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-muted);
`;

const List = styled.div`
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 12px 0 48px;
`;

/* "• Title" over the kind (muted); on phones the kind sits on the right */
const EventRow = styled.div<{ $accent: string }>`
  display: grid;
  grid-template-columns: 8px minmax(0, 1fr);
  column-gap: 16px;
  align-items: baseline;
  margin: 0 24px;
  padding: 16px 0;
  border-bottom: 1px solid var(--border-subtle);
  cursor: pointer;
  &:hover span:first-of-type { color: var(--text-primary); }
  @media (max-width: 900px) { margin: 0; }
`;

const Dot = styled.i<{ $bill?: boolean }>`
  width: 7px;
  height: 7px;
  border-radius: 50%;
  align-self: center;
  background: ${({ $bill }) => ($bill ? 'var(--chart-amber)' : 'var(--color-accent)')};
`;

const EventContent = styled.div`
  min-width: 0;
  @media (max-width: 900px) { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
`;

const EventTitle = styled.span`
  display: block;
  min-width: 0;
  font-family: var(--font-sans);
  font-size: 16px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const EventMeta = styled.span`
  display: block;
  margin-top: 4px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
  white-space: nowrap;
  @media (max-width: 900px) { margin-top: 0; flex: none; }
`;

const EmptyMsg = styled.div`
  padding: 20px 24px;
  font-size: 15px;
  color: var(--text-muted);
  text-align: left;
  @media (max-width: 900px) { padding: 20px 0; }
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
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });

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
          <PillButton type="button" style={{ marginLeft: 'auto' }} onClick={() => navigate('/journal', { state: { newEntryDate: dateStr, from: '/calendar' } })}>
            Add
          </PillButton>
        </DayNumberRow>
        {countLine && <CountLine>{countLine}</CountLine>}
      </DayHeader>

      <List>
        {bills.map(b => (
          <EventRow key={b.key} $accent={accentColor} onClick={() => navigate('/finance')}>
            <Dot $bill aria-hidden="true" />
            <EventContent>
              <EventTitle>{b.name}</EventTitle>
              <EventMeta>Bill · {formatCents(b.amountCents)} due</EventMeta>
            </EventContent>
          </EventRow>
        ))}
        {rows.length === 0 ? (
          bills.length === 0 && <EmptyMsg>Nothing on this day.</EmptyMsg>
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
              const typeName = topic?.name || 'Event';
              const detail = (cf as Partial<MeetingFieldValues>)?.meetingTopic || cf?.location || '';
              metaLine = detail ? `${typeName} · ${detail}` : typeName;
            } else {
              const created = entry.createdAt instanceof Date ? entry.createdAt : new Date(entry.createdAt);
              timeLabel = formatTime(`${String(created.getHours()).padStart(2, '0')}:${String(created.getMinutes()).padStart(2, '0')}`);
              if (isTask) {
                const cf = meta._customFields as Partial<TaskFieldValues> | undefined;
                const priority = cf?.priority;
                metaLine = priority && priority !== 'none' ? `Task · ${priority[0].toUpperCase()}${priority.slice(1)} priority` : 'Task';
              } else {
                metaLine = topic?.name || 'Entry';
              }
            }

            const title = (stripHtml(entry.content).trim() || builtinEntryName((entry.metadata as Record<string, unknown>)?._customFields as Record<string, unknown>)).slice(0, 60) || topic?.name || 'Entry';

            const handleClick = () => {
              setSelectedEntryId(entry.id);
              navigate('/journal', { state: { from: '/calendar' } });
            };

            return (
              <EventRow key={entry.id} $accent={accentColor} onClick={handleClick} title={timeLabel ? `${timeLabel} · ${metaLine}` : metaLine}>
                <Dot aria-hidden="true" />
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
