import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlanTable, PlanRow, stackWidth, type PlanColumn } from '../../components/molecules/PlanTable.js';

const COLUMNS: PlanColumn[] = [
  { label: 'Task', width: '' }, { label: 'Priority', width: '130px' }, { label: 'Planned', width: '150px' },
  { label: 'Deadline', width: '220px' }, { label: 'Estimate', width: '90px', end: true },
];

describe('PlanTable', () => {
  it('stacks below the width its columns need plus room for the title', () => {
    // 590px of columns, four 24px gaps, 320px for the title
    expect(stackWidth(COLUMNS)).toBe(590 + 96 + 320);
    // A column that isn't a fixed width counts as 120px
    expect(stackWidth([{ label: 'A', width: '' }, { label: 'B', width: 'minmax(0, 1fr)' }])).toBe(120 + 24 + 320);
  });

  it('marks rows, titles and cells for the stacked layout, the title whole', () => {
    render(
      <PlanTable label="Tasks" columns={COLUMNS}>
        <PlanRow title="A long task title that must never be cut off" onOpen={() => {}} cells={['High', 'Today', '', '1 h']} indent={1} />
      </PlanTable>,
    );
    const row = screen.getAllByRole('row')[1];
    expect(row).toHaveAttribute('data-plan-row');
    expect(row.style.getPropertyValue('--plan-indent')).toBe('1');
    expect(screen.getByRole('button', { name: 'A long task title that must never be cut off' })).toHaveAttribute('data-plan-title');
    expect(row.querySelectorAll('[data-plan-cell]')).toHaveLength(4);
    expect(screen.getAllByRole('row')[0]).toHaveAttribute('data-plan-head');
  });
});
