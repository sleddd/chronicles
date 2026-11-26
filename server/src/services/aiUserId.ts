import crypto from 'crypto';

/**
 * The anonymous id both apps send to Anthropic as `metadata.user_id` with every
 * request, so Anthropic can tell one account's requests apart without learning
 * who it is: the first 32 hex characters of
 * HMAC-SHA256(key, "chronicles-ai-user:" + account id). No email, no name, and
 * never the account id itself; the same for the account in Chronicles and in
 * the Chronicles AI app, because the server hands it to both.
 *
 * The key is AI_USER_ID_SECRET. Unset, it is derived from the server secret
 * the server already relies on (SECRETS_ENCRYPTION_KEY, or its older alias
 * CALENDAR_TOKEN_KEY — it can't change without losing the secrets it seals, so
 * the id stays put), and failing that from DATABASE_URL (holds the database
 * password; the one setting the server can't run without). Each under its own
 * label, so the key is never the secret itself. Changing whichever is used
 * changes every id.
 */
export function aiUserIdKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const own = env.AI_USER_ID_SECRET?.trim();
  if (own) return Buffer.from(own, 'utf8');
  const label = 'chronicles:ai-user-id';
  const server = env.SECRETS_ENCRYPTION_KEY || env.CALENDAR_TOKEN_KEY;
  if (server) return crypto.createHmac('sha256', Buffer.from(server, 'base64')).update(label).digest();
  if (env.DATABASE_URL) return crypto.createHmac('sha256', env.DATABASE_URL).update(label).digest();
  // Never the bare account id: no id rather than one that names the account
  throw new Error('No secret for anonymous AI user ids (set AI_USER_ID_SECRET)');
}

export function aiUserIdFor(accountId: number, env: NodeJS.ProcessEnv = process.env): string {
  return crypto.createHmac('sha256', aiUserIdKey(env)).update(`chronicles-ai-user:${accountId}`).digest('hex').slice(0, 32);
}
