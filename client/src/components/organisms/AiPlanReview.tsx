import { useMemo, useRef, useState, type ReactNode } from 'react';
import styled from 'styled-components';
import { Modal } from '../atoms/Modal.js';
import { PillButton } from '../atoms/PillButton.js';
import { Spinner } from '../atoms/Spinner.js';
import { Checkbox } from '../atoms/core/Checkbox.jsx';
import { AiSharePrompt } from '../molecules/AiSharePrompt.js';
import { usePlanData } from '../../hooks/usePlanData.js';
import { useEncryptedSetting } from '../../hooks/useEncryptedSetting.js';
import { useSaveFields } from '../../hooks/useSaveFields.js';
import { useCreateEntry } from '../../hooks/useCreateEntry.js';
import { useEntriesStore } from '../../stores/entriesStore.js';
import { aiFeatureJson, aiProviderName } from '../../services/aiAssistant.js';
import { showFlash } from '../../services/flashNotice.js';
import { toDateStr, formatTime12h } from '../../utils/dateUtils.js';
import { eventOccurrences } from '../../utils/plannerEvents.js';
import { entryTitleText } from '../../utils/entryTitle.js';
import { builtinEntryName } from '../../utils/stripHtml.js';
import { EMPTY_GOAL_CATEGORIES, areaInfo, goalCategoryList, parseGoalCategories, type GoalCategoryConfig } from '../../utils/goalCategories.js';
import { addDays, dayLabel, dayPatch, estimateOf, hhmm, hoursLabel, lengthPatch, plannerFacts, startPatch, unscheduled } from '../../utils/planner.js';
import { taskFieldsForStatus } from '../../types/goals.js';
import { taskTypeList, taskTypeOf } from '../../utils/taskTypes.js';
import { repeatRuleOf } from '../../utils/recurrence.js';
import { NAME_FIELD_BY_TYPE, contentRenamed } from '../../utils/nameFields.js';
import { inPlanOrder } from '../../utils/planningView.js';
import {
  PLAN_DAYS, buildPlanRequest, parsePlan, planSize,
  type AiPlan, type EventChange, type GoalChange, type MilestoneChange, type ScheduledChange, type TaskChange,
} from '../../utils/aiPlan.js';

/*
 * AI task planning (Planning → Planner, only while its switch is on and agreed
 * to in this browser). One press, one request: the share prompt first, then the
 * AI's plan to review — tasks placed on days, new tasks and milestones, and
 * changes it suggests to tasks, goals, milestones and events (cleaned-up titles,
 * better filing and roadmap dates among them). Event moves start unticked. Nothing is saved until Apply, and then only through the
 * usual encrypted saves. The request and the answer live in this component's
 * memory and go when it closes — never in storage, a setting or a log.
 */

const Center = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 32px 0;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-muted);
`;

const Section = styled.section`
  & + & { margin-top: 26px; }
  h3 {
    margin: 0 0 4px;
    font-family: var(--font-display);
    font-size: 20px;
    font-weight: 300;
    color: var(--text-primary);
  }
  ul { list-style: none; margin: 0; padding: 0; }
  li { padding: 12px 0; border-bottom: 1px solid var(--border-subtle); }
`;

const Detail = styled.div`
  margin: 2px 0 0 30px;
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-muted);
  overflow-wrap: anywhere;
`;

const Note = styled.p<{ $error?: boolean }>`
  margin: 0 0 16px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: ${({ $error }) => ($error ? 'var(--color-danger)' : 'var(--text-muted)')};
`;

type Step = 'share' | 'working' | 'review' | 'saving';
type PlanOrder = { goals?: number[]; milestones?: number[] };
const NO_ORDER: PlanOrder = {};
const NO_TYPES: string[] = [];

const PRIORITY_LABEL: Record<string, string> = { urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low', none: 'No priority' };
const STATUS_LABEL: Record<string, string> = { new: 'New', planned: 'Planned', in_progress: 'In progress', paused: 'Paused', not_started: 'Not started' };

const when = (date: string, time: number | undefined, hours: number) =>
  `${dayLabel(date)}${time !== undefined ? ` · ${formatTime12h(hhmm(time))}` : ''} · ${hoursLabel(hours)}`;
const text = (v: unknown) => (typeof v === 'string' ? v : '');
const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
const shortDate = (day: string) => (day ? new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'none');

/** The person's own order for a board (top first), as the boards show it: cards never placed come first, newest first */
const inOrder = <T extends { id: number; created: number }>(list: T[], ids: number[] | undefined): T[] =>
  inPlanOrder([...list].sort((a, b) => b.created - a.created), ids);

type Fields = Record<string, unknown>;

/** The entry's name as its name field holds it (else its title): a rename replaces the first line only when it is this */
const nameNow = (item: { title: string; fields: Fields }, type: 'task' | 'goal' | 'milestone'): string =>
  text(item.fields[NAME_FIELD_BY_TYPE[type]]).trim() || item.title;

/* What each kind of accepted change does to an entry's fields (pure). Apply saves the result. */

/** A task after its changes: what it is, what it belongs to, and its place on a day */
function taskFieldsAfter(now: Fields, change: TaskChange | undefined, slot: ScheduledChange | undefined, milestoneGoal: number | undefined): Fields {
  let fields: Fields = { ...now };
  // Its milestone moved to another goal: the task goes with it
  if (milestoneGoal !== undefined) fields.parentGoalId = milestoneGoal;
  if (change?.priority) fields.priority = change.priority;
  if (change?.type) fields.taskType = change.type;
  if (change?.title) fields[NAME_FIELD_BY_TYPE.task] = change.title;
  if (change && change.goalId !== undefined) { fields.parentGoalId = change.goalId; fields.parentMilestoneId = change.milestoneId ?? null; }
  if (slot) {
    // Its day, its time (or none — the planner then places it), its length; an idea becomes something
    // to do. Its deadline is never touched
    fields = { ...dayPatch(fields, slot.date), scheduledTime: '' };
    if (slot.time !== undefined) fields = startPatch(fields, slot.time);
    fields = lengthPatch(fields, slot.hours);
    if (fields.isBacklog) fields = { ...fields, ...taskFieldsForStatus('todo') };
  }
  return fields;
}

const goalFieldsAfter = (now: Fields, c: GoalChange): Fields => ({
  ...now,
  ...(c.title ? { [NAME_FIELD_BY_TYPE.goal]: c.title } : {}), ...(c.status ? { goalStatus: c.status } : {}),
  ...(c.category ? { goalCategory: c.category } : {}),
  ...(c.startOn ? { startOn: c.startOn } : {}), ...(c.targetDate ? { targetDate: c.targetDate } : {}),
});

const milestoneFieldsAfter = (now: Fields, c: MilestoneChange): Fields => ({
  ...now,
  ...(c.title ? { [NAME_FIELD_BY_TYPE.milestone]: c.title } : {}), ...(c.status ? { milestoneStatus: c.status } : {}),
  ...(c.goalId !== undefined ? { parentGoalId: c.goalId } : {}),
  ...(c.startOn ? { startOn: c.startOn } : {}), ...(c.targetDate ? { targetDate: c.targetDate } : {}),
});

/** An event moved whole: its end date by as many days, its end time by as many minutes (`parsePlan` keeps it inside the day) */
function eventFieldsAfter(now: Fields, was: { day: string; start?: number; end?: number }, c: EventChange): Fields {
  const fields: Fields = { ...now, startDate: c.date };
  if (isDay(now.endDate)) fields.endDate = addDays(now.endDate, daysBetween(was.day, c.date));
  if (c.start !== undefined && was.start !== undefined && was.end !== undefined) {
    fields.startTime = hhmm(c.start);
    if (text(now.endTime)) fields.endTime = hhmm(c.start + (was.end - was.start));
  }
  return fields;
}

/** "Target date Dec 1, 2026 → Dec 15, 2026" for each thing a change touches */
function changeLines(
  c: { title?: string; status?: string; category?: string; type?: string; startOn?: string; targetDate?: string },
  now: { title: string; status: string; category?: string; type?: string; startOn: string; targetDate: string },
): string[] {
  return [
    ...(c.title ? [`Rename: “${now.title}” → “${c.title}”`] : []),
    ...(c.category ? [`Category: ${now.category || 'none'} → ${c.category}`] : []),
    ...(c.status ? [`Status: ${STATUS_LABEL[now.status] ?? now.status} → ${STATUS_LABEL[c.status] ?? c.status}`] : []),
    ...(c.startOn ? [`Starts: ${shortDate(now.startOn)} → ${shortDate(c.startOn)}`] : []),
    ...(c.targetDate ? [`Target: ${shortDate(now.targetDate)} → ${shortDate(c.targetDate)}`] : []),
  ];
}

export function AiPlanReview({ onClose }: { onClose: () => void }) {
  const { goals, milestones, tasks } = usePlanData();
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const [savedCategories, , categoriesLoaded] = useEncryptedSetting<GoalCategoryConfig>('goalCategories', EMPTY_GOAL_CATEGORIES);
  const [savedOrder, , orderLoaded] = useEncryptedSetting<PlanOrder>('planningOrder', NO_ORDER);
  const [savedTaskTypes, , typesLoaded] = useEncryptedSetting<string[]>('taskTypes', NO_TYPES);
  const settingsLoaded = categoriesLoaded && orderLoaded && typesLoaded;
  const saveFields = useSaveFields();
  const createEntry = useCreateEntry();

  const [step, setStep] = useState<Step>('share');
  const [error, setError] = useState('');
  const [plan, setPlan] = useState<AiPlan | null>(null);
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set());
  // A request can't be called back: an answer that arrives after Cancel is dropped
  const runRef = useRef(0);

  // What would be sent, worked out when the panel opens (the share prompt shows exactly this)
  const request = useMemo(() => {
    const now = new Date();
    const today = toDateStr(now);
    const days = Array.from({ length: PLAN_DAYS }, (_, i) => addDays(today, i));
    const last = days[days.length - 1];
    const facts = tasks.map(t => ({ ...t, ...plannerFacts(t.id, t.fields, t.created) }));
    const left = unscheduled(facts, today);
    const overdue = new Set(left.overdue.map(t => t.id));
    const config = parseGoalCategories(savedCategories);
    const openByMilestone = new Map<number, number>();
    for (const t of tasks) if (!t.completed && t.milestoneId) openByMilestone.set(t.milestoneId, (openByMilestone.get(t.milestoneId) ?? 0) + 1);
    return buildPlanRequest({
      days,
      nowMinutes: now.getHours() * 60 + now.getMinutes(),
      tasks: [...left.overdue, ...left.open, ...left.ideas].map(t => ({
        id: t.id, title: t.title, priority: t.priority, deadline: t.deadline, hours: t.hours,
        goalId: t.goalId, milestoneId: t.milestoneId, overdue: overdue.has(t.id), notes: text(t.fields.notes), type: taskTypeOf(t.fields), estimate: estimateOf(t.fields),
        status: t.backlog ? 'idea' as const : t.fields.isInProgress || t.fields.isInReview ? 'in_progress' as const : 'todo' as const,
      })),
      // Already on a day in the range and not done: context for the AI, and time that is taken
      planned: facts.filter(t => !t.done && t.scheduled >= today && t.scheduled <= last)
        .sort((a, b) => a.scheduled.localeCompare(b.scheduled) || (a.at ?? 0) - (b.at ?? 0))
        .map(t => ({ id: t.id, title: t.title, day: t.scheduled, start: t.at, hours: t.hours, goalId: t.goalId, milestoneId: t.milestoneId })),
      // In the person's own order on the boards: the top card is the most important
      goals: inOrder(goals.filter(g => g.status !== 'completed'), savedOrder?.goals).map(g => ({
        id: g.id, title: g.title, category: g.category, status: g.status,
        startOn: text(g.fields.startOn), targetDate: text(g.fields.targetDate), notes: text(g.fields.notes),
      })),
      milestones: inOrder(milestones.filter(m => !m.completed), savedOrder?.milestones).map(m => ({
        id: m.id, title: m.title, goalId: m.goalId,
        status: m.fields.milestoneStatus === 'in_progress' ? 'in_progress' as const : 'not_started' as const,
        startOn: text(m.fields.startOn), targetDate: text(m.fields.targetDate), notes: text(m.fields.notes), openTasks: openByMilestone.get(m.id) ?? 0,
      })),
      categories: goalCategoryList(config),
      taskTypes: taskTypeList(Array.isArray(savedTaskTypes) ? savedTaskTypes.filter((t): t is string => typeof t === 'string') : NO_TYPES),
      visions: {
        overall: config.vision ?? '',
        areas: goalCategoryList(config).map(name => ({ name, vision: areaInfo(config, name).vision ?? '' })),
      },
      // Events and meetings: what each is and when — not its notes, place or people
      events: eventOccurrences(entries, allTopics, days[0], last)
        .map(o => ({
          id: o.entry.id, day: o.day, title: entryTitleText(o.entry.content) || builtinEntryName(o.fields) || o.topicName,
          start: o.start, end: o.end, repeats: !!repeatRuleOf(o.fields),
        }))
        .sort((a, b) => a.day.localeCompare(b.day) || (a.start ?? -1) - (b.start ?? -1)),
    });
    // Fixed once the settings are in: what the prompt lists is what is sent
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsLoaded]);

  const ctx = request.context;
  const nothingToPlan = ctx.taskIds.size === 0 && ctx.goals.size === 0;
  const taskById = useMemo(() => new Map(tasks.map(t => [t.id, t])), [tasks]);
  const goalById = useMemo(() => new Map(goals.map(g => [g.id, g])), [goals]);
  const milestoneById = useMemo(() => new Map(milestones.map(m => [m.id, m])), [milestones]);
  const entryById = useMemo(() => new Map(entries.map(e => [e.id, e])), [entries]);
  const linkName = (goalId: number | null | undefined, milestoneId: number | null | undefined) =>
    (milestoneId && milestoneById.get(milestoneId)?.title) || (goalId && goalById.get(goalId)?.title) || 'a goal';

  const send = async () => {
    const run = ++runRef.current;
    setError('');
    setStep('working');
    try {
      const answer = await aiFeatureJson('aiPlan', request.system, request.prompt, 16000);
      if (run !== runRef.current) return;
      const parsed = parsePlan(answer, ctx);
      if (planSize(parsed) === 0) throw new Error('The AI had nothing to suggest this time.');
      setPlan(parsed);
      // An event often involves other people: moving one starts unticked
      setSkipped(new Set(parsed.eventChanges.map(c => `e${c.id}`)));
      setStep('review');
    } catch (err) {
      if (run !== runRef.current) return;
      setError(err instanceof Error ? err.message : 'That didn’t work. Try again.');
      setStep('share');
    }
  };

  const close = () => { runRef.current++; onClose(); };
  const toggle = (key: string, on: boolean) => setSkipped(s => { const next = new Set(s); if (on) next.delete(key); else next.add(key); return next; });
  const on = (key: string) => !skipped.has(key);

  const chosen: AiPlan = plan ? {
    schedule: plan.schedule.filter(c => on(`s${c.id}`)),
    newTasks: plan.newTasks.filter((_, i) => on(`n${i}`)),
    taskChanges: plan.taskChanges.filter(c => on(`t${c.id}`)),
    goalChanges: plan.goalChanges.filter(c => on(`g${c.id}`)),
    milestoneChanges: plan.milestoneChanges.filter(c => on(`m${c.id}`)),
    newMilestones: plan.newMilestones.filter((_, i) => on(`nm${i}`)),
    eventChanges: plan.eventChanges.filter(c => on(`e${c.id}`)),
    cutShort: plan.cutShort,
  } : { schedule: [], newTasks: [], taskChanges: [], goalChanges: [], milestoneChanges: [], newMilestones: [], eventChanges: [], cutShort: false };
  const total = planSize(chosen);

  const apply = async () => {
    setStep('saving');
    // Counted per save, not per change: a task's day and its other changes are one save
    let saves = 0;
    let failed = 0;
    const saved = async (ok: Promise<boolean>) => { saves++; if (!await ok) failed++; };
    const missing = () => { saves++; failed++; };

    // A milestone moving to another goal takes its tasks along (a task's own goal would otherwise win)
    const movedMilestones = new Map(chosen.milestoneChanges.flatMap(c => (c.goalId !== undefined ? [[c.id, c.goalId] as const] : [])));
    const carried = tasks
      .filter(t => t.milestoneId !== null && movedMilestones.has(t.milestoneId) && typeof t.fields.parentGoalId === 'number' && t.fields.parentGoalId !== movedMilestones.get(t.milestoneId))
      .map(t => t.id);

    // Everything about one task goes in one save
    for (const id of new Set([...chosen.schedule.map(c => c.id), ...chosen.taskChanges.map(c => c.id), ...carried])) {
      const task = taskById.get(id);
      if (!task) { missing(); continue; }
      const change = chosen.taskChanges.find(c => c.id === id);
      const fields = taskFieldsAfter(task.fields, change, chosen.schedule.find(c => c.id === id),
        task.milestoneId !== null ? movedMilestones.get(task.milestoneId) : undefined);
      await saved(saveFields(task.entry, fields, change?.title ? contentRenamed(task.entry.content, change.title, nameNow(task, 'task')) : task.entry.content));
    }
    for (const n of chosen.newTasks) {
      await saved(createEntry({ name: 'Task', icon: 'circle-check' }, n.title, {
        taskDescription: n.title, ...taskFieldsForStatus('todo'), isAutoMigrating: false,
        parentGoalId: n.goalId, parentMilestoneId: n.milestoneId, deadline: '', priority: 'none',
        scheduledDate: n.date, ...(n.date && n.time !== undefined ? { scheduledTime: hhmm(n.time) } : {}), scheduledHours: n.hours,
      }).then(id => id !== null));
    }
    for (const c of chosen.goalChanges) {
      const goal = goalById.get(c.id);
      if (!goal) { missing(); continue; }
      await saved(saveFields(goal.entry, goalFieldsAfter(goal.fields, c), c.title ? contentRenamed(goal.entry.content, c.title, nameNow(goal, 'goal')) : goal.entry.content));
    }
    for (const c of chosen.milestoneChanges) {
      const milestone = milestoneById.get(c.id);
      if (!milestone) { missing(); continue; }
      await saved(saveFields(milestone.entry, milestoneFieldsAfter(milestone.fields, c),
        c.title ? contentRenamed(milestone.entry.content, c.title, nameNow(milestone, 'milestone')) : milestone.entry.content));
    }
    for (const n of chosen.newMilestones) {
      await saved(createEntry({ name: 'Milestone', icon: 'flag' }, n.title, {
        [NAME_FIELD_BY_TYPE.milestone]: n.title, parentGoalId: n.goalId, milestoneStatus: 'not_started', isCompleted: false,
        startOn: n.startOn, targetDate: n.targetDate,
      }).then(id => id !== null));
    }
    for (const c of chosen.eventChanges) {
      const entry = entryById.get(c.id);
      const was = ctx.events.get(c.id);
      if (!entry || !was) { missing(); continue; }
      const now = ((entry.metadata as Record<string, unknown>)?._customFields as Fields) ?? {};
      await saved(saveFields(entry, eventFieldsAfter(now, was, c)));
    }
    if (failed) showFlash(`${failed} of ${saves} changes didn’t save. The rest are in place.`);
    onClose();
  };

  const footer = step === 'share' ? (<>
    <PillButton type="button" $variant="neutral" onClick={close}>Cancel</PillButton>
    <PillButton type="button" disabled={nothingToPlan || !settingsLoaded} onClick={() => { void send(); }}>OK</PillButton>
  </>) : step === 'working' ? (
    <PillButton type="button" $variant="neutral" onClick={close}>Cancel</PillButton>
  ) : (<>
    <PillButton type="button" $variant="neutral" disabled={step === 'saving'} onClick={close}>Cancel</PillButton>
    <PillButton type="button" disabled={step === 'saving' || total === 0} onClick={() => { void apply(); }}>
      {step === 'saving' ? 'Saving…' : `Apply ${total} ${total === 1 ? 'change' : 'changes'}`}
    </PillButton>
  </>);

  /** One section of the review: a row per change, with a tick, what changes and why */
  const section = (title: string, list: { key: string; label: string; details: string[]; why?: string }[]): ReactNode => list.length > 0 && (
    <Section aria-label={title}>
      <h3>{title}</h3>
      <ul>
        {list.map(row => (
          <li key={row.key}>
            <Checkbox label={row.label} checked={on(row.key)} onChange={e => toggle(row.key, e.target.checked)} />
            {row.details.map(d => <Detail key={d}>{d}</Detail>)}
            {row.why && <Detail>{row.why}</Detail>}
          </li>
        ))}
      </ul>
    </Section>
  );

  return (
    <Modal open onClose={step === 'saving' ? () => {} : close} title="AI plan" size="lg" footer={footer}
      // A plan being reviewed was paid for: a stray click outside must not throw it away
      closeOnBackdrop={step === 'share'}>
      {step === 'share' && (<>
        {error && <Note $error role="alert">{error}</Note>}
        {!settingsLoaded && <Note role="status">Reading your planning settings. If this stays, check your connection and open it again.</Note>}
        {nothingToPlan
          ? <Note>There are no unscheduled tasks or open goals to plan.</Note>
          : (
            <AiSharePrompt provider={aiProviderName()} lines={request.shared} approxTokens={request.approxTokens}
              note={request.leftOut > 0 ? `${request.leftOut} less urgent tasks are left out to keep the request small.` : undefined} />
          )}
      </>)}
      {step === 'working' && <Center role="status"><Spinner size={32} />Planning your next {PLAN_DAYS} days…</Center>}
      {(step === 'review' || step === 'saving') && plan && (<>
        <Note>
          Written by an AI model. Untick anything you don’t want. Event moves start unticked. Nothing is saved until you press Apply.
        </Note>
        {plan.cutShort && <Note role="status">The AI’s answer was cut short, so some suggestions may be missing. What it finished is below.</Note>}
        {section('Schedule', plan.schedule.map(c => ({
          key: `s${c.id}`, label: taskById.get(c.id)?.title ?? 'Task', details: [when(c.date, c.time, c.hours)],
        })))}
        {section('Task updates', plan.taskChanges.map(c => ({
          key: `t${c.id}`, label: taskById.get(c.id)?.title ?? 'Task', why: c.why,
          details: [
            ...(c.title ? [`Rename: “${ctx.tasks.get(c.id)?.title ?? ''}” → “${c.title}”`] : []),
            ...(c.type ? [`Type: ${ctx.tasks.get(c.id)?.type || 'none'} → ${c.type}`] : []),
            ...(c.priority ? [`Priority: ${PRIORITY_LABEL[ctx.tasks.get(c.id)?.priority ?? 'none'] ?? 'No priority'} → ${PRIORITY_LABEL[c.priority]}`] : []),
            ...(c.goalId !== undefined ? [`Part of: ${linkName(c.goalId, c.milestoneId)}`] : []),
          ],
        })))}
        {section('New tasks', plan.newTasks.map((n, i) => ({
          key: `n${i}`, label: n.title, why: n.why,
          details: [`For ${linkName(n.goalId, n.milestoneId)}${n.date ? ` · ${when(n.date, n.time, n.hours)}` : ' · no day yet'}`],
        })))}
        {section('Goals', plan.goalChanges.map(c => ({
          key: `g${c.id}`, label: goalById.get(c.id)?.title ?? 'Goal', why: c.why, details: changeLines(c, ctx.goals.get(c.id)!),
        })))}
        {section('Milestones', plan.milestoneChanges.map(c => ({
          key: `m${c.id}`, label: milestoneById.get(c.id)?.title ?? 'Milestone', why: c.why,
          details: [...changeLines(c, ctx.milestones.get(c.id)!), ...(c.goalId !== undefined ? [`Part of: ${linkName(c.goalId, null)}`] : [])],
        })))}
        {section('New milestones', plan.newMilestones.map((n, i) => ({
          key: `nm${i}`, label: n.title, why: n.why,
          details: [`For ${linkName(n.goalId, null)}${n.targetDate ? ` · target ${shortDate(n.targetDate)}` : ''}`],
        })))}
        {section('Events', plan.eventChanges.map(c => {
          const was = ctx.events.get(c.id)!;
          const entry = entryById.get(c.id);
          const at = (day: string, start?: number) => `${dayLabel(day)}${start !== undefined ? ` · ${formatTime12h(hhmm(start))}` : ''}`;
          return {
            key: `e${c.id}`, label: entry ? entryTitleText(entry.content) || 'Event' : 'Event', why: c.why,
            details: [`Move: ${at(was.day, was.start)} → ${at(c.date, c.start ?? was.start)}`],
          };
        }))}
      </>)}
    </Modal>
  );
}
