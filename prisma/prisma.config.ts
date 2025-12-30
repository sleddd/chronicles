import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    // Looks for both common names automatically
    url: env('PRISMA_DATABASE_URL') || env('DATABASE_URL'),
  },
})