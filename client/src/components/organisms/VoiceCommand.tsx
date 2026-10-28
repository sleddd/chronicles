import { useMemo, useRef, useState } from 'react';
import styled, { css, keyframes } from 'styled-components';
import { Icon } from '../atoms/core/Icon.jsx';
import { PillButton } from '../atoms/PillButton.js';
import { BoxText } from '../molecules/fields/formKit.js';
import { useDictation } from '../../hooks/useDictation.js';
import { useSaveCommand, JOURNAL_PLACEHOLDER_ID } from '../../hooks/useSaveCommand.js';
import { useOpenInJournal } from '../../hooks/useOpenInJournal.js';
import { useAiReady } from '../../hooks/useAiReady.js';
import { useEntriesStore } from '../../stores/entriesStore.js';
import { parseVoiceCommand, matchPlanItem, type VoicePlan } from '../../utils/voiceCommand.js';
import { parseMarkCommand, type MarkCommand } from '../../utils/voiceMark.js';
import { parseListItemCommand, type ListItemCommand } from '../../utils/voiceList.js';
import { checklistOf, isTodoList } from '../../utils/taskLists.js';
import { latestOpenList } from '../../utils/kitchen.js';
import { useSaveFields } from '../../hooks/useSaveFields.js';
import { useEncryption } from '../../contexts/EncryptionContext.js';
import { entries as entriesApi } from '../../services/api.js';
import { getOrCreateTopic } from '../../utils/getOrCreateJournalTopic.js';
import { prioritiesTitle } from '../../utils/entrySave.js';
import { deleteEntryWithImages } from '../../utils/entryActions.js';
import type { DecryptedPost } from '@shared/crypto/types';
import { useTodayDoses, DOSES_CHANGED } from '../../hooks/useTodayDoses.js';
import { useRoutineChecklist } from '../../hooks/useRoutineChecklist.js';
import { doses as dosesApi } from '../../services/api.js';
import { toDateStr } from '../../utils/dateUtils.js';
import { stripHtml, builtinEntryName } from '../../utils/stripHtml.js';

/* Voice commands (dashboard): one tap on Voice opens this and starts listening — "Add task call the
   dentist due Friday, high priority", "Log symptom headache severity 6", "Add
   mantra I am enough". What's heard fills an editable box, a one-line preview
   shows the topic and fields it will save (parseVoiceCommand), and Save writes
   it like the chat's /save (useSaveCommand). "… and save" / "save it" at the
   end, or "save" said on its own, saves without a tap. The words go through
   the browser's speech service (said so in the panel); the entry is encrypted
   before it's saved. */

const Panel = styled.section`
  margin-top: 24px;
  padding: 24px 28px;
  background: var(--bg-panel);
  border-radius: 14px;
  font-family: var(--font-sans);
  @media (max-width: 480px) { padding: 22px 20px; }
`;

const Top = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`;

const pulse = keyframes`
  0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-accent) 45%, transparent); }
  100% { box-shadow: 0 0 0 14px transparent; }
`;

/* The mic: a round outlined button, the accent while listening */
const Mic = styled.button<{ $on: boolean }>`
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid ${({ $on }) => ($on ? 'var(--color-accent-line)' : 'var(--border-card)')};
  background: transparent;
  color: ${({ $on }) => ($on ? 'var(--color-accent-line)' : 'var(--text-muted)')};
  cursor: pointer;
  ${({ $on }) => $on && css`animation: ${pulse} 1.4s ease-out infinite;`}
  &:hover { color: var(--text-primary); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 3px; }
  @media (prefers-reduced-motion: reduce) { animation: none; }
`;

const Status = styled.div`
  flex: 1;
  min-width: 0;
  h2 { margin: 0; font-size: 15px; font-weight: 400; color: var(--text-muted); }
  p { margin: 4px 0 0; font-size: 14px; color: var(--text-muted); font-style: italic; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;

const Close = styled.button`
  flex: none;
  align-self: flex-start;
  display: inline-flex;
  padding: 4px;
  border: none;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  &:hover { color: var(--text-primary); }
`;

const Said = styled(BoxText)`
  margin-top: 18px;
`;

/* "Task · Call the dentist · Due Fri, Oct 30 · High priority" */
const Preview = styled.p`
  margin: 12px 0 0;
  font-size: 14px;
  color: var(--text-secondary);
  b { font-weight: 500; color: var(--color-accent-soft); }
  span { color: var(--text-muted); }
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 18px;
`;

const Note = styled.p<{ $error?: boolean }>`
  margin: 12px 0 0;
  font-size: 14px;
  color: ${({ $error }) => ($error ? 'var(--color-danger)' : 'var(--text-secondary)')};
  button { margin-left: 8px; padding: 0; border: none; background: none; font: inherit; font-weight: 500; color: var(--color-accent-link); cursor: pointer; }
  button:hover { text-decoration: underline; }
`;

const Hint = styled.p`
  margin: 16px 0 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-muted);
`;

/** "08:00" → "8:00 AM" */
function clock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return Number.isNaN(h) ? hhmm : `${h % 12 || 12}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

const SAVE_WORD = /^(?:ok(?:ay)?\s+)?save(?:\s+it)?[.!]?$/i;

/**
 * The voice session, held by the page that shows the Voice button: the mic
 * must start inside the button's own tap (iPhone / iPad won't start it from
 * an effect), so `openAndListen` opens the panel and starts listening at once.
 */
export function useVoiceSession() {
  const [open, setOpen] = useState(false);
  const topics = useEntriesStore(s => s.topics);
  const entries = useEntriesStore(s => s.decryptedEntries);
  const openInJournal = useOpenInJournal();
  const saveCommand = useSaveCommand();
  // With In-App AI set up, a meal's nutrients are estimated on save (like the chat's /save)
  const aiReady = useAiReady();
  const [text, setTextState] = useState('');
  // The latest text, for phrases that arrive before a re-render
  const textRef = useRef('');
  const setText = (next: string) => { textRef.current = next; setTextState(next); };
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ text: string; id?: number; error?: boolean; undo?: () => Promise<void> } | null>(null);
  // "Mark oregano oil taken" / "mark exercise ocean breathing": today's doses and schedule
  const doses = useTodayDoses(open);
  const dosesRef = useRef(doses);
  dosesRef.current = doses;
  const schedule = useRoutineChecklist();
  const saveFields = useSaveFields();
  const { encryptNewPost } = useEncryption();
  const addDecryptedEntry = useEntriesStore(s => s.addDecryptedEntry);

  const refs = useMemo(() => topics.map(t => ({ id: t.id, name: t.name })), [topics]);
  const journal = useMemo(
    () => refs.find(t => t.name.trim().toLowerCase() === 'journal') ?? { id: JOURNAL_PLACEHOLDER_ID, name: 'Journal' },
    [refs],
  );
  // Goals and milestones by name, for "part of Chronicles"
  const plan = useMemo<VoicePlan>(() => {
    const idOf = (name: string) => refs.find(t => t.name.trim().toLowerCase() === name)?.id;
    const goalTid = idOf('goal') ?? idOf('goals');
    const msTid = idOf('milestone') ?? idOf('milestones');
    const goals: VoicePlan['goals'] = [];
    const milestones: VoicePlan['milestones'] = [];
    for (const e of entries) {
      const meta = (e.metadata ?? {}) as Record<string, unknown>;
      const cf = (meta._customFields ?? {}) as Record<string, unknown>;
      const title = builtinEntryName(cf) || stripHtml(e.content).trim();
      if (!title) continue;
      if (goalTid !== undefined && meta._taxonomyId === goalTid) goals.push({ id: e.id, title });
      if (msTid !== undefined && meta._taxonomyId === msTid) milestones.push({ id: e.id, title, goalId: (cf.parentGoalId as number) || null });
    }
    return { goals, milestones };
  }, [entries, refs]);
  // As-needed medications (no scheduled times): "I took my ibuprofen" logs one dose
  const asNeededMeds = useMemo(() => {
    const medTid = refs.find(t => t.name.trim().toLowerCase() === 'medication')?.id;
    return entries
      .filter(e => (e.metadata as Record<string, unknown> | undefined)?._taxonomyId === medTid)
      .map(e => ({ e, cf: ((e.metadata as Record<string, unknown>)._customFields ?? {}) as Record<string, unknown> }))
      .filter(({ cf }) => cf.frequency === 'as_needed' && cf.isActive !== false)
      .map(({ e, cf }) => ({ id: e.id, title: String(cf.medicationName ?? '').trim() || stripHtml(e.content).trim() }));
  }, [entries, refs]);
  const parse = (said: string) => parseVoiceCommand(said, refs, journal, new Date(), plan);
  const listItemCommand = parseListItemCommand(text);
  const shownList = listItemCommand?.saidList ? listItemCommand : null;
  const markCommand = shownList ? null : parseMarkCommand(text);
  const command = shownList || markCommand ? null : parse(text);

  const save = async (said = textRef.current) => {
    const listCmd = parseListItemCommand(said);
    if (listCmd && (await listCommand(listCmd))) return;
    const markCmd = parseMarkCommand(said);
    if (markCmd) { await mark(markCmd); return; }
    const cmd = parse(said);
    if (!cmd || saving) return;
    dictation.stopListening();
    setSaving(true);
    setNote(null);
    try {
      // A to-do list: the task in the list format, holding the items said
      const extraFields = {
        ...(cmd.link?.fields ?? {}),
        ...(cmd.list ? { taskFormat: 'list', checklist: cmd.list.map(text => ({ id: crypto.randomUUID(), text, done: false })) } : {}),
      };
      const { id, estimated } = await saveCommand(cmd.topic, cmd.text, {
        ...(Object.keys(extraFields).length ? { extraFields } : {}),
        ...(aiReady ? { estimateNutrition: true } : {}),
      });
      setNote({ text: `Saved to ${cmd.topic.name}${estimated ? ' with AI nutrient estimates' : ''}.`, id });
      setText('');
    } catch (err) {
      console.error('Voice save failed:', err);
      setNote({ text: 'That didn’t save. Try again.', error: true });
    } finally {
      setSaving(false);
    }
  };

  /** Tick today's next dose / session of what was named; Undo puts it back */
  const mark = async (cmd: MarkCommand) => {
    dictation.stopListening();
    setNote(null);
    setText('');
    const today = toDateStr(new Date());
    const changed = () => window.dispatchEvent(new Event(DOSES_CHANGED));
    try {
      if (cmd.kind !== 'exercise') {
        // Today's dose logs load when the panel opens: wait for them (briefly)
        for (let i = 0; i < 30 && !dosesRef.current.loaded; i++) await new Promise(r => setTimeout(r, 100));
        const d = dosesRef.current;
        const scheduledMeds = [...new Map(d.scheduled.map(x => [x.medicationPostId, { id: x.medicationPostId, title: x.medicationName }])).values()];
        const asNeeded = asNeededMeds.filter(m => !scheduledMeds.some(x => x.id === m.id));
        const med = matchPlanItem(cmd.name, [...scheduledMeds, ...asNeeded]);
        if (med && scheduledMeds.some(x => x.id === med.id)) {
          const next = d.scheduled.filter(x => x.medicationPostId === med.id && !d.isTaken(x)).sort((a, b) => a.time.localeCompare(b.time))[0];
          if (!next) { setNote({ text: `All of today’s ${med.title} doses are already ticked.` }); return; }
          await d.setTaken(next, true);
          changed();
          setNote({ text: `Marked ${med.title} (${clock(next.time)}) taken.`, undo: async () => { await dosesRef.current.setTaken(next, false); changed(); } });
          return;
        }
        if (med) {
          const { log } = await dosesApi.logAsNeeded({ medicationPostId: med.id, date: today });
          changed();
          setNote({ text: `Logged a dose of ${med.title}.`, undo: async () => { await dosesApi.remove(log.id); changed(); } });
          return;
        }
        if (cmd.kind === 'med') { setNote({ text: `No medication called “${cmd.name}” on your list.`, error: true }); return; }
      }
      const routine = matchPlanItem(cmd.name, schedule.routines.map(r => ({ id: r.id, title: r.name })));
      if (!routine) {
        setNote({ text: `Nothing on your medications or exercise schedule called “${cmd.name}”.`, error: true });
        return;
      }
      const slots = schedule.slots.filter(s => s.routine.id === routine.id).sort((a, b) => a.time.localeCompare(b.time));
      if (!slots.length) { setNote({ text: `${routine.title} isn’t on today’s schedule.` }); return; }
      const next = slots.find(s => !schedule.isDone(s));
      if (!next) { setNote({ text: `${routine.title} is already done for today.` }); return; }
      await schedule.setDone(next, true);
      setNote({ text: `Marked ${routine.title} (${clock(next.time)}) done.`, undo: async () => { await schedule.setDone(next, false); } });
    } catch (err) {
      console.error('Voice mark failed:', err);
      setNote({ text: 'That didn’t save. Try again.', error: true });
    }
  };

  /* ── Lists: "cross laundry off my to do's", "add eggs to my shopping list" ── */
  const fieldsOf = (e: DecryptedPost) => ((e.metadata as Record<string, unknown> | undefined)?._customFields ?? {}) as Record<string, unknown>;
  const titleOf = (e: DecryptedPost) => builtinEntryName(fieldsOf(e)) || stripHtml(e.content).trim() || 'Untitled list';
  const newestFirst = (a: DecryptedPost, b: DecryptedPost) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  const topicIdNamed = (...names: string[]) => refs.find(t => names.includes(t.name.trim().toLowerCase()))?.id;
  const inTopic = (e: DecryptedPost, id: number | undefined) => id !== undefined && (e.metadata as Record<string, unknown> | undefined)?._taxonomyId === id;

  /** The list a command names, or null when it names none (then it isn't a list command) */
  const findList = (cmd: ListItemCommand): { entry: DecryptedPost; shopping: boolean } | { missing: string } | null => {
    const all = useEntriesStore.getState().decryptedEntries;
    if (cmd.priorities) {
      // The newest Priorities entry — the list the dashboard card shows
      const priTid = topicIdNamed('priorities', 'priority');
      const e = all.filter(x => inTopic(x, priTid)).sort(newestFirst)[0];
      return e ? { entry: e, shopping: false } : { missing: 'You don’t have a priorities list yet.' };
    }
    const shopTid = topicIdNamed('shopping list', 'shopping lists');
    const shopping = all.filter(e => inTopic(e, shopTid)).sort(newestFirst);
    const taskTid = topicIdNamed('task', 'tasks');
    const todo = all.filter(e => inTopic(e, taskTid) && isTodoList(fieldsOf(e))).sort(newestFirst);
    const byName = (list: DecryptedPost[]) => matchPlanItem(cmd.list, list.map(e => ({ e, title: titleOf(e) })))?.e;
    if (cmd.shopping) {
      const e = cmd.list ? byName(shopping) : latestOpenList(all, shopTid) ?? shopping[0];
      return e ? { entry: e, shopping: true } : { missing: cmd.list ? `No shopping list called “${cmd.list}”.` : 'You don’t have a shopping list yet.' };
    }
    if (!cmd.list) {
      const e = todo.find(x => !fieldsOf(x).isCompleted) ?? todo[0];
      return e ? { entry: e, shopping: false } : { missing: 'You don’t have a to-do list yet. Say “Add to-do list …” to start one.' };
    }
    const e = byName(todo);
    if (e) return { entry: e, shopping: false };
    const s2 = byName(shopping);
    if (s2) return { entry: s2, shopping: true };
    return cmd.saidList ? { missing: `No to-do list called “${cmd.list}”.` } : null;
  };

  /** Cross an item off, or add one; false when the sentence named no list */
  const listCommand = async (cmd: ListItemCommand): Promise<boolean> => {
    const found = findList(cmd);
    if (!found) return false;
    dictation.stopListening();
    setText('');
    // The first priority starts a list, as the dashboard card does
    if ('missing' in found && cmd.priorities && cmd.action === 'add') {
      try {
        const name = cmd.item.charAt(0).toUpperCase() + cmd.item.slice(1);
        const topicId = await getOrCreateTopic('Priorities', 'flag');
        const content = `<p>${prioritiesTitle(new Date())}</p>`;
        const metadata = { _taxonomyId: topicId, _customFields: { priorities: [{ id: crypto.randomUUID(), text: name, done: false }] } };
        const enc = await encryptNewPost(content, metadata);
        const res = await entriesApi.create({ id: enc.id,
          contentEncrypted: enc.contentEncrypted, contentIv: enc.contentIv,
          metadataEncrypted: enc.metadataEncrypted, metadataIv: enc.metadataIv,
          isEncrypted: true, taxonomyIds: [topicId],
        });
        const id = res.id as number;
        addDecryptedEntry({ id, content, metadata, isEncrypted: true,
          createdAt: new Date(res.createdAt as string), updatedAt: new Date((res.updatedAt || res.createdAt) as string) });
        setNote({ text: `Added ${name} to your priorities.`, undo: () => deleteEntryWithImages(id) });
      } catch (err) {
        console.error('Voice priority failed:', err);
        setNote({ text: 'That didn’t save. Try again.', error: true });
      }
      return true;
    }
    if ('missing' in found) { setNote({ text: found.missing, error: true }); return true; }
    const { entry, shopping } = found;
    const cf = fieldsOf(entry);
    const listName = cmd.priorities ? 'your priorities' : titleOf(entry);
    type Row = { id: string; title: string; done: boolean };
    // A to-do list's items and the priorities share one shape ({ id, text, done })
    const key = shopping ? 'items' : cmd.priorities ? 'priorities' : 'checklist';
    const textItems = cmd.priorities ? checklistOf({ checklist: cf.priorities }) : checklistOf(cf);
    const rows: Row[] = shopping
      ? (((cf.items as { id: string; name: string; checked?: boolean }[] | undefined) ?? []).map(i => ({ id: i.id, title: i.name, done: !!i.checked })))
      : textItems.map(i => ({ id: i.id, title: i.text, done: i.done }));
    const before = cf[key];
    const undoTo = () => async () => {
      const now = useEntriesStore.getState().decryptedEntries.find(x => x.id === entry.id);
      if (now && !(await saveFields(now, { ...fieldsOf(now), [key]: before }))) throw new Error('undo failed');
    };
    if (cmd.action === 'add') {
      const name = cmd.item.charAt(0).toUpperCase() + cmd.item.slice(1);
      const next = shopping
        ? [...((cf.items as unknown[]) ?? []), { id: crypto.randomUUID(), name, category: 'other', checked: false }]
        : [...textItems, { id: crypto.randomUUID(), text: name, done: false }];
      const ok = await saveFields(entry, { ...cf, [key]: next });
      setNote(ok ? { text: `Added ${name} to ${listName}.`, undo: undoTo() } : { text: 'That didn’t save. Try again.', error: true });
      return true;
    }
    const row = matchPlanItem(cmd.item, rows.filter(r => !r.done)) ?? matchPlanItem(cmd.item, rows);
    if (!row) { setNote({ text: `Nothing called “${cmd.item}” on ${listName}.`, error: true }); return true; }
    if (row.done) { setNote({ text: `${row.title} is already crossed off ${listName}.` }); return true; }
    const next = shopping
      ? ((cf.items as { id: string }[]) ?? []).map(i => (i.id === row.id ? { ...i, checked: true } : i))
      : textItems.map(i => (i.id === row.id ? { ...i, done: true } : i));
    const ok = await saveFields(entry, { ...cf, [key]: next });
    setNote(ok ? { text: `Crossed ${row.title} off ${listName}.`, undo: undoTo() } : { text: 'That didn’t save. Try again.', error: true });
    return true;
  };

  const dictation = useDictation({
    onFinalResult: heard => {
      // "save" on its own saves what's there; "… and save" saves this sentence
      if (SAVE_WORD.test(heard.trim())) { void save(); return; }
      // "Cross laundry off my to do's" / "add eggs to my shopping list": done at once
      const listCmd = parseListItemCommand(heard);
      if (listCmd) {
        void listCommand(listCmd).then(done => { if (!done) appendHeard(heard); });
        return;
      }
      // "Mark oregano oil taken": done at once (Undo puts it back)
      const markCmd = parseMarkCommand(heard);
      if (markCmd) { void mark(markCmd); return; }
      appendHeard(heard);
    },
  });

  /** An ordinary phrase: added to the sentence (and saved now on "… and save") */
  function appendHeard(heard: string) {
    const next = [textRef.current, heard].filter(Boolean).join(' ');
    if (parse(next)?.saveNow) { void save(next); return; }
    setText(next);
    setNote(null);
  }

  const toggleMic = () => {
    if (dictation.isListening) dictation.stopListening();
    else { setNote(null); dictation.startListening(); }
  };
  const openAndListen = () => {
    setOpen(true);
    setNote(null);
    dictation.startListening();
  };
  const close = () => { dictation.stopListening(); setOpen(false); };

  return { open, openAndListen, close, dictation, text, setText, saving, note, setNote, command, markCommand, listItemCommand: shownList, save, toggleMic, openInJournal, supported: dictation.isSupported };
}

export type VoiceSession = ReturnType<typeof useVoiceSession>;

export function VoiceCommand({ session }: { session: VoiceSession }) {
  const { dictation, text, setText, saving, note, setNote, command, markCommand, listItemCommand, save, toggleMic, openInJournal, close } = session;

  return (
    <Panel aria-label="Voice command">
      <Top>
        <Mic type="button" $on={dictation.isListening} aria-pressed={dictation.isListening}
          aria-label={dictation.isListening ? 'Stop listening' : 'Start listening'} onClick={toggleMic}>
          <Icon name="mic" size={24} strokeWidth={1.6} />
        </Mic>
        <Status aria-live="polite">
          <h2>{dictation.isListening ? 'Listening… say it' : 'Tap the mic to talk again'}</h2>
          {dictation.isListening && dictation.interimText && <p>{dictation.interimText}</p>}
        </Status>
        <Close type="button" aria-label="Close voice command" onClick={close}>
          <Icon name="x" size={18} strokeWidth={2} />
        </Close>
      </Top>

      {dictation.error && <Note $error role="alert">{dictation.error}</Note>}

      <Said value={text} onChange={e => { setText(e.target.value); setNote(null); }}
        placeholder="What you say shows here, and you can fix it before saving" aria-label="What you said" />

      {listItemCommand && (
        <Preview>
          <b>{listItemCommand.action === 'add' ? 'Add' : 'Cross off'}</b> · {listItemCommand.item}
          <span> · {listItemCommand.priorities ? 'your priorities' : listItemCommand.list || (listItemCommand.shopping ? 'newest shopping list' : 'newest to-do list')}</span>
        </Preview>
      )}
      {markCommand && (
        <Preview>
          <b>Mark</b> · {markCommand.name}
          <span> · {markCommand.kind === 'med' ? 'today’s next dose' : markCommand.kind === 'exercise' ? 'today’s next session' : 'today’s next dose or session'}</span>
        </Preview>
      )}
      {command && (
        <Preview>
          <b>{command.list ? 'To-do list' : command.topic.name}</b>
          {command.main && <> · {command.main}</>}
          {command.list && (
            <span> · {command.list.length ? `${command.list.length} ${command.list.length === 1 ? 'item' : 'items'}: ${command.list.join(', ')}` : 'no items yet'}</span>
          )}
          {command.parts.map(p => <span key={p.key}> · {p.label}</span>)}
          {command.link && <span> · {command.link.label}</span>}
        </Preview>
      )}

      {command?.unmatchedLink && (
        <Note>No goal or milestone called “{command.unmatchedLink}”, so it isn’t linked. Check the name, or link it in the task later.</Note>
      )}

      <Actions>
        <PillButton type="button" disabled={(!command && !markCommand && !listItemCommand) || saving} onClick={() => void save()}>
          {saving ? 'Saving…' : listItemCommand ? (listItemCommand.action === 'add' ? 'Add it' : 'Cross off')
            : markCommand ? (markCommand.kind === 'med' ? 'Mark taken' : 'Mark done') : 'Save'}
        </PillButton>
        {text && <PillButton type="button" $variant="neutral" onClick={() => { setText(''); setNote(null); }}>Clear</PillButton>}
      </Actions>

      {note && (
        <Note $error={note.error} role={note.error ? 'alert' : 'status'}>
          {note.text}
          {note.id !== undefined && <button type="button" onClick={() => openInJournal(note.id!)}>Open</button>}
          {note.undo && (
            <button type="button" onClick={() => {
              const undo = note.undo!;
              setNote(null);
              void undo().then(() => setNote({ text: 'Undone.' })).catch(() => setNote({ text: 'Couldn’t undo that. Untick it in the list.', error: true }));
            }}>Undo</button>
          )}
        </Note>
      )}

      <Hint>
        Start with the topic, then say the rest. Try “Add task call the dentist due Friday, high priority”, “Add task fix the delete
        option, part of Chronicles”, “Add to-do list weekend chores, first item laundry, second item dishes”, “Log symptom headache
        severity 6” or “Add mantra I am enough”. To tick something off, say “Mark oregano oil taken”, “Mark exercise ocean breathing”, “Cross laundry off my to do’s”
        or “Cross raspberries off the shopping list”. “Add eggs to my shopping list” adds to a list you have, and “Add priority call the bank” to your priorities. With no topic it goes to Journal. End with “and save” to save straight away.
      </Hint>
      <Hint>
        Your browser’s speech service hears what you say (Google in Chrome, Apple in Safari). The entry is encrypted before it’s saved.
      </Hint>
    </Panel>
  );
}
