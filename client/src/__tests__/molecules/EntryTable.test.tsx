import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { formatRowDate } from '@/components/molecules/EntryTable';
import { EntryListCard } from '@/components/molecules/EntryListCard';
import { renderWithTheme } from '../testUtils';

describe('formatRowDate', () => {
  const now = new Date(2026, 9, 7);

  it('shows month and day for dates this year', () => {
    expect(formatRowDate(new Date(2026, 9, 7), now)).toBe('Oct 7');
    expect(formatRowDate(new Date(2026, 0, 31), now)).toBe('Jan 31');
  });

  it('adds a short year for other years', () => {
    expect(formatRowDate(new Date(2025, 11, 24), now)).toBe("Dec 24 '25");
  });
});

describe('EntryListCard (spreadsheet row)', () => {
  it('stacks the topic over the date, then the title and preview', () => {
    const createdAt = new Date();
    const { container } = renderWithTheme(
      <EntryListCard content="<p>Buy milk</p>" createdAt={createdAt} topicName="Task" preview="Due Friday" />
    );
    const date = formatRowDate(createdAt);
    expect(screen.getByText(date)).toBeInTheDocument();
    const text = container.textContent ?? '';
    expect(text.indexOf('Task')).toBeLessThan(text.indexOf(date));
    expect(text.indexOf(date)).toBeLessThan(text.indexOf('Buy milk'));
    expect(screen.getByText('Task').parentElement).toBe(screen.getByText(date).parentElement);
    expect(screen.getByText('Due Friday')).toBeInTheDocument();
  });

  it('shows completed entries struck through', () => {
    renderWithTheme(<EntryListCard content="<p>Done thing</p>" createdAt={new Date()} completed />);
    expect(screen.getByText('Done thing')).toHaveStyle('text-decoration: line-through');
  });
});
