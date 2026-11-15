// Checks that sign-in state is shared when the server runs as several
// instances behind a load balancer (rr-proxy.mjs alternates every request).
//   BASE_URL=http://127.0.0.1:3000 node multi-instance-check.mjs
import { softPasskey } from './soft-passkey.mjs';
import crypto from 'node:crypto';
import { generateSecret, generateSync } from 'otplib';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const hex = (n) => crypto.randomBytes(n).toString('hex');
const b64 = (n) => crypto.randomBytes(n).toString('base64');
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };

// A "browser": its own IP and cookie jar
function browser(ip) {
  const jar = new Map();
  return {
    jar,
    async req(method, path, body) {
      const headers = { 'x-requested-with': 'XMLHttpRequest', 'x-forwarded-for': ip };
      if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
      if (body !== undefined) headers['content-type'] = 'application/json';
      const r = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      for (const c of r.headers.getSetCookie()) {
        const [pair] = c.split(';'); const i = pair.indexOf('='); const k = pair.slice(0, i); const v = pair.slice(i + 1);
        if (/expires=Thu, 01 Jan 1970/i.test(c) || v === '') jar.delete(k); else jar.set(k, v);
      }
      const text = await r.text();
      let json; try { json = JSON.parse(text); } catch { json = text; }
      return { status: r.status, json, instance: r.headers.get('x-instance') };
    },
  };
}
let ipSeq = 1;
const freshIp = () => `10.77.${(ipSeq >> 8) & 255}.${ipSeq++ & 255}`;

async function newAccount() {
  const b = browser(freshIp());
  const tag = hex(4);
  const acct = { email: `multi${tag}@load.test`, username: `multi${tag}`, authSecret: hex(32) };
  const r = await b.req('POST', '/api/auth/register', {
    ...acct, encryptedMasterKey: b64(48), kekSalt: b64(16), kekWrapIv: b64(12), recoveryWrappedMK: b64(48), recoveryWrapIv: b64(12),
    recoveryKeyHash: hex(32), recoveryKeySalt: hex(16),
  });
  if (r.status !== 201) throw new Error(`register ${r.status} ${JSON.stringify(r.json)}`);
  return { b, acct };
}

// 1. Sign-in lockout is per email across instances: 10 wrong passwords, each
//    from a different IP, alternate between instances; the 11th try is locked
{
  const { acct } = await newAccount();
  const seen = new Set(); let lockedAt = null;
  for (let i = 1; i <= 12; i++) {
    const r = await browser(freshIp()).req('POST', '/api/auth/login', { email: acct.email, authSecret: hex(32) });
    seen.add(r.instance);
    if (r.status === 429 && lockedAt === null) lockedAt = i;
  }
  const right = await browser(freshIp()).req('POST', '/api/auth/login', { email: acct.email, authSecret: acct.authSecret });
  check('wrong-password lockout counts across instances', lockedAt === 11 && seen.size > 1, `locked on try ${lockedAt}, instances ${[...seen]}`);
  check('a locked email stays locked on every instance', right.status === 429, `right password → ${right.status}`);
}

// 2. Per-IP sign-in limit (20 / 15 min) is shared: from one IP the 21st request is refused
{
  const b = browser(freshIp()); let first429 = null;
  for (let i = 1; i <= 22; i++) {
    const r = await b.req('POST', '/api/auth/login', { email: `nobody${hex(3)}@load.test`, authSecret: hex(32) });
    if (r.status === 429 && first429 === null) first429 = i;
  }
  check('per-IP sign-in limit is shared', first429 === 21, `first 429 on request ${first429}`);
}

// 3. 2FA set up on one instance, enabled on another; sign-in split across both; replay refused
{
  const { b, acct } = await newAccount();
  const setup = await b.req('POST', '/api/auth/2fa/setup');
  const secret = setup.json.secret;
  const enable = await b.req('POST', '/api/auth/2fa/enable', { secret, code: generateSync({ secret }), currentAuthSecret: acct.authSecret });
  check('2FA turns on (setup and enable on different instances)', enable.status === 200 && setup.instance !== enable.instance, `${setup.instance} then ${enable.instance}: ${enable.status}`);

  // Wait for a fresh 30-second step, so the code isn't the one used to enable
  await new Promise(r => setTimeout(r, (30 - (Math.floor(Date.now() / 1000) % 30)) * 1000 + 500));
  const c = browser(freshIp());
  const login = await c.req('POST', '/api/auth/login', { email: acct.email, authSecret: acct.authSecret });
  const code = generateSync({ secret });
  const second = await c.req('POST', '/api/auth/login/2fa', { pendingToken: login.json.pendingToken, code });
  check('pending 2FA sign-in started on one instance finishes on the other', login.json.requires2FA && second.status === 200 && login.instance !== second.instance,
    `${login.instance} → ${second.instance}: ${second.status}`);

  const d = browser(freshIp());
  const login2 = await d.req('POST', '/api/auth/login', { email: acct.email, authSecret: acct.authSecret });
  const replay = await d.req('POST', '/api/auth/login/2fa', { pendingToken: login2.json.pendingToken, code });
  check('a used authenticator code is refused on any instance', replay.status === 401, `replay → ${replay.status} on ${replay.instance}`);
}

// 4. Trusted browser: trust earned on one instance skips the 2FA code on another; forgetting works everywhere
{
  const { b, acct } = await newAccount();
  const setup = await b.req('POST', '/api/auth/2fa/setup');
  const secret = setup.json.secret;
  await b.req('POST', '/api/auth/2fa/enable', { secret, code: generateSync({ secret }), currentAuthSecret: acct.authSecret });
  await new Promise(r => setTimeout(r, (30 - (Math.floor(Date.now() / 1000) % 30)) * 1000 + 500));

  const c = browser(freshIp());
  const login = await c.req('POST', '/api/auth/login', { email: acct.email, authSecret: acct.authSecret });
  const trusted = await c.req('POST', '/api/auth/login/2fa', { pendingToken: login.json.pendingToken, code: generateSync({ secret }), trustBrowser: true });
  const again = await c.req('POST', '/api/auth/login', { email: acct.email, authSecret: acct.authSecret });
  check('a browser trusted on one instance skips the 2FA code on the other',
    trusted.status === 200 && again.status === 200 && !again.json.requires2FA && trusted.instance !== again.instance, `${trusted.instance} → ${again.instance}: requires2FA ${again.json.requires2FA}`);

  const wrong = await c.req('POST', '/api/auth/login', { email: acct.email, authSecret: hex(32) });
  check('a trusted browser still needs the right password', wrong.status === 401, `wrong password → ${wrong.status}`);

  // Sign out everywhere (from the trusted browser's own session) ends every trust, on every instance
  const everywhere = await c.req('POST', '/api/sessions/revoke-all');
  const after = await c.req('POST', '/api/auth/login', { email: acct.email, authSecret: acct.authSecret });
  check('Sign out everywhere ends the trust on every instance', everywhere.status === 200 && after.json.requires2FA === true, `after → requires2FA ${after.json.requires2FA} on ${after.instance}`);
}

// 5. Passkeys: a challenge made on one instance is answered on another, once.
// The instances must expect this origin (their APP_URL / CLIENT_URL) and its host as the RP ID.
{
  const origin = process.env.LOADTEST_ORIGIN ?? 'http://localhost:5173';
  const rpId = new URL(origin).hostname;
  const { b, acct } = await newAccount();
  const key = softPasskey(rpId, origin);
  const wrap = { wrappedMK: 'A'.repeat(64), wrapIv: 'B'.repeat(16) };

  const regOptions = await b.req('POST', '/api/auth/passkeys/register/options');
  const reg = await b.req('POST', '/api/auth/passkeys/register/verify',
    { response: key.attestation(regOptions.json.options.challenge), ...wrap, name: 'Load test', currentAuthSecret: acct.authSecret });
  check('a passkey is added with its challenge made on another instance', reg.status === 201 && regOptions.instance !== reg.instance, `${regOptions.instance} → ${reg.instance}: ${reg.status}`);

  const c = browser(freshIp());
  const options = await c.req('POST', '/api/auth/passkey/options');
  const answer = key.assertion(options.json.options.challenge);
  const signIn = await c.req('POST', '/api/auth/passkey/verify', { response: answer });
  check('passkey sign-in started on one instance finishes on the other', signIn.status === 200 && signIn.json.passkey?.wrappedMK === wrap.wrappedMK && options.instance !== signIn.instance,
    `${options.instance} → ${signIn.instance}: ${signIn.status}`);
  check('/me gives who is signed in and never the key wrap', await (async () => {
    const me = await c.req('GET', '/api/auth/me');
    return me.status === 200 && me.json.user?.email === acct.email && me.json.encryption === undefined;
  })());

  const d = browser(freshIp());
  const replay = await d.req('POST', '/api/auth/passkey/verify', { response: key.assertion(options.json.options.challenge) });
  check('a used passkey challenge is refused on any instance', replay.status === 401, `replay → ${replay.status} on ${replay.instance}`);

  // A passkey touch confirms one action: the token is made on one instance and spent on another, once
  const confirmOptions = await c.req('POST', '/api/auth/confirm/options', { action: 'passkey-remove' });
  const confirmed = await c.req('POST', '/api/auth/confirm/verify', { action: 'passkey-remove', response: key.assertion(confirmOptions.json.options.challenge) });
  const wrongAction = await c.req('DELETE', '/api/auth/account', { confirmToken: confirmed.json.confirmToken });
  const removed = await c.req('POST', '/api/auth/passkeys/remove-all', { confirmToken: confirmed.json.confirmToken });
  const spent = await c.req('POST', '/api/auth/passkeys/remove-all', { confirmToken: confirmed.json.confirmToken });
  check('a passkey confirmation works for its own action only, once, across instances',
    confirmed.status === 200 && wrongAction.status === 401 && removed.status === 200 && spent.status === 401,
    `confirm ${confirmed.status}, other action ${wrongAction.status}, own ${removed.status}, again ${spent.status}`);
}

const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exitCode = failed ? 1 : 0;
