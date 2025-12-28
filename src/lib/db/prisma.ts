import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Prisma client singleton for global usage
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: Pool | undefined;
};

// Create Prisma client - Prisma 7 uses adapter pattern
function createPrismaClient() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
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

/**
 * Get the schema name for a user based on their account ID
 * Note: This is a utility function - the actual schema name is stored in the Account record
 */
export function getUserSchemaName(accountId: string): string {
  // This is a fallback pattern - actual schema names are generated dynamically
  // and stored in the Account.schemaName field
  return `user_${accountId}`;
}

/**
 * Execute a query in a specific user schema
 * Uses raw pg Pool for schema-specific queries
 */
export async function queryUserSchema<T>(
  schemaName: string,
  query: string,
  params: unknown[] = []
): Promise<T[]> {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
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

/**
 * Get a Pool instance for batch operations in a user schema
 */
export function createUserPool(): Pool {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
  });
}
