import { PrismaClient } from '@prisma/client';
import { PrismaClient as PrismaClientEdge } from '@prisma/client/edge';
import { withAccelerate } from '@prisma/extension-accelerate';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import { Pool as PgPool } from 'pg';
import ws from 'ws';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: PgPool | NeonPool | undefined;
};

function isAccelerateUrl(connectionString: string): boolean {
  return connectionString.startsWith('prisma://');
}

function isNeonDatabase(connectionString: string): boolean {
  return connectionString.includes('neon.tech') || connectionString.includes('neon.database');
}

function getOrCreatePool(connectionString: string): PgPool | NeonPool {
  if (globalForPrisma.pool) {
    return globalForPrisma.pool;
  }

  if (isNeonDatabase(connectionString)) {
    neonConfig.webSocketConstructor = ws;
    neonConfig.poolQueryViaFetch = true;
    globalForPrisma.pool = new NeonPool({ connectionString });
  } else {
    // Enable SSL for remote PostgreSQL connections (e.g., Prisma Accelerate's underlying DB)
    globalForPrisma.pool = new PgPool({
      connectionString,
      ssl: { rejectUnauthorized: false },
    });
  }

  return globalForPrisma.pool;
}

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL not found');
  }

  // Use Prisma Accelerate for prisma:// URLs (edge runtime)
  if (isAccelerateUrl(connectionString)) {
    return new PrismaClientEdge().$extends(withAccelerate()) as unknown as PrismaClient;
  }

  const pool = getOrCreatePool(connectionString);

  // Use Neon serverless for Neon databases
  if (isNeonDatabase(connectionString)) {
    const { PrismaNeon } = require('@prisma/adapter-neon');
    const adapter = new PrismaNeon(pool);
    return new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });
  }

  // Use pg adapter for local PostgreSQL (Prisma 7 requires an adapter)
  const adapter = new PrismaPg(pool as PgPool);
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export function getUserSchemaName(accountId: string): string {
  return `user_${accountId}`;
}

function getQueryPool(): NeonPool | PgPool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL not found');
  }
  return getOrCreatePool(connectionString);
}

export async function queryUserSchema<T>(
  schemaName: string,
  query: string,
  params: unknown[] = []
): Promise<T[]> {
  const pool = getQueryPool();

  const client = await pool.connect();
  try {
    const result = await client.query(query.replace(/\$SCHEMA/g, schemaName), params);
    return result.rows as T[];
  } finally {
    client.release();
    // Don't close the pool - it's shared globally
  }
}

export function createUserPool(): NeonPool | PgPool {
  return getQueryPool();
}
