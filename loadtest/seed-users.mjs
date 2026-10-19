// Registers N users through the API (measures sign-up throughput) and saves
// their credentials to users.json for later phases.
import fs from 'node:fs';
import { makeUser, register, pool, pct } from './lib.mjs';
const N = +(process.argv[2] || 1000), C = +(process.argv[3] || 8), START = +(process.argv[4] || 0);
const users = Array.from({ length: N }, (_, k) => makeUser(START + k));
const lat = []; const codes = {};
const t0 = performance.now();
await pool(users, C, async (u) => { const r = await register(u); lat.push(r.ms); codes[r.status] = (codes[r.status] || 0) + 1; });
const secs = (performance.now() - t0) / 1000; lat.sort((a, b) => a - b);
console.log(JSON.stringify({ N, concurrency: C, secs: +secs.toFixed(1), perSec: +(N / secs).toFixed(1), p50: pct(lat, .5) | 0, p95: pct(lat, .95) | 0, p99: pct(lat, .99) | 0, codes }));
const file = process.env.USERS_FILE || 'users.json';
const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : [];
fs.writeFileSync(file, JSON.stringify(prev.concat(users.filter(u => u.token))));
