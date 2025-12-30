import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import { Pool as PgPool } from 'pg';
import ws from 'ws';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function isNeonDatabase(connectionString: string): boolean {
  return connectionString.includes('neon.tech') || connectionString.includes('neon.database');
}

function createPrismaClient(): PrismaClient {
  // Debug logging for production troubleshooting
  console.log('[Prisma] DATABASE_URL format:', process.env.DATABASE_URL?.substring(0, 20) + '...');

  // Use direct DATABASE_URL connection (bypassing Accelerate due to timeout issues)
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL not found');
  }

  console.log('[Prisma] Using direct connection');

  // Use Neon serverless for Neon databases
  if (isNeonDatabase(connectionString)) {
    console.log('[Prisma] Detected Neon database, using NeonPool with @prisma/adapter-neon');
    neonConfig.webSocketConstructor = ws;
    neonConfig.poolQueryViaFetch = true;
    const pool = new NeonPool({ connectionString });
    const { PrismaNeon } = require('@prisma/adapter-neon');
    const adapter = new PrismaNeon(pool);
    return new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });
  }

  // Use pg adapter for local PostgreSQL (Prisma 7 requires an adapter)
  console.log('[Prisma] Using local PostgreSQL with @prisma/adapter-pg');
  const pool = new PgPool({ connectionString });
  const adapter = new PrismaPg(pool);
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

function createQueryPool(): NeonPool | PgPool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL not found');
  }

  if (isNeonDatabase(connectionString)) {
    neonConfig.webSocketConstructor = ws;
    neonConfig.poolQueryViaFetch = true;
    return new NeonPool({ connectionString });
  }
  return new PgPool({ connectionString });
}

export async function queryUserSchema<T>(
  schemaName: string,
  query: string,
  params: unknown[] = []
): Promise<T[]> {
  const pool = createQueryPool();

  const client = await pool.connect();
  try {
    const result = await client.query(query.replace(/\$SCHEMA/g, schemaName), params);
    return result.rows as T[];
  } finally {
    client.release();
    pool.end();
  }
}

export function createUserPool(): NeonPool | PgPool {
  return createQueryPool();
}
