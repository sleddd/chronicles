/**
 * Structured security event logger.
 * Outputs JSON to stdout for easy parsing by log aggregators.
 * Replace with a proper logging service (e.g., Winston, Pino) when needed.
 */
/**
 * Never written: who it was and where from. A log line holds the event, when,
 * and its details — no account id and no IP address, so the host's log
 * retention keeps no record of who signed in from where. Callers still pass
 * them (it documents the event, and a future private audit store could take
 * them), but nothing here puts them in a log.
 */
const NEVER_LOGGED = new Set(['accountId', 'ip', 'email', 'bucket']);

export function logSecurityEvent(
  event: string,
  options: { accountId?: number; ip?: string; details?: Record<string, unknown> } = {}
): void {
  // The same goes for a detail field that names one
  const details = options.details
    && Object.fromEntries(Object.entries(options.details).filter(([key]) => !NEVER_LOGGED.has(key)));
  const entry = {
    level: 'security',
    event,
    timestamp: new Date().toISOString(),
    ...(details && Object.keys(details).length > 0 && { details }),
  };
  console.log(JSON.stringify(entry));
}
