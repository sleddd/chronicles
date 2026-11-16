// More scenarios, one path at a time, to see which request types cost the most.
//   node scenarios-extra.mjs <scenario> <seconds> <c1,c2,...>
// Scenarios:
//   reads     — light signed-in reads only (/me, topics, settings, doses, finance)
//   saves     — entry updates only (PUT /api/entries/:id)
//   creates   — new entries (reserve an id, then create)
//   sync      — what an app open costs once the browser holds the journal: cursor + changes (nothing new)
//   syncboot  — the whole app open with a warm browser cache
//   shelf     — anonymous visitors paging one public shelf (set up by `shelf-setup`)
//   shelf-setup <items> <coverKB> — give user 0 a public shelf of that size; prints its token
//   settings  — sealed-setting saves (habit ticks, timers, dashboard layout)
//   doses     — dose ticks (PUT /api/doses/:id)
//   loginfail — wrong passwords for known emails (the lockout counters' path)
import fs from 'node:fs';
import crypto from 'node:crypto';
import { api, login, entryBody, runLoad, ipFor } from './lib.mjs';
const [scenario = 'reads', a2 = '20', a3 = '50'] = process.argv.slice(2);
const all = JSON.parse(fs.readFileSync(process.env.USERS_FILE || 'users.json'));
const pick = (w) => all[(w * 7919 + Math.floor(Math.random() * all.length)) % all.length];
const today = new Date().toISOString().slice(0, 10);
const json = (r) => JSON.parse(Buffer.from(r.buf).toString());

const ids = new Map();
async function ownedId(u) {
  if (!ids.has(u.username)) ids.set(u.username, json(await api(u, 'GET', '/api/entries?limit=20')).map(p => p.id));
  const l = ids.get(u.username); return l[Math.floor(Math.random() * l.length)];
}
const cursors = new Map();
async function sync(u) {
  const out = [];
  if (!cursors.has(u.username)) { const c = await api(u, 'GET', '/api/entries/cursor'); cursors.set(u.username, json(c).cursor); out.push(c); }
  const c = await api(u, 'GET', '/api/entries/cursor'); out.push(c);
  out.push(await api(u, 'GET', `/api/entries/changes?since=${cursors.get(u.username)}`));
  cursors.set(u.username, json(c).cursor);
  return out;
}

if (scenario === 'shelf-setup') {
  const u = all[0]; const n = +a2; const kb = +a3;
  const items = Array.from({ length: n }, (_, i) => ({
    title: `Title ${i} ${crypto.randomBytes(4).toString('hex')}`, creator: `Maker ${i % 37}`, year: String(1950 + (i % 75)),
    type: ['book', 'movie', 'tv', 'music'][i % 4], rating: (i % 11) / 2, shelf: ['current', 'want', 'done', 'paused', 'dnf'][i % 5],
    ...(kb > 0 ? { cover: 'data:image/jpeg;base64,' + crypto.randomBytes(kb * 750).toString('base64') } : {}),
  }));
  const r = await api(u, 'PUT', '/api/public-shelf', { title: 'Load test shelf', items });
  const own = json(await api(u, 'GET', '/api/public-shelf'));
  fs.writeFileSync('shelf.json', JSON.stringify({ token: own.publicShelf?.token }));
  console.log(JSON.stringify({ put: r.status, putMs: Math.round(r.ms), bodyMB: +(JSON.stringify(items).length / 1e6).toFixed(1), token: own.publicShelf?.token }));
  process.exit(0);
}

const shelfToken = fs.existsSync('shelf.json') ? JSON.parse(fs.readFileSync('shelf.json')).token : null;
let visitor = 0;
const tasks = {
  reads: (w) => api(pick(w), 'GET', ['/api/topics', '/api/settings', `/api/doses?date=${today}`, '/api/auth/me', '/api/finance/bills'][Math.floor(Math.random() * 5)]),
  saves: async (w) => { const u = pick(w); const id = await ownedId(u); const b = entryBody(id); delete b.id; delete b.isEncrypted; return api(u, 'PUT', `/api/entries/${id}`, b); },
  creates: async (w) => { const u = pick(w); const r = await api(u, 'POST', '/api/entries/ids', { count: 1 }); return [r, await api(u, 'POST', '/api/entries', entryBody(json(r).ids[0]))]; },
  sync: (w) => sync(pick(w)),
  syncboot: async (w) => {
    const u = pick(w);
    const out = [await api(u, 'GET', '/api/auth/me')];
    out.push(...(await Promise.all([
      api(u, 'GET', '/api/consent'), api(u, 'GET', '/api/notice'), sync(u), api(u, 'GET', '/api/topics'), api(u, 'GET', '/api/settings'),
      api(u, 'GET', `/api/doses?date=${today}`), api(u, 'GET', '/api/ai-chat'), api(u, 'GET', '/api/public-shelf'),
    ])).flat());
    return out;
  },
  // Each visitor is its own address (the per-IP limit is 240 / 15 min) reading a random page
  shelf: () => api({ ip: ipFor(5_000_000 + (visitor++ % 200_000)) }, 'GET', `/api/public-shelf/${shelfToken}?page=${1 + Math.floor(Math.random() * 8)}`),
  settings: (w) => api(pick(w), 'PUT', '/api/settings', { key: ['habitLog', 'timeLog', 'dashboardConfig'][Math.floor(Math.random() * 3)], value: { ciphertext: crypto.randomBytes(600).toString('base64'), iv: crypto.randomBytes(12).toString('base64'), v: 2 } }),
  doses: (w) => api(pick(w), 'PUT', `/api/doses/${crypto.randomUUID()}`, { date: today, format: 2, payload: crypto.randomBytes(120).toString('base64'), iv: crypto.randomBytes(12).toString('base64') }),
  loginfail: (w) => login({ ...pick(w), ip: ipFor(9_000_000 + Math.floor(Math.random() * 500_000)), authSecret: crypto.randomBytes(32).toString('hex') }),
};
for (const c of a3.split(',').map(Number)) {
  console.log(JSON.stringify({ scenario, ...(await runLoad({ concurrency: c, seconds: +a2, task: tasks[scenario] })) }));
}
