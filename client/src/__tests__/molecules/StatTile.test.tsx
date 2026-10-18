import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { StatTile } from '@/components/molecules/StatTile';
import { TrendChart, ChartLegend } from '@/components/molecules/charts/TrendChart';
import { renderWithTheme } from '../testUtils';

describe('StatTile', () => {
  it('is a pressed button when selectable and selected', () => {
    const onSelect = vi.fn();
    renderWithTheme(<StatTile value="7.2" unit="h" name="Sleep" selected onSelect={onSelect} />);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(btn);
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('is not a button without onSelect', () => {
    renderWithTheme(<StatTile value="6" name="Water" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Water')).toBeInTheDocument();
  });
});

describe('TrendChart', () => {
  it('breaks the main line at gaps and legends the ghost series', () => {
    const { container } = renderWithTheme(
      <TrendChart
        ariaLabel="Sleep by day"
        labels={['A', 'B', 'C', 'D']}
        yMax={10}
        series={[
          { label: 'Sleep', values: [6, 7, null, 8], color: 'red' },
          { label: '7-day average', values: [6, 6.5, 6.5, 7], ghost: true },
        ]}
      />,
    );
    const main = [...container.querySelectorAll('path')].find(p => p.getAttribute('stroke') === 'red')!;
    expect(main.getAttribute('d')!.match(/M/g)).toHaveLength(2);
    expect(screen.getByRole('img', { name: 'Sleep by day' })).toBeInTheDocument();
    // The ghost series is dashed; its legend lives in ChartLegend
    expect(container.querySelector('path[stroke-dasharray]')).not.toBeNull();
    renderWithTheme(<ChartLegend series={[{ label: 'Daily', values: [] }, { label: '7-day average', values: [], ghost: true }]} />);
    expect(screen.getByText('7-day average')).toBeInTheDocument();
  });
});
