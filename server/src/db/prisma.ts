import { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is required');
}
if (process.env.NODE_ENV === 'production' && !databaseUrl.includes('sslmode=require')) {
  throw new Error('DATABASE_URL must include sslmode=require in production');
}

function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

// Each user is a Postgres schema, and a Postgres connection caches the
// catalog of every table it touches, never shrinking it (~50 KB per user per
// connection in the load test). Two things keep that in bounds:
// - a small pool (Prisma's default is CPUs × 2 + 1, sized for the host, not
//   the database): DB_POOL_SIZE, unless DATABASE_URL sets connection_limit
// - fresh connections every DB_POOL_RECYCLE_MINUTES: a new client takes all
//   new queries and the old one is closed once its in-flight work is done.
//   (Closing connections from the database side instead fails the next query
//   on each of them.) 0 turns recycling off.
const POOL_SIZE = envInt('DB_POOL_SIZE', 5);
const RECYCLE_MINUTES = envInt('DB_POOL_RECYCLE_MINUTES', 30);
const DRAIN_MS = 60_000;
// DB_KEEP_WARM_MINUTES: how often to ping the database so it never sleeps (0 = off)
const KEEP_WARM_MINUTES = envInt('DB_KEEP_WARM_MINUTES', 4);

function pooledUrl(url: string): string {
  if (/[?&]connection_limit=/.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}connection_limit=${POOL_SIZE}`;
}

/**
 * A client for one database: capped pool, connections swapped for fresh ones
 * every DB_POOL_RECYCLE_MINUTES. Every caller holds the returned object; it
 * always forwards to the current client.
 */
export function createPooledClient(databaseUrl: string): PrismaClient {
  const url = pooledUrl(databaseUrl);
  const createClient = () => new PrismaClient({ datasources: { db: { url } } });
  let current = createClient();

  if (RECYCLE_MINUTES > 0) {
    setInterval(() => {
      // Open the new pool before it takes over, so no request pays for the
      // connection (close to a second on a hosted database)
      const next = createClient();
      void next.$queryRawUnsafe('SELECT 1').catch(() => undefined).then(() => {
        const old = current;
        current = next;
        setTimeout(() => {
          old.$disconnect().catch(err => console.error('Closing old database pool failed:', err instanceof Error ? err.message : err));
        }, DRAIN_MS).unref();
      });
    }, RECYCLE_MINUTES * 60_000).unref();
  }

  // A serverless database (Prisma Postgres) sleeps when idle and takes ~15 s
  // to answer the first query after, long enough for saves and sign-in checks
  // to time out. A tiny query every few minutes keeps it (and the pool) awake.
  if (KEEP_WARM_MINUTES > 0) {
    setInterval(() => {
      current.$queryRawUnsafe('SELECT 1').catch(() => undefined);
    }, KEEP_WARM_MINUTES * 60_000).unref();
  }

  return new Proxy({} as PrismaClient, {
    get(_target, prop) {
      const value = Reflect.get(current, prop, current);
      return typeof value === 'function' ? value.bind(current) : value;
    },
  });
}

/** The main database: accounts, sessions and the shared tables (and shard 1's user schemas). */
export const prisma = createPooledClient(databaseUrl);
