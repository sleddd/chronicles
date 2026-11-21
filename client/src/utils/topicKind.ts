import { isTimeTrackingTopic } from './timeTracking.js';

/*
 * Which built-in kind of entry a topic holds, by its name: a task, a goal, a
 * meal, a recipe… — each with a form of its own in the editor. null = a text
 * topic (the journal, a plain topic, one with only the person's own fields),
 * which is also what takes custom tags. Pure.
 */

const TOPIC_TO_TYPE: Record<string, string> = {
  task: 'task', goal: 'goal', milestone: 'milestone',
  meals: 'food', medication: 'medication', symptom: 'symptom',
  exercise: 'exercise', event: 'event', events: 'event', meeting: 'meeting',
  allergy: 'allergy', 'shopping list': 'shopping_list',
  recipe: 'recipe', recipes: 'recipe',
  priorities: 'priorities', wins: 'wins', wellness: 'wellness', 'menu plan': 'menu_plan',
  changes: 'change', change: 'change',
  routine: 'routine', routines: 'routine', 'exercise schedule': 'routine', 'exercise routine': 'routine',
  'training plan': 'training_plan', 'training plans': 'training_plan',
  'time tracking': 'time_tracking',
  media: 'media', 'media journal': 'media', 'media library': 'media',
  habit: 'habit', habits: 'habit',
};

export function topicKind(topicName: string | undefined): string | null {
  if (!topicName) return null;
  const name = topicName.trim().toLowerCase();
  // Time tracking under any of its usual names ("Time tracker", "Timesheet", "Time log"…)
  if (isTimeTrackingTopic(name)) return 'time_tracking';
  return TOPIC_TO_TYPE[name] || null;
}
