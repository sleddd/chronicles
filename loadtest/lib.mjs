// Load-test helpers: synthetic users, an HTTP client and a closed-loop runner.
// Point BASE_URL at a LOCAL or staging server only — never production.
import crypto from 'node:crypto';

export const BASE = process.env.BASE_URL || 'http://127.0.0.1:3001';

const hex = (n) => crypto.randomBytes(n).toString('hex');
const b64 = (n) => crypto.randomBytes(n).toString('base64');

// Each virtual user looks like a different client IP (server must run with
// TRUST_PROXY=1) so per-IP limiters model real traffic, not one test box.
export function ipFor(i) { return `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`; }

export function makeUser(i, run = 'lt') {
  return {
    i, ip: ipFor(i),
    email: `${run}${i}@load.test`, username: `${run}${i}`,
    authSecret: hex(32), token: null,
  };
}

export async function api(user, method, path, body) {
  const headers = { 'x-requested-with': 'XMLHttpRequest', 'x-forwarded-for': user?.ip ?? '10.255.255.255' };
  if (user?.token) headers.authorization = `Bearer ${user.token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const t0 = performance.now();
  const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const buf = await res.arrayBuffer();
  const ms = performance.now() - t0;
  return { status: res.status, ms, bytes: buf.byteLength, headers: res.headers, buf };
}

function tokenFrom(res) {
  const set = res.headers.getSetCookie?.() ?? [];
  for (const c of set) { const m = /chronicle_session=([^;]+)/.exec(c); if (m) return m[1]; }
  return null;
}

export async function register(user) {
  const r = await api(user, 'POST', '/api/auth/register', {
    email: user.email, username: user.username, authSecret: user.authSecret,
    encryptedMasterKey: b64(48), kekSalt: b64(16), kekWrapIv: b64(12),
    recoveryWrappedMK: b64(48), recoveryWrapIv: b64(12),
    recoveryKeyHash: hex(32), recoveryKeySalt: hex(16),
  });
  if (r.status === 201) user.token = tokenFrom(r);
  return r;
}

export async function login(user) {
  const r = await api(user, 'POST', '/api/auth/login', { email: user.email, authSecret: user.authSecret });
  if (r.status === 200) user.token = tokenFrom(r);
  return r;
}

// A realistic encrypted entry: ~1.2 KB of text and ~400 B of metadata before
// AES-GCM + base64 (the server only ever sees opaque base64).
export function entryBody(id, contentBytes = 1200, metaBytes = 400) {
  return { id, format: 3, isEncrypted: true,
    contentEncrypted: b64(contentBytes + 16), contentIv: b64(12),
    metadataEncrypted: b64(metaBytes + 16), metadataIv: b64(12) };
}

export async function createEntries(user, n, opts = {}) {
  let made = 0;
  while (made < n) {
    const count = Math.min(50, n - made);
    const r = await api(user, 'POST', '/api/entries/ids', { count });
    if (r.status !== 200) throw new Error(`ids ${r.status}`);
    const { ids } = JSON.parse(Buffer.from(r.buf).toString());
    for (const id of ids) {
      const c = await api(user, 'POST', '/api/entries', entryBody(id, opts.contentBytes, opts.metaBytes));
      if (c.status !== 201) throw new Error(`create ${c.status} ${Buffer.from(c.buf).toString().slice(0, 120)}`);
    }
    made += count;
  }
}

export function pct(sorted, p) { return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : NaN; }

// Closed-loop load: `concurrency` workers each run `task(workerIndex)` back to
// back for `seconds`. A task returns { status, ms, bytes } (or an array).
export async function runLoad({ concurrency, seconds, task }) {
  const lat = []; const codes = {}; let bytes = 0; let ok = 0; let errs = 0;
  const end = performance.now() + seconds * 1000;
  const t0 = performance.now();
  await Promise.all(Array.from({ length: concurrency }, async (_, w) => {
    while (performance.now() < end) {
      try {
        const out = await task(w);
        for (const r of [].concat(out)) {
          lat.push(r.ms); bytes += r.bytes; codes[r.status] = (codes[r.status] || 0) + 1;
          if (r.status < 400) ok++; else errs++;
        }
      } catch (e) { errs++; codes[e.code || e.message?.slice(0, 40) || 'ERR'] = (codes[e.code || e.message?.slice(0, 40) || 'ERR'] || 0) + 1; }
    }
  }));
  const secs = (performance.now() - t0) / 1000;
  lat.sort((a, b) => a - b);
  return { concurrency, rps: +(ok / secs).toFixed(1), p50: +pct(lat, .5).toFixed(0), p95: +pct(lat, .95).toFixed(0),
    p99: +pct(lat, .99).toFixed(0), errRate: +((errs / Math.max(1, ok + errs)) * 100).toFixed(2), mbps: +(bytes / secs / 1e6).toFixed(1), codes };
}

export async function pool(items, n, fn) {
  let k = 0; const out = [];
  await Promise.all(Array.from({ length: n }, async () => { while (k < items.length) { const i = k++; out[i] = await fn(items[i], i); } }));
  return out;
}
