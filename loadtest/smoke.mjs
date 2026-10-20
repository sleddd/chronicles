import { makeUser, register, login, api, createEntries } from './lib.mjs';
const u = makeUser(Date.now() % 100000, 'smoke');
let r = await register(u); console.log('register', r.status, r.ms.toFixed(0) + 'ms', !!u.token);
r = await login(u); console.log('login', r.status, r.ms.toFixed(0) + 'ms');
await createEntries(u, 5);
r = await api(u, 'GET', '/api/entries?limit=5000'); console.log('entries', r.status, r.bytes);
for (const p of ['/api/auth/me','/api/topics','/api/settings','/api/consent','/api/notice','/api/ai-chat','/api/doses?date=2026-10-19','/api/finance/bills'])
  { const x = await api(u, 'GET', p); console.log(p, x.status, x.ms.toFixed(0)+'ms', Buffer.from(x.buf).toString().slice(0,80)); }
