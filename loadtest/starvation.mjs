// While N concurrent sign-ins run, one probe hits /api/health (no DB, no auth)
// back to back. Its latency is pure event-loop wait: how long every other
// user's request is stuck behind bcrypt.
//   node starvation.mjs <loginConcurrency> <seconds>
import fs from 'node:fs';
import { api, login, runLoad, pct } from './lib.mjs';
const [c = '4', seconds = '15'] = process.argv.slice(2);
const all = JSON.parse(fs.readFileSync(process.env.USERS_FILE || 'users.json'));
let stop = false; const probe = [];
const probing = (async () => { while (!stop) { const r = await api(null, 'GET', '/api/health'); probe.push(r.ms); } })();
const res = +c > 0 ? await runLoad({ concurrency: +c, seconds: +seconds, task: (w) => login({ ...all[(w * 31 + Math.floor(Math.random() * all.length)) % all.length] }) })
  : (await new Promise(r => setTimeout(r, +seconds * 1000)), {});
stop = true; await probing; probe.sort((a, b) => a - b);
console.log(JSON.stringify({ loginConcurrency: +c, loginsPerSec: res.rps, loginP95: res.p95, healthProbeP50: +pct(probe, .5).toFixed(1), healthProbeP95: +pct(probe, .95).toFixed(1), healthProbeP99: +pct(probe, .99).toFixed(1), probes: probe.length }));
