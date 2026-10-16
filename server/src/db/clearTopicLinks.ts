/**
 * One-off cleanup: delete the plaintext entry→topic links (post_taxonomies)
 * left from before topics moved into each entry's encrypted metadata. Nothing
 * reads them any more; they only tell the server which entries are, say,
 * Medication or Symptom.
 *
 *   npm run clear:topic-links            # dry run — counts rows per tenant
 *   npm run clear:topic-links -- --apply # deletes them (irreversible)
 *
 * Take a database backup first.
 */
import { prisma } from './prisma.js';
import { escapeSchema } from './escapeSchema.js';

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const accounts = await prisma.account.findMany({ select: { tenantSchemaName: true } });
  let total = 0;
  for (const { tenantSchemaName } of accounts) {
    const s = escapeSchema(tenantSchemaName);
    const [{ count }] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`SELECT COUNT(*) AS count FROM ${s}.post_taxonomies`);
    const n = Number(count);
    total += n;
    if (apply && n > 0) await prisma.$executeRawUnsafe(`DELETE FROM ${s}.post_taxonomies`);
    console.log(`${s}: ${n} link(s)${apply && n > 0 ? ' deleted' : ''}`);
  }
  console.log(apply ? `Deleted ${total} link(s).` : `Dry run: ${total} link(s) would be deleted. Re-run with --apply to delete.`);
}

main()
  .catch(err => { console.error(err instanceof Error ? err.message : err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
