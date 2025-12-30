'use client';

import { useState, useEffect, useCallback } from 'react';
import { useEncryption } from '@/lib/hooks/useEncryption';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  parseISO,
} from 'date-fns';

interface CalendarEvent {
  id: string;
  encryptedTitle: string;
  titleIv: string;
  encryptedDescription: string | null;
  descriptionIv: string | null;
  startDate: string;
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
  isAllDay: boolean;
  color: string;
  linkedEntryId: string | null;
}

interface CalendarEntry {
  id: string;
  encryptedContent: string;
  iv: string;
  customType: string;
  entryDate: string;
  custom_fields: Array<{ encryptedData: string; iv: string }> | null;
}

interface DecryptedEvent {
  id: string;
  title: string;
  description: string | null;
  startDate: string;
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
  isAllDay: boolean;
  color: string;
  type: 'event';
}

interface DecryptedEntry {
  id: string;
  title: string;
  entryDate: string;
  customType: string;
  color: string;
  type: 'entry';
}

type CalendarItem = DecryptedEvent | DecryptedEntry;

interface CalendarViewProps {
  onEventSelect?: (eventId: string) => void;
  onEntrySelect?: (entryId: string) => void;
  onDateSelect?: (date: string) => void;
  onCreateEvent?: (date: string) => void;
  selectedEventId?: string | null;
  today: string;
}

export function CalendarView({
  onEventSelect,
  onEntrySelect,
  onDateSelect,
  onCreateEvent,
  selectedEventId,
  today,
}: CalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [decryptedItems, setDecryptedItems] = useState<Map<string, CalendarItem>>(new Map());
  const [loading, setLoading] = useState(true);
  const { decryptData, isKeyReady } = useEncryption();

  const fetchCalendarData = useCallback(async () => {
    const start = startOfWeek(startOfMonth(currentMonth));
    const end = endOfWeek(endOfMonth(currentMonth));

    try {
      const response = await fetch(
        `/api/calendar?startDate=${format(start, 'yyyy-MM-dd')}&endDate=${format(end, 'yyyy-MM-dd')}`
      );
      if (response.ok) {
        const data = await response.json();
        setEvents(data.events || []);
        setEntries(data.entries || []);
      }
    } catch (error) {
      console.error('Failed to fetch calendar data:', error);
    } finally {
      setLoading(false);
    }
  }, [currentMonth]);

  useEffect(() => {
    fetchCalendarData();
  }, [fetchCalendarData]);

  useEffect(() => {
    if (!isKeyReady) return;

    const decryptItems = async () => {
      const decrypted = new Map<string, CalendarItem>();

      // Decrypt events
      for (const event of events) {
        try {
          const title = await decryptData(event.encryptedTitle, event.titleIv);
          let description: string | null = null;
          if (event.encryptedDescription && event.descriptionIv) {
            description = await decryptData(event.encryptedDescription, event.descriptionIv);
          }
          decrypted.set(event.id, {
            id: event.id,
            title,
            description,
            startDate: event.startDate,
            startTime: event.startTime,
            endDate: event.endDate,
            endTime: event.endTime,
            isAllDay: event.isAllDay,
            color: event.color,
            type: 'event',
          });
        } catch (error) {
          console.error('Failed to decrypt event:', event.id);
        }
      }

      // Decrypt entries (tasks, goals, medications)
      for (const entry of entries) {
        try {
          const content = await decryptData(entry.encryptedContent, entry.iv);
          // Extract first line as title
          const title = content.split('\n')[0].replace(/<[^>]*>/g, '').slice(0, 50);

          const colorMap: Record<string, string> = {
            task: '#f59e0b',
            goal: '#10b981',
            medication: '#ec4899',
            meeting: '#8b5cf6',
          };

          decrypted.set(entry.id, {
            id: entry.id,
            title: title || entry.customType,
            entryDate: entry.entryDate,
            customType: entry.customType,
            color: colorMap[entry.customType] || '#6366f1',
            type: 'entry',
          });
        } catch (error) {
          console.error('Failed to decrypt entry:', entry.id);
        }
      }

      setDecryptedItems(decrypted);
    };

    decryptItems();
  }, [events, entries, isKeyReady, decryptData]);

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth((prev) => (direction === 'prev' ? subMonths(prev, 1) : addMonths(prev, 1)));
  };

  const getItemsForDate = (date: Date): CalendarItem[] => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const items: CalendarItem[] = [];

    decryptedItems.forEach((item) => {
      if (item.type === 'event') {
        const start = item.startDate;
        const end = item.endDate || item.startDate;
        if (dateStr >= start && dateStr <= end) {
          items.push(item);
        }
      } else {
        if (item.entryDate === dateStr) {
          items.push(item);
        }
      }
    });

    return items;
  };

  // Get unique item types for a date to show indicator dots
  const getItemTypesForDate = (items: CalendarItem[]): string[] => {
    const types = new Set<string>();
    items.forEach((item) => {
      if (item.type === 'event') {
        types.add('event');
      } else {
        types.add(item.customType);
      }
    });
    return Array.from(types);
  };

  const typeColors: Record<string, string> = {
    event: '#6366f1',
    task: '#f59e0b',
    medication: '#ec4899',
    meeting: '#8b5cf6',
    goal: '#10b981',
  };

  const renderMonthView = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calendarStart = startOfWeek(monthStart);
    const calendarEnd = endOfWeek(monthEnd);
    const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

    const dayLabels = [
      { short: 'S', full: 'Sun' },
      { short: 'M', full: 'Mon' },
      { short: 'T', full: 'Tue' },
      { short: 'W', full: 'Wed' },
      { short: 'T', full: 'Thu' },
      { short: 'F', full: 'Fri' },
      { short: 'S', full: 'Sat' },
    ];

    return (
      <div className="grid grid-cols-7 gap-px bg-gray-200">
        {dayLabels.map((day, index) => (
          <div key={index} className="bg-gray-50 py-1 md:py-2 text-center text-xs md:text-sm font-medium text-gray-500">
            <span className="md:hidden">{day.short}</span>
            <span className="hidden md:inline">{day.full}</span>
          </div>
        ))}
        {days.map((day) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const items = getItemsForDate(day);
          const itemTypes = getItemTypesForDate(items);
          const isToday = isSameDay(day, parseISO(today));
          const isCurrentMonth = isSameMonth(day, currentMonth);

          return (
            <div
              key={day.toString()}
              className={`min-h-[52px] md:min-h-[100px] bg-white p-0.5 md:p-1 ${
                !isCurrentMonth ? 'bg-gray-50' : ''
              } hover:bg-gray-50 cursor-pointer`}
              onClick={() => onDateSelect?.(dateStr)}
              onDoubleClick={() => onCreateEvent?.(dateStr)}
            >
              <div className="flex flex-col md:flex-row items-center md:items-center gap-0.5 md:gap-1 mb-0.5 md:mb-1">
                <div
                  className={`text-xs md:text-sm font-medium ${
                    isToday
                      ? 'text-white w-5 h-5 md:w-6 md:h-6 rounded-full flex items-center justify-center'
                      : isCurrentMonth
                      ? 'text-gray-900'
                      : 'text-gray-400'
                  }`}
                  style={isToday ? { backgroundColor: '#1aaeae' } : undefined}
                >
                  {format(day, 'd')}
                </div>
                {/* Indicator dots */}
                {itemTypes.length > 0 && (
                  <div className="flex gap-0.5">
                    {itemTypes.slice(0, 3).map((type) => (
                      <div
                        key={type}
                        className="w-1 h-1 md:w-1.5 md:h-1.5 rounded-full"
                        style={{ backgroundColor: typeColors[type] || '#6366f1' }}
                      />
                    ))}
                  </div>
                )}
              </div>
              {/* Event list - hidden on mobile, show on larger screens */}
              <div className="hidden md:block space-y-0.5 overflow-hidden max-h-[70px]">
                {items.slice(0, 3).map((item) => (
                  <div
                    key={item.id}
                    className={`text-xs px-1 py-0.5 rounded truncate cursor-pointer ${
                      selectedEventId === item.id ? 'ring-2 ring-teal-500' : ''
                    }`}
                    style={{ backgroundColor: `${item.color}20`, color: item.color }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (item.type === 'entry') {
                        onEntrySelect?.(item.id);
                      } else {
                        onEventSelect?.(item.id);
                      }
                    }}
                  >
                    {item.type === 'event' && item.startTime && !item.isAllDay && (
                      <span className="font-medium">{item.startTime.slice(0, 5)} </span>
                    )}
                    {item.title}
                  </div>
                ))}
                {items.length > 3 && (
                  <div className="text-xs text-gray-500 px-1">+{items.length - 3} more</div>
                )}
              </div>
              {/* Mobile: show count if there are items */}
              {items.length > 0 && (
                <div className="md:hidden text-center">
                  <span className="text-[10px] text-gray-500">{items.length}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading calendar...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-2 md:p-4 border-b">
        <div className="flex items-center gap-2 md:gap-4">
          <h2 className="text-base md:text-xl font-semibold text-gray-900">
            {format(currentMonth, 'MMM yyyy')}
          </h2>
          <div className="flex gap-0.5 md:gap-1">
            <button
              onClick={() => navigateMonth('prev')}
              className="p-1 hover:bg-gray-100 rounded text-gray-600"
            >
              <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={() => setCurrentMonth(new Date())}
              className="px-2 py-1 text-xs md:text-sm text-gray-600 hover:bg-gray-100 rounded"
            >
              Today
            </button>
            <button
              onClick={() => navigateMonth('next')}
              className="p-1 hover:bg-gray-100 rounded text-gray-600"
            >
              <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="flex-1 overflow-auto">
        {renderMonthView()}
      </div>
    </div>
  );
}
