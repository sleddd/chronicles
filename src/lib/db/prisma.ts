import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { withAccelerate } from '@prisma/extension-accelerate';
import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import { Pool as PgPool } from 'pg';
import ws from 'ws';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function getAccelerateUrl(): string | undefined {
  // PRISMA_DATABASE_URL is the Accelerate proxy URL (starts with prisma://)
  const url = process.env.PRISMA_DATABASE_URL;
  if (url && (url.startsWith('prisma://') || url.startsWith('prisma+postgres://'))) {
    return url;
  }
  return undefined;
}

function getDirectConnectionString(): string {
  // DATABASE_URL is the direct Neon/PostgreSQL connection
  const connectionString = process.env.DATABASE_URL || process.env.PRISMA_DATABASE_URL;
  if (!connectionString) {
    throw new Error('Database connection string not found');
  }
  return connectionString;
}

function isNeonDatabase(connectionString: string): boolean {
  return connectionString.includes('neon.tech') || connectionString.includes('neon.database');
}

function createPrismaClient(): PrismaClient {
  const accelerateUrl = getAccelerateUrl();

  // Use Prisma Accelerate if available (Prisma Postgres)
  // Prisma 7 requires accelerateUrl to be passed explicitly
  if (accelerateUrl) {
    return new PrismaClient({
      accelerateUrl,
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    }).$extends(withAccelerate()) as unknown as PrismaClient;
  }

  // For local development or direct connections
  const connectionString = getDirectConnectionString();

  // Use Neon serverless for Neon databases
  if (isNeonDatabase(connectionString)) {
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
  const connectionString = process.env.DATABASE_URL || process.env.PRISMA_DATABASE_URL;
  if (!connectionString) {
    throw new Error('Database connection string not found');
  }

  if (isNeonDatabase(connectionString)) {
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