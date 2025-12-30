import 'dotenv/config'
import { defineConfig } from 'prisma/config'

// Check for both your custom name and the standard Prisma name
const databaseUrl = process.env.PRISMA_DATABASE_URL || process.env.DATABASE_URL

if (!databaseUrl) {
  // This will log in the Vercel build logs so you can see if it's missing
  console.error("❌ Database URL is missing from environment variables.");
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: databaseUrl,
  },
})