import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import { Pool as PgPool } from 'pg';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function getConnectionString(): string {
  const connectionString = process.env.PRISMA_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Database connection string not found');
  }
  return connectionString;
}

function isNeonDatabase(): boolean {
  const connectionString = getConnectionString();
  return connectionString.includes('neon.tech') || connectionString.includes('neon.database');
}

function createPrismaClient() {
  const connectionString = getConnectionString();

  // Use Neon adapter for Neon databases (Vercel)
  if (isNeonDatabase()) {
    neonConfig.useSecureWebSocket = true;
    neonConfig.pipelineTLS = false;
    neonConfig.pipelineConnect = false;

    const adapter = new PrismaNeon({ connectionString });
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
  const connectionString = process.env.PRISMA_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Database connection string not found');
  }

  if (isNeonDatabase()) {
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