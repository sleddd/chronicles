import { useMemo } from 'react';
import type { DecryptedPost } from '@shared/crypto/types';
import { useEntriesStore } from '../stores/entriesStore.js';
import { entryTitleText } from '../utils/entryTitle.js';
import { builtinEntryName } from '../utils/stripHtml.js';
import { normalizeRoadmapStatus, normalizeMilestoneRoadmapStatus, type RoadmapStatus } from '../types/goals.js';
import { goalCategoryOf } from '../utils/goalCategories.js';
import { toDateStr } from '../utils/dateUtils.js';

import { topicEntries } from '../utils/topicIndex.js';
/* Goals, milestones and tasks read from the entries store, for the Planning
   views beside the boards (Roadmap, Planner, Habits). A milestone or task
   takes its goal's category. */

export interface PlanItem {
  id: number;
  entry: DecryptedPost;
  title: string;
  fields: Record<string, unknown>;
  /** YYYY-MM-DD the entry was made */
  createdDay: string;
  created: number;
}
export interface PlanGoal extends PlanItem { status: RoadmapStatus; category: string }
export interface PlanMilestone extends PlanItem { status: RoadmapStatus; completed: boolean; goalId: number | null; category: string }
export interface PlanTask extends PlanItem { completed: boolean; goalId: number | null; milestoneId: number | null; category: string }

const fieldsOf = (e: DecryptedPost) => ((e.metadata as Record<string, unknown>)?._customFields as Record<string, unknown>) || {};
const topicOf = (e: DecryptedPost) => (e.metadata as Record<string, unknown>)?._taxonomyId;
const numberOrNull = (v: unknown) => (typeof v === 'number' && v > 0 ? v : null);

function item(e: DecryptedPost, untitled: string): PlanItem {
  const fields = fieldsOf(e);
  const created = e.createdAt instanceof Date ? e.createdAt : new Date(e.createdAt);
  return {
    id: e.id, entry: e, fields,
    title: entryTitleText(e.content) || builtinEntryName(fields) || untitled,
    createdDay: toDateStr(created), created: created.getTime(),
  };
}

export function usePlanData() {
  const allTopics = useEntriesStore(s => s.allTopics);
  const { goalTopicId, milestoneTopicId, taskTopicId } = useMemo(() => {
    const topicId = (name: string) => allTopics.find(t => t.name.toLowerCase() === name)?.id;
    return { goalTopicId: topicId('goal'), milestoneTopicId: topicId('milestone'), taskTopicId: topicId('task') };
  }, [allTopics]);
  // Each topic's own list (utils/topicIndex): it keeps its identity while nothing
  // in that topic changed, so a save elsewhere in the journal redoes nothing here
  const goalRows = useEntriesStore(s => topicEntries(s.decryptedEntries, goalTopicId));
  const milestoneRows = useEntriesStore(s => topicEntries(s.decryptedEntries, milestoneTopicId));
  const taskRows = useEntriesStore(s => topicEntries(s.decryptedEntries, taskTopicId));

  return useMemo(() => {
    const of = (id: number | undefined) => (id === goalTopicId ? goalRows : id === milestoneTopicId ? milestoneRows : taskRows);

    const goals: PlanGoal[] = of(goalTopicId).map(e => {
      const base = item(e, 'Untitled goal');
      return { ...base, status: normalizeRoadmapStatus(base.fields.goalStatus), category: goalCategoryOf(base.fields) };
    });
    const goalCategory = new Map(goals.map(g => [g.id, g.category]));

    const milestones: PlanMilestone[] = of(milestoneTopicId).map(e => {
      const base = item(e, 'Untitled milestone');
      const goalId = numberOrNull(base.fields.parentGoalId);
      const completed = !!base.fields.isCompleted;
      return {
        ...base, goalId, completed,
        status: normalizeMilestoneRoadmapStatus(base.fields.milestoneStatus, completed),
        category: (goalId && goalCategory.get(goalId)) || '',
      };
    });
    const milestoneGoal = new Map(milestones.map(m => [m.id, m.goalId]));

    const tasks: PlanTask[] = of(taskTopicId).map(e => {
      const base = item(e, 'Untitled task');
      const milestoneId = numberOrNull(base.fields.parentMilestoneId);
      const goalId = numberOrNull(base.fields.parentGoalId) ?? (milestoneId ? milestoneGoal.get(milestoneId) ?? null : null);
      return { ...base, goalId, milestoneId, completed: !!base.fields.isCompleted, category: (goalId && goalCategory.get(goalId)) || '' };
    });

    return { goals, milestones, tasks, goalTopicId, milestoneTopicId, taskTopicId };
  }, [goalRows, milestoneRows, taskRows, goalTopicId, milestoneTopicId, taskTopicId]);
}
