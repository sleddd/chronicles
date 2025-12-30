import dotenv from 'dotenv'
import { defineConfig } from 'prisma/config'

// Load .env.local for local development, .env for production
dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

// Use PRISMA_DATABASE_URL if available, otherwise fallback to DATABASE_URL
const databaseUrl = process.env.PRISMA_DATABASE_URL || process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error('No database URL found. Set PRISMA_DATABASE_URL or DATABASE_URL environment variable.')
}

export default defineConfig({
  schema: 'schema.prisma',
  datasource: {
    url: databaseUrl,
  },
})