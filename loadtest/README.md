# Load tests

Scripts that measure where the API slows down or breaks as users grow. The results and
what they mean are in `docs/SCALE_TEST_REPORT.md`.

**Run against a local or staging server only, never production.** They create
thousands of accounts and push the server to saturation.

## Setup

```bash
# A throwaway Postgres (needs pgcrypto for the entry seeder)
createdb chronicles && psql chronicles -c 'create extension pgcrypto'
cd server && DATABASE_URL=postgresql://postgres@127.0.0.1:5432/chronicles npx prisma db push

# The server, with TRUST_PROXY=1 so each virtual user can look like its own IP
# (otherwise the per-IP sign-in limits stop the test, not the server)
DATABASE_URL=postgresql://postgres@127.0.0.1:5432/chronicles NODE_ENV=development \
  TRUST_PROXY=1 SECRETS_ENCRYPTION_KEY=$(openssl rand -hex 32) node --import tsx server/src/index.ts
```

## Scripts

| Script | What it does |
|---|---|
| `node seed-users.mjs <n> <concurrency> <startIndex>` | Signs up `n` users through the API (also measures sign-up throughput). Saves credentials to `users.json` |
| `psql chronicles -f seed-entries.sql` | Loads random-byte "ciphertext" entries into every user: 1 in 20 users get 3,000, 5 in 20 get 1,000, the rest 150 |
| `node scenarios.mjs <scenario> <seconds> <c1,c2,…>` | Closed-loop load at each concurrency. Scenarios: `boot` (app open), `heavyboot` (app open, 3,000-entry users), `steady` (reads + saves), `login`, `mixed` (2% sign-ins) |
| `node starvation.mjs <loginConcurrency> <seconds>` | Runs sign-ins while timing `/api/health`: shows how long every other request waits behind bcrypt |
| `node smoke.mjs` | One user end to end, to check the harness works |

Each scenario prints one JSON line per concurrency level: requests/sec, p50/p95/p99
latency in ms, error rate, MB/s and status counts.
