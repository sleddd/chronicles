import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithTheme } from '../testUtils';

const yoga = {
  id: 1, name: 'Morning yoga', exerciseType: 'yoga', minutes: 20, days: [], times: ['07:00'], trainingCategory: '', active: true,
  items: [{ id: 'a', name: 'Sun salutations', amount: '5 min' }, { id: 'b', name: 'Pigeon pose', amount: '5 min' }],
};
const walk = { ...yoga, id: 2, name: 'Evening walk', items: [{ id: 'c', name: 'Walk', amount: '30 min' }] };

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
const openInJournal = vi.fn();
vi.mock('@/hooks/useOpenInJournal', () => ({ useOpenInJournal: () => openInJournal }));
vi.mock('@/hooks/useRoutineChecklist', () => ({
  useRoutineChecklist: () => ({
    slots: [{ routine: yoga, time: '07:00', key: 'y' }, { routine: yoga, time: '19:00', key: 'y2' }, { routine: walk, time: '18:30', key: 'w' }],
  }),
}));

import { RoutineBreakdown } from '@/components/organisms/TodayLists';

describe('RoutineBreakdown', () => {
  it('gives each routine with several exercises one card listing them, no ticks', () => {
    renderWithTheme(<RoutineBreakdown panel />);
    expect(screen.getByRole('region', { name: 'Morning yoga' })).toBeInTheDocument();
    expect(screen.getAllByText('Morning yoga')).toHaveLength(1); // once, though scheduled twice, and no time
    expect(screen.getByText('Pigeon pose')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Evening walk' })).not.toBeInTheDocument(); // only one exercise
  });

  it('opens the routine (to edit its times) from the card title', () => {
    renderWithTheme(<RoutineBreakdown panel />);
    fireEvent.click(screen.getByRole('button', { name: 'Morning yoga' }));
    expect(openInJournal).toHaveBeenCalledWith(1);
  });
});
