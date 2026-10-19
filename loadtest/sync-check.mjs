// Correctness check for incremental entry sync. Writers create, update and
// delete entries non-stop while a syncer applies /changes to a local copy;
// at the end the copy must equal a fresh full load, ciphertext included.
// Each run signs up a fresh account and stays under its request limit
// (1,500 / 15 min): concurrency is what's being tested, not volume.
//   node sync-check.mjs <writers> <writeBudget> <runTag>
import { api, entryBody, makeUser, register, createEntries } from './lib.mjs';
const [writers = '8', budget = '900', tag = String(Date.now() % 100000)] = process.argv.slice(2);
const u = makeUser(Number(tag), 'sync');
if ((await register(u)).status !== 201) throw new Error('sign-up failed');
await createEntries(u, 100, { contentBytes: 200, metaBytes: 80 });
const json = (r) => {
  const body = JSON.parse(Buffer.from(r.buf).toString());
  if (r.status >= 400) throw new Error(`HTTP ${r.status}: ${JSON.stringify(body)}`);
  return body;
};

async function fullLoad() {
  const { cursor } = json(await api(u, 'GET', '/api/entries/cursor'));
  const rows = new Map();
  for (let off = 0; ; off += 5000) {
    const page = json(await api(u, 'GET', `/api/entries?limit=5000${off ? `&offset=${off}` : ''}`));
    for (const e of page) rows.set(e.id, e);
    if (page.length < 5000) break;
  }
  return { cursor, rows };
}

const local = await fullLoad();
let cursor = local.cursor;
const stats = { created: 0, updated: 0, deleted: 0, syncs: 0, resets: 0, applied: 0 };
let ops = 0;
const more = () => ops++ < +budget;
let writing = true;
const known = [...local.rows.keys()];

async function writer() {
  while (more()) {
    const x = Math.random();
    if (x < 0.4 || known.length < 20) {
      const [id] = json(await api(u, 'POST', '/api/entries/ids', { count: 1 })).ids;
      if ((await api(u, 'POST', '/api/entries', entryBody(id, 200, 80))).status === 201) { known.push(id); stats.created++; }
    } else if (x < 0.85) {
      const id = known[Math.floor(Math.random() * known.length)];
      const b = entryBody(id, 200, 80); delete b.id; delete b.isEncrypted;
      if ((await api(u, 'PUT', `/api/entries/${id}`, b)).status === 200) stats.updated++;
    } else {
      const id = known.splice(Math.floor(Math.random() * known.length), 1)[0];
      if ((await api(u, 'DELETE', `/api/entries/${id}`)).status < 300) stats.deleted++;
    }
  }
}

async function syncOnce() {
  const r = json(await api(u, 'GET', `/api/entries/changes?since=${cursor}`));
  stats.syncs++;
  if (r.reset) { stats.resets++; const f = await fullLoad(); local.rows = f.rows; cursor = f.cursor; return; }
  for (const e of r.entries) { local.rows.set(e.id, e); stats.applied++; }
  for (const id of r.deleted) local.rows.delete(id);
  cursor = r.cursor;
}

async function syncer() { while (writing) await syncOnce(); }

const sync = syncer();
await Promise.all(Array.from({ length: +writers }, writer));
writing = false;
await sync;
await syncOnce();

const truth = (await fullLoad()).rows;
let missing = 0, extra = 0, stale = 0;
for (const [id, e] of truth) {
  const l = local.rows.get(id);
  if (!l) missing++;
  else if (l.contentEncrypted !== e.contentEncrypted || l.metadataEncrypted !== e.metadataEncrypted || l.contentIv !== e.contentIv) stale++;
}
for (const id of local.rows.keys()) if (!truth.has(id)) extra++;
console.log(JSON.stringify({ user: u.username, ...stats, entries: truth.size, missing, extra, stale, ok: !missing && !extra && !stale }));
