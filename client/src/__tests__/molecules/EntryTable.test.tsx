import { describe, it, expect } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { formatListDate } from '@/components/molecules/EntryTable';
import { EntryListCard } from '@/components/molecules/EntryListCard';
import { renderWithTheme } from '../testUtils';

describe('formatListDate', () => {
  it('shows an uppercase month, day and full year', () => {
    expect(formatListDate(new Date(2026, 9, 11))).toBe('Oct 11');
  });
});

describe('EntryListCard (spreadsheet row)', () => {
  it('shows the topic, then the title and preview, then the date on the right', () => {
    const createdAt = new Date(2026, 9, 11);
    const { container } = renderWithTheme(
      <EntryListCard content="<p>Buy milk</p>" createdAt={createdAt} topicName="Task" preview="Due Friday" />
    );
    expect(screen.getByText('Oct 11')).toBeInTheDocument();
    const text = container.textContent ?? '';
    expect(text.indexOf('Task')).toBeLessThan(text.indexOf('Buy milk'));
    expect(text.indexOf('Due Friday')).toBeLessThan(text.indexOf('Oct 11'));
    expect(screen.getByText('Buy milk')).toHaveStyle('font-size: 16px');
  });

  it('hovering a row hands the highlight from the first-row hint to hover', () => {
    renderWithTheme(<EntryListCard content="<p>First</p>" createdAt={new Date()} hint />);
    const row = screen.getByText('First').closest('div[class]')!.parentElement!;
    fireEvent.mouseEnter(row);
    expect(document.documentElement.dataset.entryRowHover).toBe('1');
    fireEvent.mouseLeave(row);
    expect(document.documentElement.dataset.entryRowHover).toBeUndefined();
  });

  it('shows completed entries struck through', () => {
    renderWithTheme(<EntryListCard content="<p>Done thing</p>" createdAt={new Date()} completed />);
    expect(screen.getByText('Done thing')).toHaveStyle('text-decoration: line-through');
  });
});
