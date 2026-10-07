import styled from 'styled-components';
import { Icon } from '../../../../design-system/components/core/Icon.jsx';
import { stripHtml } from '../../utils/stripHtml.js';

interface EntryListCardProps {
  content: string;
  createdAt: Date;
  topicName?: string;
  topicColor?: string;
  completed?: boolean;
  onClick?: () => void;
  /** Title shown when the content has no text (e.g. built-in name field). */
  fallbackTitle?: string;
  /** Muted single line under the title (e.g. custom-field summary). */
  preview?: string;
}

/* Mobile-style list row: big day number + weekday on the left, a colored topic
   dot + uppercase topic label, the title, a preview line, and a right chevron.
   Hairline divider between rows. Used by Tasks, Todos, and Topics lists. */

function extractTitle(html: string, fallback?: string): string {
  const headingMatch = html.match(/<h[1-4][^>]*>(.*?)<\/h[1-4]>/i);
  if (headingMatch) {
    const tmp = document.createElement('div');
    tmp.innerHTML = headingMatch[1];
    const text = (tmp.textContent || tmp.innerText || '').trim();
    if (text) return text;
  }
  return stripHtml(html).trim().slice(0, 70) || fallback || 'Untitled';
}

const Row = styled.div`
  display: grid;
  grid-template-columns: 52px 1fr auto;
  gap: 18px;
  align-items: center;
  padding: 18px 4px;
  cursor: pointer;
  border-bottom: 1px solid var(--border-subtle);
`;

const DateCol = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  line-height: 1;
`;

const DayNum = styled.span`
  font-family: var(--font-display);
  font-size: 30px;
  font-weight: 200;
  color: var(--text-primary);
  line-height: 1;
  letter-spacing: -0.01em;
`;

const MonthLabel = styled.span`
  font-family: var(--font-label);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  margin-top: 6px;
`;

const ContentArea = styled.div`
  min-width: 0;
`;

const TopicRow = styled.div`
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 5px;
`;

const TopicLabel = styled.span`
  font-family: var(--font-label);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-tertiary);
`;

const Title = styled.div<{ $completed?: boolean }>`
  font-family: var(--font-sans);
  font-size: 17px;
  font-weight: 400;
  color: ${({ $completed }) => $completed ? 'var(--text-tertiary)' : 'var(--text-primary)'};
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-decoration: ${({ $completed }) => $completed ? 'line-through' : 'none'};
  transition: color 120ms ease;

  /* Hover: the title picks up the accent — no full-row highlight. */
  ${Row}:hover & { color: var(--color-accent); }
`;

const Chevron = styled.span`
  display: flex;
  align-items: center;
  color: var(--text-tertiary);
  flex-shrink: 0;
`;

const Preview = styled.div`
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.4;
  color: var(--text-tertiary);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export function EntryListCard({ content, createdAt, topicName, completed, onClick, fallbackTitle, preview }: EntryListCardProps) {
  const dayNum = createdAt.getDate();
  const month = createdAt.toLocaleDateString('en-US', { month: 'short' });
  const title = extractTitle(content, fallbackTitle);

  return (
    <Row onClick={onClick}>
      <DateCol>
        <DayNum>{dayNum}</DayNum>
        <MonthLabel>{month}</MonthLabel>
      </DateCol>
      <ContentArea>
        {topicName && (
          <TopicRow>
            <TopicLabel>{topicName}</TopicLabel>
          </TopicRow>
        )}
        <Title $completed={completed}>{title}</Title>
        {preview && <Preview>{preview}</Preview>}
      </ContentArea>
      <Chevron>
        <Icon name="chevron-right" size={20} strokeWidth={2} />
      </Chevron>
    </Row>
  );
}
