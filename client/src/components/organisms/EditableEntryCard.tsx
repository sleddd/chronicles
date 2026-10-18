import styled from 'styled-components';
import { SwipeActions } from '../molecules/SwipeActions.js';
import { useUIStore } from '../../stores/uiStore.js';
import { useOpenInJournal } from '../../hooks/useOpenInJournal.js';
import { deleteEntryWithImages } from '../../utils/entryActions.js';
import { stripHtml, summarizeUserFields, builtinEntryName } from '../../utils/stripHtml.js';
import type { DecryptedPost } from '@shared/crypto/types';
import type { Topic } from '../../types/topics.js';

/*
 * Swipeable entry row for topic list views (Entertainment, Inspiration, …).
 * Entries are no longer edited inline: clicking a row — or swipe-revealing
 * the edit action — opens the entry in the journal editor, whose breadcrumb
 * leads back to the origin view. Swipe also reveals delete.
 */

/* ── Helpers ── */

const TOPIC_TO_TYPE: Record<string, string> = {
  task: 'task', goal: 'goal', milestone: 'milestone',
  meals: 'food', medication: 'medication', symptom: 'symptom',
  exercise: 'exercise', event: 'event', meeting: 'meeting',
  wellness: 'wellness', allergy: 'allergy', 'shopping list': 'shopping_list',
  'menu plan': 'menu_plan',
};

function getCustomType(topicName: string | undefined): string | null {
  if (!topicName) return null;
  return TOPIC_TO_TYPE[topicName.toLowerCase()] || null;
}

/* ── Styled ── */

const Card = styled.div<{ $accentColor?: string; $flat?: boolean; $flush?: boolean }>`
  background: transparent;
  border: ${({ $flush }) => $flush ? 'none' : '1px solid var(--rule, #d5d0c5)'};
  border-left: ${({ $flush, $accentColor }) => $flush ? 'none' : `3px solid ${$accentColor || 'var(--accent)'}`};
  ${({ $flush }) => $flush && 'border-top: 1px solid var(--border-subtle);'}
  border-radius: 0;
  margin: ${({ $flat, $flush }) => $flush ? '0' : ($flat ? '0 0 8px 0' : '6px var(--s-4, 16px)')};
  min-width: 0;
  ${({ $flat, $flush }) => !$flat && !$flush && `&:first-child { margin-top: 12px; }`}
`;

const Row = styled.div<{ $noDate?: boolean; $flush?: boolean; $rightDate?: boolean }>`
  padding: ${({ $flush }) => $flush ? '16px 4px' : '14px var(--s-4, 16px)'};
  cursor: pointer;
  display: grid;
  grid-template-columns: ${({ $noDate, $rightDate }) => $rightDate ? '1fr auto' : ($noDate ? '1fr' : '44px 1fr')};
  gap: 10px;
  align-items: center;
  background: transparent;
  border: none;
  width: 100%;
  text-align: left;
  min-height: 60px;
  border-radius: var(--r-sm, 2px);
  @media (max-width: 768px) { padding: ${({ $flush }) => $flush ? '14px 4px' : '12px 16px'}; }
  @media (max-width: 480px) { gap: 8px; min-height: 52px; }
`;

const RightDate = styled.div`
  grid-column: 2;
  align-self: center;
  font-family: var(--font-label);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  white-space: nowrap;
`;

const DateCol = styled.div`
  font-family: var(--mono, 'JetBrains Mono', monospace);
  font-size: 10px;
  color: var(--ink-4, #8a857c);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-align: right;
  line-height: 1.3;
  padding-right: 7px;
`;

const DayNum = styled.span`
  font-family: var(--serif, 'Playfair Display', Georgia, serif);
  font-style: normal;
  font-size: 26px;
  color: var(--ink, #2b2824);
  letter-spacing: 0;
  display: block;
  line-height: 1;
  margin-bottom: 7px;
  padding-bottom: 5px;
`;

const ContentArea = styled.div`
  min-width: 0;
`;

const TitleText = styled.div<{ $done?: boolean }>`
  font-family: var(--sans, 'Lato', sans-serif);
  font-style: normal;
  font-size: 15px;
  color: ${({ $done }) => $done ? 'var(--ink-4, #8a857c)' : 'var(--ink, #2b2824)'};
  line-height: 1.4;
  text-decoration: ${({ $done }) => $done ? 'line-through' : 'none'};
  margin-bottom: 3px;
  transition: color 120ms ease;

  /* Hover: the title picks up the accent — no full-row highlight. */
  ${Row}:hover & { color: var(--color-accent); }
`;

const PreviewText = styled.div`
  font-family: var(--sans, 'Lato', sans-serif);
  font-size: 12.5px;
  color: var(--ink-3, #6b645a);
  line-height: 1.45;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  margin-bottom: 3px;
`;

const FooterMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-family: var(--mono, 'JetBrains Mono', monospace);
  font-size: 9.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-4, #8a857c);
  flex-wrap: wrap;
`;

const TopicDot = styled.span`
  width: 6px;
  height: 6px;
  border-radius: 1px;
  background: var(--ink, ${({ theme }) => theme.colors.text});
  flex-shrink: 0;
  display: inline-block;
`;

/* ── Component ── */

interface EditableEntryCardProps {
  entry: DecryptedPost;
  topic?: Topic;
  accentColor: string;
  /** Called after a successful swipe-delete (list housekeeping). */
  onDeleted?: () => void;
  metaFields?: { key: string; label: string }[];
  onStatusClick?: (status: string) => void;
  showAsPlain?: boolean;
  hideDate?: boolean;
  hideTopic?: boolean;
  /** Flat list style: no card border/accent-bar/side-margin, hairline top divider. */
  flush?: boolean;
}

export function EditableEntryCard({ entry, topic, accentColor, onDeleted, metaFields = [], onStatusClick, showAsPlain, hideDate, hideTopic, flush }: EditableEntryCardProps) {
  const topicCustomFields = useUIStore(s => s.topicCustomFields);
  const openInJournal = useOpenInJournal();

  const meta = entry.metadata as Record<string, unknown>;
  const cf = (meta?._customFields as Record<string, unknown>) || {};
  const taxonomyId = (meta?._taxonomyId as number) || 0;
  const customType = getCustomType(topic?.name);
  const textContent = stripHtml(entry.content).trim();
  const preview = (() => {
    if (textContent) return textContent.slice(0, 120);
    // Built-in name/description field (Event name, Task description, …)
    const builtinName = builtinEntryName(cf);
    if (builtinName) return builtinName;
    // Shopping list preview
    if (customType === 'shopping_list' && Array.isArray(cf.items) && cf.items.length > 0) {
      const items = cf.items as { name: string; checked: boolean }[];
      const checked = items.filter(i => i.checked).length;
      const names = items.slice(0, 3).map(i => i.name).filter(Boolean).join(', ');
      return `${checked}/${items.length} items${names ? ` · ${names}${items.length > 3 ? '…' : ''}` : ''}`;
    }
    // Menu plan preview
    if (customType === 'menu_plan' && cf.days && typeof cf.days === 'object') {
      const days = cf.days as Record<string, { breakfast?: { mealName?: string }; lunch?: { mealName?: string }; dinner?: { mealName?: string }; snack?: { mealName?: string } }>;
      const meals: string[] = [];
      Object.values(days).forEach(day => {
        ['breakfast', 'lunch', 'dinner', 'snack'].forEach(slot => {
          const name = (day as Record<string, { mealName?: string }>)[slot]?.mealName;
          if (name && !meals.includes(name)) meals.push(name);
        });
      });
      if (meals.length > 0) {
        return `${meals.length} meals · ${meals.slice(0, 3).join(', ')}${meals.length > 3 ? '…' : ''}`;
      }
      return 'Empty menu plan';
    }
    const userFields = (cf._userFields as Record<string, unknown>) ?? {};
    const fieldDefs = taxonomyId ? (topicCustomFields[taxonomyId] ?? []) : [];
    const fieldSummary = summarizeUserFields(fieldDefs, userFields);
    if (fieldSummary) return fieldSummary;
    return 'Empty entry';
  })();
  const d = new Date(entry.createdAt);
  const dayNum = d.getDate();
  const monthCode = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  const rightDateStr = (() => {
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString('en-US', opts);
  })();
  /* In flush list mode, show the date on the right instead of the left column. */
  const showRightDate = !!flush;

  const taskState = cf.isCompleted ? 'done' : cf.isInProgress ? 'progress' : 'none';

  const handleOpen = () => openInJournal(entry.id);

  const handleDelete = async () => {
    try {
      await deleteEntryWithImages(entry.id);
      onDeleted?.();
    } catch (err) {
      console.error('Entry delete failed:', err);
    }
  };

  // Meta values for preview
  const metaValues = metaFields
    .map(f => {
      const v = cf[f.key];
      if (v == null || v === false) return null;
      const formatted = typeof v === 'boolean' ? 'Yes' : String(v).replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
      return { label: f.label, value: formatted };
    })
    .filter((m): m is { label: string; value: string } => m != null);

  return (
    <Card $accentColor={accentColor} $flat={hideDate} $flush={flush}>
      <SwipeActions onDelete={handleDelete} accentColor={accentColor}>
      <Row role="button" tabIndex={0} onClick={handleOpen} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpen(); } }} $noDate={hideDate} $flush={flush} $rightDate={showRightDate}>
        {!hideDate && !showRightDate && (
          <DateCol>
            <DayNum>{dayNum}</DayNum>
            {monthCode}<br />{timeStr}
          </DateCol>
        )}
        <ContentArea>
          <TitleText $done={taskState === 'done'}>{preview}</TitleText>
          {metaValues.length > 0 && (
            <PreviewText>{metaValues.map(m => `${m.label}: ${m.value}`).join(' · ')}</PreviewText>
          )}
          <FooterMeta>
            {topic && !hideTopic && customType !== 'task' && customType !== 'medication' && customType !== 'food' && customType !== 'symptom' && customType !== 'exercise' && customType !== 'allergy' && (
              <>
                <TopicDot />
                <span>{topic.name}</span>
              </>
            )}
            {(customType === 'goal' || customType === 'milestone') && !showAsPlain && (
              <>
                {topic && <span>·</span>}
                <span
                  style={{ cursor: onStatusClick ? 'pointer' : 'default' }}
                  onClick={onStatusClick ? (e) => {
                    e.stopPropagation();
                    const s = cf.isCompleted || cf.goalStatus === 'completed' ? 'completed' :
                      cf.isInProgress || cf.milestoneStatus === 'in_progress' ? 'in_progress' : 'not_started';
                    onStatusClick(s);
                  } : undefined}
                >
                  {cf.isCompleted || cf.goalStatus === 'completed' ? 'Completed' :
                   cf.isInProgress || cf.milestoneStatus === 'in_progress' ? 'In Progress' :
                   'Not Started'}
                </span>
              </>
            )}
            {!!(cf.deadline || cf.targetDate) && (
              <>
                <span>·</span>
                <span style={{ color: new Date((cf.deadline || cf.targetDate) as string + 'T00:00:00') < new Date() ? 'var(--danger)' : undefined }}>
                  {(() => { const dt = new Date(((cf.deadline || cf.targetDate) as string) + 'T00:00:00'); return `${dt.getMonth() + 1}/${dt.getDate()}/${dt.getFullYear()}`; })()}
                </span>
              </>
            )}
          </FooterMeta>
        </ContentArea>
        {showRightDate && <RightDate>{rightDateStr}</RightDate>}
      </Row>
      </SwipeActions>
    </Card>
  );
}
