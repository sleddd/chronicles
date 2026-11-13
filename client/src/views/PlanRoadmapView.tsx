import { useMemo, useState } from 'react';
import styled from 'styled-components';
import { PlanningShell, TodayBtn } from '../components/organisms/PlanningShell.js';
import { PlanTimeline, type TimelineGroup, type TimelineRow } from '../components/organisms/PlanTimeline.js';
import { TopBarAction } from '../components/organisms/TopBarAction.js';
import { PillButton } from '../components/atoms/PillButton.js';
import { EmptyState } from '../components/atoms/EmptyState.js';
import { FilterTabs } from '../components/molecules/FilterTabs.js';
import { FilterPick } from '../components/molecules/FilterPick.js';
import { MonthPill } from '../components/molecules/FinanceParts.js';
import { usePlanData, type PlanGoal, type PlanMilestone } from '../hooks/usePlanData.js';
import { useEncryptedSetting } from '../hooks/useEncryptedSetting.js';
import { useSaveFields } from '../hooks/useSaveFields.js';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import { useOpenInJournal, useNewEntryInJournal } from '../hooks/useOpenInJournal.js';
import { showFlash } from '../services/flashNotice.js';
import { GOAL_COLUMNS, type RoadmapStatus } from '../types/goals.js';
import { toDateStr } from '../utils/dateUtils.js';
import {
  EMPTY_GOAL_CATEGORIES, parseGoalCategories, goalCategoryList, categoriesInUse, sameCategory, groupByCategory, type GoalCategoryConfig,
} from '../utils/goalCategories.js';
import {
  TIMELINE_SCALES, SCALE_STEP, addMonths, barDates, defaultStart, timelineWindow, windowLabel,
  type BarDates, type TimelineScale,
} from '../utils/planTimeline.js';

/* Planning → Roadmap: every goal as a bar from its start date to its target
   date, under its category, opening to its milestones. Drag a bar (or its
   ends) to reschedule; the dates are saved on the entry (`startOn`,
   `targetDate`). The window is a month, a quarter, a year or five years. */

const Tools = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
`;

const Hint = styled.p`
  margin: 20px 0 0;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-muted);
`;

const SCALE_KEY = 'planning-roadmap-scale-v1';
const readScale = (): TimelineScale => {
  try {
    const s = localStorage.getItem(SCALE_KEY);
    return TIMELINE_SCALES.some(o => o.value === s) ? s as TimelineScale : 'year';
  } catch { return 'year'; }
};

export function PlanRoadmapView() {
  const { goals, milestones, tasks, goalTopicId } = usePlanData();
  const saveFields = useSaveFields();
  const openInJournal = useOpenInJournal();
  const newEntry = useNewEntryInJournal();
  const phone = useMediaQuery('(max-width: 768px)');
  const today = toDateStr(new Date());

  const [scale, setScaleState] = useState<TimelineScale>(readScale);
  const [start, setStart] = useState(() => defaultStart(readScale(), today));
  const setScale = (s: TimelineScale) => {
    setScaleState(s);
    setStart(defaultStart(s, today));
    try { localStorage.setItem(SCALE_KEY, s); } catch { /* storage unavailable */ }
  };
  const w = useMemo(() => timelineWindow(scale, start), [scale, start]);

  const [category, setCategory] = useState('');
  const [status, setStatus] = useState<RoadmapStatus | ''>('');
  const [open, setOpen] = useState<Set<number>>(() => new Set());
  const toggle = (id: number) => setOpen(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const [savedCategories] = useEncryptedSetting<GoalCategoryConfig>('goalCategories', EMPTY_GOAL_CATEGORIES);
  const categories = useMemo(
    () => categoriesInUse(goalCategoryList(parseGoalCategories(savedCategories)), goals.map(g => g.category)),
    [savedCategories, goals],
  );

  const groups: TimelineGroup[] = useMemo(() => {
    const byStart = <T extends { fields: Record<string, unknown>; createdDay: string; title: string }>(a: T, b: T) =>
      barDates(a.fields, a.createdDay).start.localeCompare(barDates(b.fields, b.createdDay).start) || a.title.localeCompare(b.title);
    const milestoneRow = (m: PlanMilestone): TimelineRow => {
      const mine = tasks.filter(t => t.milestoneId === m.id);
      const done = mine.filter(t => t.completed).length;
      return {
        id: m.id, title: m.title, dates: barDates(m.fields, m.createdDay), done: m.completed,
        progress: mine.length ? done / mine.length : undefined,
        note: mine.length ? `${done} of ${mine.length}` : undefined,
      };
    };
    const goalRow = (g: PlanGoal): TimelineRow => {
      const mine = milestones.filter(m => m.goalId === g.id).sort(byStart);
      const done = mine.filter(m => m.completed).length;
      return {
        id: g.id, title: g.title, dates: barDates(g.fields, g.createdDay), done: g.status === 'completed',
        progress: mine.length ? done / mine.length : undefined,
        note: mine.length ? `${done} of ${mine.length}` : undefined,
        children: mine.map(milestoneRow),
      };
    };
    const shown = goals
      .filter(g => (!category || sameCategory(g.category, category)) && (!status || g.status === status))
      .sort(byStart);
    const out: TimelineGroup[] = groupByCategory(shown, g => g.category, categories)
      .map(g => ({ key: g.category || 'none', label: g.category || 'No category', rows: g.items.map(goalRow) }));
    // Milestones that belong to no goal get rows of their own (unless a filter is about goals)
    const loose = !category && !status ? milestones.filter(m => !m.goalId || !goals.some(g => g.id === m.goalId)).sort(byStart) : [];
    if (loose.length) out.push({ key: 'loose', label: 'Milestones without a goal', rows: loose.map(milestoneRow) });
    return out;
  }, [goals, milestones, tasks, categories, category, status]);

  const change = (id: number, dates: BarDates) => {
    const item = goals.find(g => g.id === id) ?? milestones.find(m => m.id === id);
    if (!item) return;
    void saveFields(item.entry, { ...item.fields, startOn: dates.start, targetDate: dates.end }).then(ok => {
      if (!ok) showFlash('Couldn’t save those dates, so the bar is back where it was. Try again.');
    });
  };

  const statusLabel = GOAL_COLUMNS.find(c => c.key === status)?.label;
  const step = SCALE_STEP[scale];

  return (
    <PlanningShell wide actions={<>
      <FilterTabs options={TIMELINE_SCALES} active={scale} onChange={setScale} />
      {goalTopicId && (
        <TopBarAction>
          <PillButton type="button" onClick={() => newEntry(goalTopicId, category ? { goalCategory: category } : undefined)}>New Goal</PillButton>
        </TopBarAction>
      )}
    </>}>
      {goals.length === 0 && milestones.length === 0 ? (
        <EmptyState message="Nothing on the roadmap yet." submessage="Add a goal with a target date and it shows here as a bar." />
      ) : (<>
        <Tools role="group" aria-label="Roadmap window and filters">
          <MonthPill label={windowLabel(w)} onPrev={() => setStart(s => addMonths(s, -step))} onNext={() => setStart(s => addMonths(s, step))} />
          <TodayBtn type="button" onClick={() => setStart(defaultStart(scale, today))}>Today</TodayBtn>
          <FilterPick name="Category" value={category || 'All'} set={!!category}>
            <select aria-label="Category" value={category} onChange={e => setCategory(e.target.value)}>
              <option value="">All</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </FilterPick>
          <FilterPick name="Status" value={statusLabel ?? 'All'} set={!!status}>
            <select aria-label="Status" value={status} onChange={e => setStatus(e.target.value as RoadmapStatus | '')}>
              <option value="">All</option>
              {GOAL_COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </FilterPick>
        </Tools>
        {groups.length === 0 ? (
          <EmptyState message="No goals match these filters." />
        ) : (
          <PlanTimeline scale={scale} window={w} today={today} groups={groups} open={open} onToggle={toggle}
            onOpen={openInJournal} onChange={change} onReveal={day => setStart(addMonths(day, 0))} readOnly={phone} />
        )}
        <Hint>
          {phone
            ? 'Tap a bar to open it and change its dates.'
            : 'Drag a bar to move it, or drag an end to change one date. A dashed bar has no target date yet.'}
        </Hint>
      </>)}
    </PlanningShell>
  );
}
