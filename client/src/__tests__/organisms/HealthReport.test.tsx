import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '@shared/theme/tokens';
import { HealthReport } from '@/components/organisms/HealthReport';
import { addDays, dayList, symptomDays, type ReportScope } from '@/utils/healthReport';
import { inventoryDays } from '@/utils/dailyInventory';
import type { TriggerEvent } from '@/utils/foodSymptoms';

const TODAY = '2026-10-25';
const FROM = addDays(TODAY, -19);
const DAYS = dayList(FROM, TODAY);

function scope(empty = false): ReportScope {
  if (empty) return { today: TODAY, range: { from: FROM, to: TODAY }, inventory: [], symptoms: new Map() };
  const wellness = DAYS.map((date, i) => ({ date, moodScore: i % 2 ? 2 : 4, sleepHours: i % 2 ? 5 : 8, social: 3, waterGlasses: 6 }));
  const symptoms = [
    ...DAYS.filter((_, i) => i % 2 === 1).map(d => ({ name: 'Headache', severity: 6, occurredAt: `${d}T09:00:00` })),
    ...DAYS.filter((_, i) => i % 4 === 0).map(d => ({ name: 'Bloating', severity: 3, occurredAt: `${d}T20:00:00` })),
  ];
  return { today: TODAY, range: { from: FROM, to: TODAY }, inventory: inventoryDays(wellness, [], [], { from: FROM, to: TODAY }), symptoms: symptomDays(symptoms) };
}

const latte: TriggerEvent[] = DAYS.filter((_, i) => i % 4 === 0).map(day => ({ key: 'f:latte', name: 'Latte', kind: 'food', at: Date.parse(`${day}T08:00:00`), day }));

function renderReport(props: Partial<Parameters<typeof HealthReport>[0]> = {}) {
  return render(
    <ThemeProvider theme={lightTheme}>
      <HealthReport scope={scope()} rangeLabel="Last 30 days" events={latte} sessions={[]} doses={[]} {...props} />
    </ThemeProvider>,
  );
}

describe('HealthReport', () => {
  it('says nothing is logged yet when the period is empty', () => {
    renderReport({ scope: scope(true) });
    expect(screen.getByText(/Nothing logged in this period yet/)).toBeInTheDocument();
  });

  it('shows the tiles, the chart and the question table without a comparison column', () => {
    renderReport();
    expect(screen.queryByText('Daily inventory')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sleep/ })).toBeInTheDocument();
    expect(screen.getByText('Mood over time')).toBeInTheDocument();
    expect(screen.getByText('How many hours did you sleep?')).toBeInTheDocument();
    expect(screen.queryByText('Your mood')).not.toBeInTheDocument();
  });

  it('switches the chart when a tile is picked', () => {
    renderReport();
    fireEvent.click(screen.getByRole('button', { name: /^Sleep/ }));
    expect(screen.getByText('Sleep over time')).toBeInTheDocument();
  });

  it('adds the comparison column and a symptom tile when a symptom is picked, and clears it', () => {
    renderReport();
    const group = screen.getByRole('group', { name: 'Compare with' });
    fireEvent.click(within(group).getByRole('button', { name: 'Headache' }));
    expect(screen.getByText('Days with headache')).toBeInTheDocument();
    expect(screen.getByText(/These are links, not causes/)).toBeInTheDocument();
    fireEvent.click(within(group).getByRole('button', { name: '× Clear' }));
    expect(screen.queryByText('Days with headache')).not.toBeInTheDocument();
  });

  it('lists a possible trigger and saves a verdict', () => {
    const onReviewTrigger = vi.fn();
    renderReport({ onReviewTrigger });
    const panel = screen.getByRole('region', { name: 'Possible food triggers' });
    expect(within(panel).getByText('Latte')).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: 'Trigger' }));
    expect(onReviewTrigger).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'Latte', symptom: 'Bloating' }), 'confirmed');
  });

  it('shows a saved verdict with Undo', () => {
    const onReviewTrigger = vi.fn();
    renderReport({
      onReviewTrigger,
      triggerReviews: { 'food|latte|bloating': { verdict: 'dismissed', at: TODAY, kind: 'food', trigger: 'Latte', symptom: 'Bloating' } },
    });
    expect(screen.getByText('Not a trigger · Oct 25')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onReviewTrigger).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'Latte' }), null);
  });

  it('keeps earlier verdicts in view when they are not seen in this period', () => {
    const onReviewTrigger = vi.fn();
    renderReport({
      onReviewTrigger,
      triggerReviews: {
        'food|shellfish|hives': { verdict: 'confirmed', at: '2026-08-02', kind: 'food', trigger: 'Shellfish', symptom: 'Hives' },
        'food|peanuts|cough': { verdict: 'dismissed', at: '2026-07-01', kind: 'food', trigger: 'Peanuts', symptom: 'Cough' },
      },
    });
    const panel = screen.getByRole('region', { name: 'Possible food triggers' });
    expect(within(panel).getByText('Shellfish')).toBeInTheDocument();
    expect(within(panel).getByText('Marked as trigger · Aug 2')).toBeInTheDocument();
    expect(within(panel).queryByText('Peanuts')).not.toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: 'Show 1 earlier marked not a trigger' }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Restore' }));
    expect(onReviewTrigger).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'Peanuts' }), null);
  });

  it('draws Symptoms at a glance', () => {
    renderReport();
    const panel = screen.getByRole('region', { name: 'Symptoms at a glance' });
    expect(within(panel).getByText('2 symptoms logged. Each square is a day. Symptoms that line up in the same column happened together.')).toBeInTheDocument();
    expect(within(panel).getByLabelText('Headache, 10 days')).toBeInTheDocument();
  });
});
