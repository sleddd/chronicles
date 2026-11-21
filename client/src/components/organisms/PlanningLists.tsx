import { Fragment, useMemo, useState } from 'react';
import type { GoalEntry, MilestoneEntryData, TaskEntryData } from '../../types/goals.js';
import { normalizeRoadmapStatus } from '../../types/goals.js';
import { SwipeActions } from '../molecules/SwipeActions.js';
import {
  DayCell, DueCell, MilestoneMark, PlanGroup, PlanOpen, PlanRow, PlanTable, PlanTick, PlannedCell, PriorityCell, ProgressCell,
  PlanMuted, type PlanColumn,
} from '../molecules/PlanTable.js';
import { goalCategoryOf, groupByCategory } from '../../utils/goalCategories.js';
import { dayOrNone, goalPercent } from '../../utils/planTable.js';
import { estimateLabel, estimateOf } from '../../utils/planner.js';
import { taskTypeOf } from '../../utils/taskTypes.js';

/*
 * Planning's list view (Goals, Milestones, Tasks), one table each: grouped
 * under headings — goals by their area, milestones by their goal, tasks by
 * their goal or milestone — with a goal opening to its milestones and a
 * milestone to its tasks. The rows a tab shows (search, filters, sort) come in
 * already chosen; the whole lists are only read for counts and children.
 */

export type GoalGroup = 'category' | 'none';
export type MilestoneGroup = 'goal' | 'category' | 'none';
export type TaskGroup = 'goal' | 'milestone' | 'none';

interface Shared {
  today: string;
  accentColor: string;
  onOpen: (id: number) => void;
  onDelete: (id: number) => void;
  onToggleTask: (id: number, done: boolean) => void;
}

const goalDone = (g: GoalEntry) => normalizeRoadmapStatus(g.goalStatus) === 'completed';
const startOf = (cf: Record<string, unknown>) => dayOrNone(cf.startOn);

/** Which goal a task counts toward: its own, else its milestone's */
function useTaskGoal(milestones: MilestoneEntryData[]) {
  return useMemo(() => {
    const goalOf = new Map(milestones.map(m => [m.id, m.parentGoalId]));
    return (t: TaskEntryData) => t.parentGoalId ?? (t.parentMilestoneId ? goalOf.get(t.parentMilestoneId) ?? null : null);
  }, [milestones]);
}

/** `list` grouped by `keyOf`, in one pass */
function groupBy<T, K>(list: T[], keyOf: (x: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const x of list) {
    const k = keyOf(x);
    const bucket = out.get(k);
    if (bucket) bucket.push(x); else out.set(k, [x]);
  }
  return out;
}
const NONE: never[] = [];

/** `by`'s buckets in `order`, with every key not in it (no owner, or one since deleted) in a last
 *  `null` bucket — so a task whose goal was deleted still shows, under "No goal" */
function orderedBuckets<T>(by: Map<number | null, T[]>, order: number[]): { id: number | null; items: T[] }[] {
  const known = new Set(order);
  const out = order.filter(id => by.has(id)).map(id => ({ id: id as number | null, items: by.get(id)! }));
  const rest: T[] = [];
  for (const [id, items] of by) if (id === null || !known.has(id)) rest.push(...items);
  if (rest.length) out.push({ id: null, items: rest });
  return out;
}

/** Done of total */
const tally = (list: { isCompleted: boolean }[]) => ({ done: list.filter(x => x.isCompleted).length, total: list.length });

/** Which ids are open (goals, milestones) or folded (groups) — kept while the page shows */
function useIdSet<T>() {
  const [set, setSet] = useState<Set<T>>(() => new Set());
  const toggle = (id: T) => setSet(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  return [set, toggle] as const;
}

/* ── Goals ── */

const GOAL_COLUMNS: PlanColumn[] = [
  { label: 'Goal', width: '' }, { label: 'Progress', width: '140px' }, { label: 'Start', width: '120px' },
  { label: 'Deadline', width: '220px' }, { label: 'Tasks', width: '72px', end: true },
];

export function GoalTable({ goals, milestones, tasks, categories, group, ...shared }: Shared & {
  goals: GoalEntry[]; milestones: MilestoneEntryData[]; tasks: TaskEntryData[]; categories: string[]; group: GoalGroup;
}) {
  const { today, onOpen } = shared;
  const goalOfTask = useTaskGoal(milestones);
  const [open, toggleOpen] = useIdSet<number>();
  const [folded, toggleFold] = useIdSet<string>();
  // Built once per change, not filtered again for every row
  const milestonesByGoal = useMemo(() => groupBy(milestones, m => m.parentGoalId), [milestones]);
  const tasksByGoal = useMemo(() => groupBy(tasks, goalOfTask), [tasks, goalOfTask]);
  const tasksByMilestone = useMemo(() => groupBy(tasks, t => t.parentMilestoneId), [tasks]);

  const row = (g: GoalEntry) => {
    const ms = milestonesByGoal.get(g.id) ?? NONE;
    const ts = tasksByGoal.get(g.id) ?? NONE;
    const done = goalDone(g);
    const pct = goalPercent(done, ts.map(t => ({ done: t.isCompleted })), ms.map(m => ({ done: m.isCompleted })));
    const count = tally(ts);
    const isOpen = open.has(g.id);
    return (
      <Fragment key={g.id}>
        <SwipeActions accentColor={shared.accentColor} onDelete={() => shared.onDelete(g.id)}>
          <PlanRow
            lead={<PlanOpen open={isOpen} title={g.title} hidden={ms.length === 0} onToggle={() => toggleOpen(g.id)} />}
            title={g.title} done={done} onOpen={() => onOpen(g.id)}
            cells={[
              <ProgressCell key="p" percent={pct} />,
              <DayCell key="s" day={startOf(g.customFields)} today={today} none="Not set" />,
              <DueCell key="d" day={dayOrNone(g.targetDate)} today={today} done={done} />,
              count.total ? `${count.done} / ${count.total}` : '0',
            ]}
            endCells={[false, false, false, true]}
          />
        </SwipeActions>
        {isOpen && ms.map(m => {
          const mt = tally(tasksByMilestone.get(m.id) ?? NONE);
          const mPct = m.isCompleted ? 100 : mt.total ? Math.round((mt.done / mt.total) * 100) : 0;
          return (
            <PlanRow key={m.id} indent={1} lead={<MilestoneMark done={m.isCompleted} />}
              title={m.title} done={m.isCompleted} onOpen={() => onOpen(m.id)}
              cells={[
                <ProgressCell key="p" percent={mPct} />,
                <DayCell key="s" day={startOf(m.customFields)} today={today} none="Not set" />,
                <DueCell key="d" day={dayOrNone(m.targetDate)} today={today} done={m.isCompleted} />,
                mt.total ? `${mt.done} / ${mt.total}` : '0',
              ]}
              endCells={[false, false, false, true]}
            />
          );
        })}
      </Fragment>
    );
  };

  const groups = group === 'category' ? groupByCategory(goals, g => goalCategoryOf(g.customFields), categories) : [];
  return (
    <PlanTable label="Goals" columns={GOAL_COLUMNS}>
      {group === 'category'
        ? groups.map(gr => {
            const name = gr.category || 'No category';
            return (
              <PlanGroup key={name} title={name} aside={`${gr.items.length} ${gr.items.length === 1 ? 'goal' : 'goals'}`}
                open={!folded.has(name)} onToggle={() => toggleFold(name)}>
                {gr.items.map(row)}
              </PlanGroup>
            );
          })
        : goals.map(row)}
    </PlanTable>
  );
}

/* ── Milestones ── */

const MILESTONE_COLUMNS: PlanColumn[] = [
  { label: 'Milestone', width: '' }, { label: 'Progress', width: '140px' }, { label: 'Start', width: '120px' },
  { label: 'Deadline', width: '220px' }, { label: 'Tasks', width: '72px', end: true },
];

export function MilestoneTable({ milestones, allMilestones = milestones, goals, tasks, categories, group, ...shared }: Shared & {
  /** The milestones the tab shows (search, filters and sort applied) */
  milestones: MilestoneEntryData[];
  /** Every milestone, for a goal group's "16 of 20" */
  allMilestones?: MilestoneEntryData[];
  goals: GoalEntry[]; tasks: TaskEntryData[]; categories: string[]; group: MilestoneGroup;
}) {
  const { today, onOpen, onToggleTask } = shared;
  const [open, toggleOpen] = useIdSet<number>();
  const [folded, toggleFold] = useIdSet<string>();
  const goalById = useMemo(() => new Map(goals.map(g => [g.id, g])), [goals]);
  const tasksByMilestone = useMemo(() => groupBy(tasks, t => t.parentMilestoneId), [tasks]);
  const allByGoal = useMemo(() => groupBy(allMilestones, m => m.parentGoalId), [allMilestones]);

  const row = (m: MilestoneEntryData) => {
    const ts = tasksByMilestone.get(m.id) ?? NONE;
    const count = tally(ts);
    const pct = m.isCompleted ? 100 : count.total ? Math.round((count.done / count.total) * 100) : 0;
    const isOpen = open.has(m.id);
    return (
      <Fragment key={m.id}>
        <SwipeActions accentColor={shared.accentColor} onDelete={() => shared.onDelete(m.id)}>
          <PlanRow
            lead={<><PlanOpen open={isOpen} title={m.title} hidden={ts.length === 0} onToggle={() => toggleOpen(m.id)} /><MilestoneMark done={m.isCompleted} /></>}
            title={m.title} done={m.isCompleted} onOpen={() => onOpen(m.id)}
            note={group !== 'goal' && m.parentGoalId ? goalById.get(m.parentGoalId)?.title : undefined}
            cells={[
              <ProgressCell key="p" percent={pct} />,
              <DayCell key="s" day={startOf(m.customFields)} today={today} none="Not set" />,
              <DueCell key="d" day={dayOrNone(m.targetDate)} today={today} done={m.isCompleted} />,
              count.total ? `${count.done} / ${count.total}` : '0',
            ]}
            endCells={[false, false, false, true]}
          />
        </SwipeActions>
        {isOpen && ts.map(t => (
          <PlanRow key={t.id} indent={1} lead={<PlanTick done={t.isCompleted} title={t.title} onToggle={() => onToggleTask(t.id, !t.isCompleted)} />}
            title={t.title} done={t.isCompleted} onOpen={() => onOpen(t.id)}
            cells={[
              <PriorityCell key="p" priority={t.priority} />,
              <PlannedCell key="s" day={dayOrNone(t.customFields.scheduledDate)} today={today} done={t.isCompleted} />,
              <DueCell key="d" day={dayOrNone(t.customFields.deadline)} today={today} done={t.isCompleted} />,
              '',
            ]}
            endCells={[false, false, false, true]}
          />
        ))}
      </Fragment>
    );
  };

  // By goal: in the goals' own order, "No goal" last (with any whose goal was deleted). By area: the goal's area
  const goalGroups = () =>
    orderedBuckets(groupBy(milestones, m => m.parentGoalId), goals.map(g => g.id)).map(({ id, items }) => {
      const g = id === null ? undefined : goalById.get(id);
      return {
        key: String(id), title: g?.title ?? 'No goal',
        aside: g ? goalCategoryOf(g.customFields) || undefined : `${items.length} ${items.length === 1 ? 'milestone' : 'milestones'}`,
        progress: g ? tally(allByGoal.get(g.id) ?? NONE) : undefined, items,
      };
    });
  const categoryGroups = () => groupByCategory(milestones, m => (m.parentGoalId ? goalCategoryOf(goalById.get(m.parentGoalId)?.customFields) : ''), categories)
    .map(gr => ({ key: gr.category, title: gr.category || 'No category', aside: `${gr.items.length} ${gr.items.length === 1 ? 'milestone' : 'milestones'}`, progress: undefined, items: gr.items }));

  const groups = group === 'goal' ? goalGroups() : group === 'category' ? categoryGroups() : [];
  return (
    <PlanTable label="Milestones" columns={MILESTONE_COLUMNS}>
      {group === 'none'
        ? milestones.map(row)
        : groups.map(gr => (
            <PlanGroup key={gr.key} title={gr.title} aside={gr.aside} progress={gr.progress} open={!folded.has(gr.key)} onToggle={() => toggleFold(gr.key)}>
              {gr.items.map(row)}
            </PlanGroup>
          ))}
    </PlanTable>
  );
}

/* ── Tasks ── */

const TASK_COLUMNS: PlanColumn[] = [
  { label: 'Task', width: '' }, { label: 'Priority', width: '130px' }, { label: 'Planned', width: '150px' },
  { label: 'Deadline', width: '220px' }, { label: 'Estimate', width: '90px', end: true },
];

export function TaskTable({ tasks, allTasks, goals, milestones, group, titleOf, ...shared }: Shared & {
  /** The tasks the tab shows (search, filters and sort applied) */
  tasks: TaskEntryData[];
  /** Every task, for a group's "16 of 20" */
  allTasks: TaskEntryData[];
  goals: GoalEntry[]; milestones: MilestoneEntryData[]; group: TaskGroup;
  titleOf: (t: TaskEntryData) => string;
}) {
  const { today, onOpen, onToggleTask } = shared;
  const goalOfTask = useTaskGoal(milestones);
  const [folded, toggleFold] = useIdSet<string>();
  const milestoneById = useMemo(() => new Map(milestones.map(m => [m.id, m])), [milestones]);
  const goalById = useMemo(() => new Map(goals.map(g => [g.id, g])), [goals]);

  const row = (t: TaskEntryData) => {
    const title = titleOf(t);
    const estimate = estimateOf(t.customFields);
    // What it's part of, unless the group already says so; else its type
    const note = (group !== 'milestone' && t.parentMilestoneId ? milestoneById.get(t.parentMilestoneId)?.title : undefined)
      ?? (group === 'none' && t.parentGoalId ? goalById.get(t.parentGoalId)?.title : undefined)
      ?? (taskTypeOf(t.customFields) || undefined);
    return (
      <SwipeActions key={t.id} accentColor={shared.accentColor} onDelete={() => shared.onDelete(t.id)}>
        <PlanRow lead={<PlanTick done={t.isCompleted} title={title} onToggle={() => onToggleTask(t.id, !t.isCompleted)} />}
          title={title} note={note} done={t.isCompleted} onOpen={() => onOpen(t.id)}
          cells={[
            <PriorityCell key="p" priority={t.priority} />,
            <PlannedCell key="s" day={dayOrNone(t.customFields.scheduledDate)} today={today} done={t.isCompleted} />,
            <DueCell key="d" day={dayOrNone(t.customFields.deadline)} today={today} done={t.isCompleted} />,
            estimate ? estimateLabel(estimate) : <PlanMuted key="e">None</PlanMuted>,
          ]}
          endCells={[false, false, false, true]}
        />
      </SwipeActions>
    );
  };

  const groups = useMemo(() => {
    if (group === 'none') return [];
    const keyOf = (t: TaskEntryData) => (group === 'goal' ? goalOfTask(t) : t.parentMilestoneId);
    const allBy = groupBy(allTasks, keyOf);
    const order = group === 'goal' ? goals.map(g => g.id) : milestones.map(m => m.id);
    // A task whose goal or milestone was deleted goes under "No goal" / "No milestone"
    return orderedBuckets(groupBy(tasks, keyOf), order).map(({ id, items }) => {
      if (id === null) {
        return { key: 'none', title: group === 'goal' ? 'No goal' : 'No milestone', aside: `${items.length} ${items.length === 1 ? 'task' : 'tasks'}`, progress: undefined, items };
      }
      let title: string | undefined;
      let aside: string | undefined;
      if (group === 'goal') {
        const g = goalById.get(id);
        title = g?.title;
        aside = goalCategoryOf(g?.customFields) || undefined;
      } else {
        const m = milestoneById.get(id);
        title = m?.title;
        aside = m?.parentGoalId ? goalById.get(m.parentGoalId)?.title : undefined;
      }
      return { key: String(id), title: title ?? 'Untitled', aside, progress: tally(allBy.get(id) ?? NONE), items };
    });
  }, [group, tasks, allTasks, goals, milestones, goalOfTask, goalById, milestoneById]);

  return (
    <PlanTable label="Tasks" columns={TASK_COLUMNS}>
      {group === 'none'
        ? tasks.map(row)
        : groups.map(gr => (
            <PlanGroup key={gr.key} title={gr.title} aside={gr.aside} progress={gr.progress} open={!folded.has(gr.key)} onToggle={() => toggleFold(gr.key)}>
              {gr.items.map(row)}
            </PlanGroup>
          ))}
    </PlanTable>
  );
}
