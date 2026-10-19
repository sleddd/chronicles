// Runs one scenario at a series of concurrency levels and prints a table row per level.
//   node scenarios.mjs <scenario> <seconds> <c1,c2,...>
// Scenarios:
//   boot    — the app opening: /me, consent, notice, entries?limit=5000, topics, settings, doses, ai-chat
//   steady  — a signed-in user working: 70% light reads, 20% entry saves (update), 10% new entries
//   login   — sign-ins (bcrypt), the CPU-bound path
//   mixed   — 2% sign-ins + 98% steady traffic: shows how logins starve everyone else
//   heavyboot — app open for the heaviest users only (3,000 entries)
import fs from 'node:fs';
import { api, login, entryBody } from './lib.mjs';
const [scenario = 'steady', seconds = '20', levels = '10,50,100'] = process.argv.slice(2);
const all = JSON.parse(fs.readFileSync(process.env.USERS_FILE || 'users.json'));
const pick = (w, pool = all) => pool[(w * 7919 + Math.floor(Math.random() * pool.length)) % pool.length];
const today = new Date().toISOString().slice(0, 10);

async function boot(u) {
  const out = [];
  out.push(await api(u, 'GET', '/api/auth/me'));
  out.push(...await Promise.all([
    api(u, 'GET', '/api/consent'), api(u, 'GET', '/api/notice'),
    api(u, 'GET', '/api/entries?limit=5000'), api(u, 'GET', '/api/topics'), api(u, 'GET', '/api/settings'),
    api(u, 'GET', `/api/doses?date=${today}`), api(u, 'GET', '/api/ai-chat'),
  ]));
  return out;
}

const ids = new Map(); // user -> some entry ids it owns
async function ownedId(u) {
  if (!ids.has(u.username)) {
    const r = await api(u, 'GET', '/api/entries?limit=20');
    ids.set(u.username, JSON.parse(Buffer.from(r.buf)).map(p => p.id));
  }
  const l = ids.get(u.username); return l[Math.floor(Math.random() * l.length)];
}

async function steady(u) {
  const x = Math.random();
  if (x < 0.7) {
    const p = ['/api/topics', '/api/settings', `/api/doses?date=${today}`, '/api/auth/me', '/api/finance/bills'][Math.floor(Math.random() * 5)];
    return api(u, 'GET', p);
  }
  if (x < 0.9) { const id = await ownedId(u); const b = entryBody(id); delete b.id; delete b.isEncrypted; return api(u, 'PUT', `/api/entries/${id}`, b); }
  const r = await api(u, 'POST', '/api/entries/ids', { count: 1 });
  const [id] = JSON.parse(Buffer.from(r.buf)).ids;
  return [r, await api(u, 'POST', '/api/entries', entryBody(id))];
}

const heavy = all.filter(u => u.i % 20 === 0);
const tasks = {
  boot: (w) => boot(pick(w)),
  heavyboot: (w) => boot(pick(w, heavy)),
  steady: (w) => steady(pick(w)),
  login: (w) => login({ ...pick(w) }),
  mixed: async (w) => {
    const u = pick(w);
    if (Math.random() < 0.02) { const r = await login({ ...u }); r.kind = 'login'; return r; }
    return steady(u);
  },
};
const { runLoad } = await import('./lib.mjs');
for (const c of levels.split(',').map(Number)) {
  const res = await runLoad({ concurrency: c, seconds: +seconds, task: tasks[scenario] });
  console.log(JSON.stringify({ scenario, ...res }));
}
