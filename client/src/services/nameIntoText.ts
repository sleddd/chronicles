import type { DecryptedPost, EncryptedPostData } from '@shared/crypto/types.js';
import { entries as entriesApi, settings as settingsApi } from './api.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { legacyMigrationAllowed } from './sealedFormats.js';
import { NAME_FIELD_BY_TOPIC } from '../utils/entryText.js';
import { contentWithName } from '../utils/nameFields.js';
import { isTimeTrackingTopic } from '../utils/timeTracking.js';
import { isMediaTopic } from '../utils/media.js';
import { titleFieldOf } from '../components/molecules/fields/UserFieldsForm.js';
import type { TopicCustomFields } from '../types/userFields.js';

/*
 * The name of a name-led entry (a task, a meal, a symptom…) used to live in a
 * field of its own, with a copy in the hidden text. Now the text area's first
 * line IS the name (utils/nameFields), so once per account every entry whose
 * text doesn't start with its name gets the name put in front — everything
 * already in the text is kept after it. Re-saved through the re-seal route,
 * so updated_at stays and an entry edited since loading is skipped (the
 * editor puts the name in front of that one when it's opened). The marker
 * is written once nothing was skipped.
 */

export const NAME_IN_TEXT_MARKER = 'entriesNameInTextV1';

/* Summary-led own topics keep their fields as the entry (no text area): not moved */
const FIELD_LED = ['quote', 'quotes', 'book', 'books', 'music'];

type Topic = { id: number; name: string };

/** The name to put first in this entry's text, or null when it needs nothing */
export function nameToMove(entry: Pick<DecryptedPost, 'content' | 'metadata'>, topics: Topic[], topicFields: TopicCustomFields): string | null {
  const meta = (entry.metadata ?? {}) as Record<string, unknown>;
  const topic = topics.find(t => t.id === meta._taxonomyId);
  if (!topic) return null;
  const cf = (meta._customFields ?? {}) as Record<string, unknown>;
  const lower = topic.name.trim().toLowerCase();
  const key = NAME_FIELD_BY_TOPIC[lower]
    ?? (isTimeTrackingTopic(topic.name) ? 'activityName' : isMediaTopic(topic.name) ? 'mediaTitle' : undefined);
  let name = '';
  if (key) name = typeof cf[key] === 'string' ? (cf[key] as string) : '';
  else if (!FIELD_LED.includes(lower)) {
    const title = titleFieldOf(topicFields[topic.id] ?? []);
    const own = (cf._userFields ?? {}) as Record<string, unknown>;
    if (title && typeof own[title.id] === 'string') name = own[title.id] as string;
  }
  if (!name.trim()) return null;
  return contentWithName(entry.content, name) === entry.content ? null : name;
}

const MAX_PER_REQUEST = 100;
const MAX_BYTES_PER_REQUEST = 3_500_000;

type EncryptPost = (id: number, content: string, metadata: Record<string, unknown>) => Promise<EncryptedPostData>;

/** The one-time move. Returns how many entries got their name put in front. */
export async function moveNamesIntoText(
  decrypted: DecryptedPost[],
  topics: Topic[],
  topicFields: TopicCustomFields,
  encryptPost: EncryptPost,
): Promise<number> {
  // An entry still in a format from before id binding is left alone unless
  // this browser may move older records (sealedFormats.ts): re-saving it would
  // seal whatever the server paired under that id. Left out, the marker waits
  const mayMoveOlder = legacyMigrationAllowed();
  const wanted = decrypted
    .map(e => ({ entry: e, name: nameToMove(e, topics, topicFields) }))
    .filter((x): x is { entry: DecryptedPost; name: string } => x.name !== null);
  const todo = mayMoveOlder ? wanted : wanted.filter(x => !x.entry.needsReseal);
  const held = wanted.length - todo.length;
  let batch: Parameters<typeof entriesApi.reseal>[0] = [];
  let changed: { id: number; content: string }[] = [];
  let bytes = 0;
  let skipped = held;
  let moved = 0;
  const flush = async () => {
    if (!batch.length) return;
    const { resealed } = await entriesApi.reseal(batch);
    skipped += batch.length - resealed;
    // Which ones the server took isn't said: only when all were taken is the store updated
    // (a skipped one is fixed in the editor when it's opened)
    if (resealed === batch.length) {
      const store = useEntriesStore.getState();
      for (const c of changed) store.updateDecryptedEntry(c.id, { content: c.content });
      moved += changed.length;
    }
    batch = []; changed = []; bytes = 0;
  };
  for (const { entry, name } of todo) {
    const content = contentWithName(entry.content, name);
    const enc = await encryptPost(entry.id, content, entry.metadata as Record<string, unknown>);
    const size = enc.contentEncrypted.length + enc.metadataEncrypted.length;
    if (batch.length >= MAX_PER_REQUEST || (batch.length && bytes + size > MAX_BYTES_PER_REQUEST)) await flush();
    batch.push({ id: entry.id, updatedAt: new Date(entry.updatedAt).toISOString(), ...enc });
    changed.push({ id: entry.id, content });
    bytes += size;
  }
  await flush();
  if (skipped === 0) await settingsApi.upsert(NAME_IN_TEXT_MARKER, true);
  return moved;
}

let running: Promise<number> | null = null;

/** moveNamesIntoText, at most once at a time in this tab (the journal and the other views both load) */
export function moveNamesIntoTextOnce(...args: Parameters<typeof moveNamesIntoText>): Promise<number> {
  running ??= moveNamesIntoText(...args).finally(() => { running = null; });
  return running;
}
