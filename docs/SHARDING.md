# Adding a database shard

Each user is a Postgres schema, and a database comfortably holds a few thousand of
them (see `SCALE_TEST_REPORT.md`). Past that, new users' schemas go on further
databases. Code: `server/src/db/shards.ts`.

## How it works

- The main database (`DATABASE_URL`) keeps accounts, sessions and every shared table.
  It is also shard 1 and holds the schemas of everyone who signed up before any
  other shard existed.
- `accounts.shard_id` records where each user's schema lives. The server adds the
  column at startup if it's missing (every existing account is on shard 1).
- Each request finds the user's database from their schema, once per server
  process. With no extra shards configured there's no lookup at all.
- New accounts go to the first shard (by number) with fewer than `SHARD_CAPACITY`
  accounts. When all are full, they go to the least full one, and the server logs a
  warning to add another.
- Nobody is ever moved automatically.

## Settings

| Variable | Meaning | Default |
|---|---|---|
| `SHARD_DATABASE_URLS` | Extra databases, `2=postgresql://…  3=postgresql://…` (space, newline or `;` between them) | none |
| `SHARD_CAPACITY` | Accounts per shard before new ones go to the next | 5000 |
| `DB_POOL_SIZE` / `DB_POOL_RECYCLE_MINUTES` | Apply to each database's pool | 5 / 30 |

Each shard has its own pool. Its connections count against that database's
`max_connections`, times the number of server instances.

## Adding one

1. Create a new Postgres database. It can be on a new server (the usual choice) or
   the same one. It needs no tables; the server creates each user's schema there.
   Use the same Postgres major version and settings as the main database, including
   `max_locks_per_transaction` (see the backup warning in `SCALE_TEST_REPORT.md`).
2. Add it to `SHARD_DATABASE_URLS` under the next unused number, with
   `sslmode=require` in production, and deploy. On startup the server checks that
   every shard answers. It refuses to start if an account points at a shard the
   setting doesn't list.
3. Set up backups for the new database. Each shard is backed up on its own, and the
   server's backup check covers every shard.

**Never renumber or remove a shard that has accounts.** A shard number must keep
pointing at the same database for as long as anyone's schema is on it.

## Scripts

`phase2-status`, `clear:topic-links` and `account:delete` work across every shard.
Set the same `SHARD_DATABASE_URLS` when running them.
