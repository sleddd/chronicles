import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: 'schema.prisma',
  datasource: {
    url: env('PRISMA_DATABASE_URL') || env('DATABASE_URL'),
  },
})