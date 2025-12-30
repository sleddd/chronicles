import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: Pool | undefined;
};

function createPrismaClient() {
  const pool = new Pool({
    connectionString: process.env.PRISMA_DATABASE_URL,
  });
  globalForPrisma.pool = pool;

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

export async function queryUserSchema<T>(
  schemaName: string,
  query: string,
  params: unknown[] = []
): Promise<T[]> {
  const pool = new Pool({
    connectionString: process.env.PRISMA_DATABASE_URL,
  });

  const client = await pool.connect();
  try {
    const result = await client.query(query.replace(/\$SCHEMA/g, schemaName), params);
    return result.rows as T[];
  } finally {
    client.release();
    await pool.end();
  }
}

export function createUserPool(): Pool {
  return new Pool({
    connectionString: process.env.PRISMA_DATABASE_URL,
  });
}