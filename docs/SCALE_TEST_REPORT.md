# Scale test report — October 2026

This report covers how far the Chronicles API scales and what breaks first as users
grow. Every number below was measured; the harness is in `loadtest/` (see its README)
and can be re-run after fixes.

## Setup

The real server (`server/src/index.ts`) ran against Postgres 16 with default settings
(`max_connections` 100, `max_locks_per_transaction` 64, `shared_buffers` 128 MB) on a
4-core, 15 GB container. The load generator ran on the same machine. Node runs the
API on one main thread, so the numbers are roughly what a 1-CPU instance gives. On a
half-CPU plan, expect the CPU-bound numbers (sign-in, steady traffic) to be about half.

The data set had 1,000 users signed up through the real `/api/auth/register`, with
about 240,000 encrypted entries in a realistic spread: 1 in 20 users heavy (3,000
entries, about two years of meals, doses and check-ins), 5 in 20 medium (1,000),
the rest light (150). Entries are incompressible random bytes the size of real
ciphertext. For the growth tests, 9,000 more empty user schemas were cloned from a
real one, for 10,001 users in all.

## Summary: what broke, and at how many users (before the fixes below)

| Users | What happens | Severity |
|---|---|---|
| Any number | **Sign-ins freeze the whole server.** About 150 sign-ins or sign-ups in one minute is a hard wall; at around 4 at the same moment, everyone's requests stall for 0.2–1.2 s | Critical |
| ~1,000–1,250 | **`pg_dump` backups fail** ("out of shared memory") | Critical, and silent |
| ~1,500–2,000 on a 1 GB database | **Postgres runs out of memory.** Each connection caches the catalog of every user it has served | Critical |
| ~5,000–10,000 | Catalog bloat slows everything: at 10k users, normal traffic is 22% slower and p95 nearly doubles | High |
| Per user: 5,000 entries | **Older entries silently vanish from the app,** including from Export All | High (data) |
| Per user: ~1,450 entries in 15 minutes | Large imports fail partway with 429s | Medium |
| More than one server instance | Running a second instance breaks 2FA sign-in, Remember me and the rate limits | Blocks scaling out |

## Fixes made (same harness, same data)

| Finding | Fix | Before | After |
|---|---|---|---|
| 1. Sign-ins freeze the server | bcrypt in a worker-thread pool (`services/passwordHasher.ts`); 503 + Retry-After when the queue is full | Health check p99 during 16 simultaneous sign-ins: **4,848 ms**; 2.6 sign-ins/s | **6.5 ms**; 8–11 sign-ins/s (scales with cores) |
| | | Mixed traffic, 2% sign-ins, 100 concurrent: 144 req/s, p95 1,688 ms | **447 req/s, p95 155 ms** |
| 2. pg_dump fails | Startup / 6-hourly check that logs the `max_locks_per_transaction` to set (`db/backupCheck.ts`) | ~2,500 users: dump fails, no warning | Warning names 640; with it a full dump (1.1 GB) completes |
| 3. Postgres memory per connection | Pool capped at 5 (`DB_POOL_SIZE`), connections replaced every 30 min (`DB_POOL_RECYCLE_MINUTES`) | 9 connections, caches grow forever | 5 connections, caches reset every 30 min; 0 errors in 213k requests while recycling every minute; throughput unchanged |
| 5. Entries past 5,000 vanish | Client pages through all entries; server orders by `created_at, id`, offset uncapped | 12,021-entry journal: app sees 5,000 | **All 12,021**, no duplicates |
| 6. Imports hit the rate limit | `POST /api/entries/batch` (100 per request, all or none); both importers use it | 3,000-entry import stops at 1,428 with 429 | **All 3,000 in 120 requests, 3 s** |
| 8. Cold start after deploy | One catalog read before the ALTERs | App-open p99 after restart 1,448 ms | **647 ms** (warm: 456 ms) |

Follow-up work (same branch), each verified locally:

| Finding | Fix | Verified |
|---|---|---|
| 4. Schema-per-user ceiling | User schemas spread over several databases (`db/shards.ts`, runbook `docs/SHARDING.md`); today's database is shard 1 | A second database took new sign-ups; entries, topics, finance, doses, settings, deletion and the scripts all work per shard |
| 5. Every open downloads the journal | Encrypted IndexedDB copy in the browser + `GET /api/entries/changes` (trigger-tracked) | Real Chromium, 3,000-entry user: first open 7.44 MB / 1.9 s, later opens ~0 MB / 0.2–0.3 s; a stress check (~5,000 concurrent writes) left the synced copy identical to a fresh download |
| 7. One instance only | Sign-in state and security rate limits in Postgres (`services/sharedState.ts`); Remember me grants sealed with `SECRETS_ENCRYPTION_KEY` | Two instances behind a round-robin proxy: lockouts, per-IP limits, 2FA (split across instances, replay refused) and Remember me all pass; the same check fails 5/8 with the old in-memory state |

## Deploying these changes

1. **Set `SECRETS_ENCRYPTION_KEY`** (32 random bytes, base64: `openssl rand -base64 32`) if it isn't set already. Remember me only works across instances with it.
2. Deploy. On startup the server adds `accounts.shard_id`, the sync trigger function and the two state tables by itself; it waits for that before listening.
3. Right after deploying, run **`npm run migrate:entry-sync`** (server, with the same environment) to set up change tracking for every existing account at once (about 11 seconds per 1,000 accounts locally). Skipping it is safe; each account is then set up on its first request, but hundreds at once under load are slow.
4. Nothing else changes until you add a shard (`docs/SHARDING.md`) or a second instance.

Where it stands now: sign-in bursts no longer freeze the server, and no data is lost from view. Backups are safe as long as you act on the server's warning (or use physical backups). Postgres memory now tracks users *active in the last 30 minutes*, not everyone ever served. At ~50 KB per user per connection over 5 connections, a 1 GB database holds a few thousand users active within any half hour. That supports a much larger registered base. The next real ceiling is schema-per-user itself (finding 4), somewhere around 5,000–10,000 registered users.

## Findings

### 1. Password hashing blocks the event loop (critical)

`bcryptjs` is pure JavaScript, so a cost-12 hash runs on Node's only thread for
**390 ms**. Every sign-in and sign-up does one hash. A sign-in for an unknown email
does one too, as a dummy hash for timing. While a hash runs, no other request on the
server is served.

| Test | Result |
|---|---|
| Sign-ups per second (concurrency 4, 8 or 16) | **2.6/s, flat**: more parallelism only adds queueing (p50 1.5 s → 6.1 s) |
| Sign-ins per second | **2.6–2.8/s, flat** |
| `/api/health` latency, idle | 0.6 ms p50, 2.5 ms p99 |
| …while 1 sign-in is running | 204 ms p95 |
| …while 4 sign-ins run | 204 ms p50, **1.2 s p99** |
| …while 16 sign-ins run | 569 ms p50, **4.8 s p99** |
| Steady traffic alone (100 concurrent) | 1,160 req/s, p95 114 ms |
| Same traffic with just 2% sign-ins | **144 req/s (8× less), p95 1.7 s, p99 4.1 s** |

On average, sign-ins are rare: sessions last 7 days and unlocking is done in the
browser. The trouble is bursts: a launch email, a sign-up push, or the day 7 days
after a big sign-up wave, when those sessions all expire together.

**Fix:** move hashing off the main thread. One option is to swap `bcryptjs` for the
native `bcrypt` package (same hash format, so existing hashes keep working; it runs
in libuv's thread pool). Another is to run `bcryptjs` in a `worker_threads` pool.
Either way, sign-ins run in parallel on every core and stop blocking other requests.
This is a small change with the largest effect in this report.

### 2. pg_dump backups fail at around 1,000–1,250 users (critical)

`pg_dump` locks every table in one transaction. Each user has about 16 tables, and
default Postgres has room for about 6,400 locks (64 × 100 connections). Dumps of
1,000 user schemas worked; 1,250 and above failed every time with `out of shared
memory — You might need to increase max_locks_per_transaction`. At 10,000 users, a
full dump fails within a second.

**Fix:** check what your host's backups use. Physical backups / point-in-time
recovery are not affected; anything that runs `pg_dump` is, including your own
exports. If you rely on `pg_dump`, raise `max_locks_per_transaction` (needed: about
16 × users ÷ max_connections, plus headroom). Then **test a restore**. Long term, see
finding 4.

### 3. Postgres memory grows with every user, per connection (critical)

Postgres keeps a catalog cache per connection, with an entry for every table and
index the connection has touched, and never shrinks it. Prisma keeps its pool
connections open indefinitely (here 9 = CPUs × 2 + 1), so over time each connection
caches every active user.

| Users touched by one connection | Catalog cache |
|---|---|
| 0 | 0.7 MB |
| 500 | 29 MB |
| 1,000 | 51 MB |

That is about **51 KB per user per connection**, measured touching only five of each
user's tables; real use touches more. With 9 connections that is about 0.46 MB of
database RAM per active user. On a 1 GB database, after shared buffers, that runs
out around 1,500–2,000 users: swapping, then crashed connections. After this test,
each Postgres connection was already at about 230 MB resident.

**Fix (short term):** set the pool size explicitly (`?connection_limit=5` on
`DATABASE_URL`). Recycle connections, for example through PgBouncer with
`server_lifetime` set to about 10 minutes, so caches are rebuilt rather than
growing without limit. **Long term:** see finding 4.

### 4. Schema-per-user is the long-term ceiling (high)

Each user is a whole Postgres schema: about 51 relations and 52 files, and 0.35 MB
on disk **before writing anything**.

| | 1,000 users | 10,000 users |
|---|---|---|
| Relations in `pg_class` | 51,515 | 510,515 |
| Files in the database directory | ~52,000 | 515,418 |
| Database size (only 1,000 users have data) | 1.55 GB | 4.7 GB |
| Steady traffic, 50 concurrent | 1,152 req/s, p95 62 ms | **900 req/s, p95 112 ms** |
| Sign-up time | 390 ms | 427 ms |

Findings 2 and 3 both come from this design, and both get worse in a straight line
with users. Schema-per-tenant is generally comfortable into the low thousands, and
hard past about 10,000.

**Fix:** before growing past a few thousand users, move to shared tables keyed by
`account_id`, optionally with row-level security. This is the largest change in the
report. The encryption model doesn't depend on schemas, since every row is already
ciphertext bound to its id.

### 5. Each app open downloads the whole journal (high)

Each app open makes 8 requests, and one of them is `GET /api/entries?limit=5000`,
which returns every entry:

| User | Entries | App-open download |
|---|---|---|
| Light | 150 | 0.36 MB |
| Medium | 1,000 | 2.4 MB |
| Heavy | 3,000 | **7.3 MB** |

The mixed population averaged about 1.2 MB per app open. App opens saturated at
about 55 per second (70 MB/s), with p99 reaching 11 s at 50 concurrent. For heavy
users alone, the limit was about 12 app opens per second, with p95 1.5 s at 25
concurrent. A heavy user on a phone downloads 7 MB, then decrypts 3,000 entries,
every time the app opens or refreshes. Bandwidth is the cost that grows: 1,000 daily
users opening the app 5 times a day is about 180 GB a month.

**The 5,000 cap loses data from view.** The client asks for `limit=5000` once and
never pages, so a user's 5,001st entry pushes their oldest out of the app. It
disappears from search, reports, the calendar and **Export All**. A heavy tracker
(meals, check-ins, doses, symptoms) reaches 5,000 in about 1.5–3.5 years.

**Fix:** sync incrementally. Keep entries in IndexedDB as ciphertext and fetch only
`updated_at > lastSync` (plus a deletion list). Until then, page through
`offset` until a short page comes back, so nothing is dropped.

### 6. Imports hit the per-account rate limit (medium)

Imports create one entry per request, and `apiLimiter` allows 1,500 requests per
account per 15 minutes. An import of more than about 1,450 entries fails partway
with 429s. **Fix:** add a batch create endpoint (like `/reseal`, 100 at a time), or
exempt imports.

### 7. In-memory state blocks running more than one instance (blocks scaling out)

The standard way to get past finding 1's single thread is more instances. These live
only in process memory: the pending 2FA tokens, the TOTP replay guard, the sign-in /
2FA / password-confirm lockout counters, every `express-rate-limit` store, and the
Remember me grants. With two instances behind a load balancer, about half of 2FA
sign-ins would fail (pending token on the other instance). Remember me would fail
the same way, and every limit would double. **Fix:** move them to Postgres or Redis
before adding a second instance. The rate limiters can use a shared store.

### 8. Cold start after each deploy (low)

The first request per user after a restart runs `ensureTopicEncryptionColumns`:
5 `ALTER TABLE` statements, each taking an exclusive lock. Just after a restart, app
opens were 25% slower with p99 3× worse (1.4 s vs 0.47 s); it settles once each user
has been seen. **Fix:** once every schema has the columns, drop the runtime check, or
run it once in `migrate:tenants`.

## What held up well

Ordinary authenticated traffic is efficient. Reads and saves ran at about 1,150
req/s on one thread, with p95 62 ms at 50 concurrent users and 114 ms at 100. Saves
took about 5 ms whether the journal held 150 entries or 3,000; the per-save storage
check scans all entries but costs only about 2 ms at 3,000. Session lookup is one
indexed query. Postgres was never the bottleneck under load: Node's CPU was. No
request errored in any test; overload showed up only as latency.

## Order of fixes

1. Hash passwords off the main thread (finding 1). Small change, needed before launch.
2. Make sure backups work, and test a restore (finding 2). Needed before about 1,000 users.
3. Cap and recycle database connections (finding 3). Needed before about 1,500 users on a 1 GB database.
4. Page or incrementally sync entries (finding 5). Needed before heavy users reach 5,000 entries.
5. Batch imports (finding 6).
6. Shared state, then more instances (finding 7), when one CPU isn't enough.
7. Shared tables instead of schema-per-user (finding 4), before about 5,000–10,000 users.
