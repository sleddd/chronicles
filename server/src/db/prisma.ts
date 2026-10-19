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

function pooledUrl(url: string): string {
  if (/[?&]connection_limit=/.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}connection_limit=${POOL_SIZE}`;
}

const url = pooledUrl(databaseUrl);
const createClient = () => new PrismaClient({ datasources: { db: { url } } });

let current = createClient();

/** Swap in a fresh client; the old one closes after DRAIN_MS. */
export function recyclePrismaPool(): void {
  const old = current;
  current = createClient();
  setTimeout(() => {
    old.$disconnect().catch(err => console.error('Closing old database pool failed:', err instanceof Error ? err.message : err));
  }, DRAIN_MS).unref();
}

if (RECYCLE_MINUTES > 0) {
  setInterval(recyclePrismaPool, RECYCLE_MINUTES * 60_000).unref();
}

// Every caller holds this one object; it always forwards to the current client
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const value = Reflect.get(current, prop, current);
    return typeof value === 'function' ? value.bind(current) : value;
  },
});
