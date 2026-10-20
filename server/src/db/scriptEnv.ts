/**
 * Maintenance scripts (npm run migrate:tenants, beta, notice, …) read
 * server/.env like the dev server, wherever they're run from. Import this
 * first: the database client checks DATABASE_URL as soon as it loads.
 * Variables already set in the shell win over the file.
 */
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

const envFile = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
